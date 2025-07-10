import { z } from 'zod';
import type { NotebookAPI } from '@srcbook/notebook-engine';
import type { CodeCellType, MarkdownCellType } from '../types.mjs';
import { nanoid } from 'nanoid';

// Tool schemas
const cellAddSchema = z.object({
  session_id: z.string(),
  type: z.enum(['code', 'markdown']).default('code'),
  content: z.string().describe('Cell content (code or markdown)'),
  position: z.number().optional().describe('Insert position (default: end)'),
});

const cellExecuteSchema = z.object({
  session_id: z.string(),
  cell_id: z.string().describe('Specific cell ID or "all" for all cells'),
  timeout: z.number().default(30000).describe('Execution timeout in milliseconds'),
});

const cellUpdateSchema = z.object({
  session_id: z.string(),
  cell_id: z.string(),
  content: z.string().describe('New cell content'),
});

const cellDeleteSchema = z.object({
  session_id: z.string(),
  cell_id: z.string(),
});

// Tool definitions
export const cellTools = [
  {
    name: 'cell_add',
    description: 'Adds a new cell to the notebook',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
        },
        type: {
          type: 'string',
          enum: ['code', 'markdown'],
          default: 'code',
        },
        content: {
          type: 'string',
          description: 'Cell content (code or markdown)',
        },
        position: {
          type: 'integer',
          description: 'Insert position (default: end)',
        },
      },
      required: ['session_id', 'content'],
    },
  },
  {
    name: 'cell_execute',
    description: 'Executes a code cell and returns results',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
        },
        cell_id: {
          type: 'string',
          description: 'Specific cell ID or "all" for all cells',
        },
        timeout: {
          type: 'integer',
          description: 'Execution timeout in milliseconds',
          default: 30000,
        },
      },
      required: ['session_id', 'cell_id'],
    },
  },
  {
    name: 'cell_update',
    description: "Updates an existing cell's content",
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
        },
        cell_id: {
          type: 'string',
        },
        content: {
          type: 'string',
          description: 'New cell content',
        },
      },
      required: ['session_id', 'cell_id', 'content'],
    },
  },
  {
    name: 'cell_delete',
    description: 'Removes a cell from the notebook',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
        },
        cell_id: {
          type: 'string',
        },
      },
      required: ['session_id', 'cell_id'],
    },
  },
];

// Tool handler
export async function handleCellTool(
  toolName: string,
  args: unknown,
  notebookAPI: NotebookAPI,
  sessions: Map<string, any>
) {
  switch (toolName) {
    case 'cell_add': {
      const params = cellAddSchema.parse(args);
      
      // Verify session exists
      const session = sessions.get(params.session_id);
      if (!session) {
        throw new Error(`Session ${params.session_id} not found`);
      }

      // Create new cell
      const cellId = `cell_${nanoid(8)}`;
      const cell: CodeCellType | MarkdownCellType = params.type === 'code' 
        ? {
            id: cellId,
            type: 'code',
            source: params.content,
            language: session.language || 'typescript',
            filename: `cell_${cellId}.${session.language === 'javascript' ? 'js' : 'ts'}`,
            status: 'idle' as const,
          }
        : {
            id: cellId,
            type: 'markdown',
            text: params.content,
          };

      // Add cell at specified position or end
      const position = params.position ?? session.cells.length;
      const updatedSession = notebookAPI.addCell(params.session_id, cell, position);
      
      // Preserve extended metadata from MCPSessionType
      const mergedSession = { ...session, ...updatedSession };
      sessions.set(params.session_id, mergedSession);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              cell_id: cellId,
              position,
              type: params.type,
            }, null, 2),
          },
        ],
      };
    }

    case 'cell_execute': {
      const params = cellExecuteSchema.parse(args);
      
      // Verify session exists
      if (!sessions.has(params.session_id)) {
        throw new Error(`Session ${params.session_id} not found`);
      }

      try {
        if (params.cell_id === 'all') {
          // Execute all cells
          const results = await notebookAPI.executeAllCells(params.session_id, {
            timeout: params.timeout,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  executed_cells: results.length,
                  results: results.map((result, index) => ({
                    cell_index: index,
                    success: result.exitCode === 0,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exit_code: result.exitCode,
                    signal: result.signal,
                  })),
                }, null, 2),
              },
            ],
          };
        } else {
          // Execute single cell
          const result = await notebookAPI.executeCell(
            params.session_id, 
            params.cell_id,
            { timeout: params.timeout }
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  cell_id: params.cell_id,
                  success: result.exitCode === 0,
                  stdout: result.stdout,
                  stderr: result.stderr,
                  exit_code: result.exitCode,
                  signal: result.signal,
                }, null, 2),
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                cell_id: params.cell_id,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'cell_update': {
      const params = cellUpdateSchema.parse(args);
      
      // Verify session exists
      if (!sessions.has(params.session_id)) {
        throw new Error(`Session ${params.session_id} not found`);
      }

      // Get current session to preserve metadata
      const currentSession = sessions.get(params.session_id);
      if (!currentSession) {
        throw new Error(`Session ${params.session_id} not found`);
      }
      
      const updatedSession = notebookAPI.updateCell(
        params.session_id,
        params.cell_id,
        { source: params.content }
      );
      
      // Preserve extended metadata from MCPSessionType
      const mergedSession = { ...currentSession, ...updatedSession };
      sessions.set(params.session_id, mergedSession);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully updated cell ${params.cell_id}`,
          },
        ],
      };
    }

    case 'cell_delete': {
      const params = cellDeleteSchema.parse(args);
      
      // Verify session exists
      if (!sessions.has(params.session_id)) {
        throw new Error(`Session ${params.session_id} not found`);
      }

      // Get current session to preserve metadata
      const currentSession = sessions.get(params.session_id);
      if (!currentSession) {
        throw new Error(`Session ${params.session_id} not found`);
      }
      
      const updatedSession = notebookAPI.removeCell(params.session_id, params.cell_id);
      
      // Preserve extended metadata from MCPSessionType
      const mergedSession = { ...currentSession, ...updatedSession };
      sessions.set(params.session_id, mergedSession);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted cell ${params.cell_id}`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown cell tool: ${toolName}`);
  }
}