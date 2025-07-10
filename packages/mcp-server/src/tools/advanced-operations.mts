import { z } from 'zod';
import { mkdirSync } from 'fs';
import type { NotebookAPI } from '@srcbook/notebook-engine';
import type { MCPSessionType, CodeCellType, MarkdownCellType } from '../types.mjs';

// Tool schemas
const notebookExportSchema = z.object({
  session_id: z.string(),
  format: z.enum(['json', 'markdown', 'html', 'pdf']).default('json'),
  include_outputs: z.boolean().default(true),
});

const notebookImportSchema = z.object({
  content: z.string().describe('Notebook content to import'),
  format: z.enum(['json', 'markdown', 'ipynb']).default('json'),
});

const cellVisualizeSchema = z.object({
  session_id: z.string(),
  cell_id: z.string(),
  type: z.enum(['chart', 'table', 'graph', 'auto']).default('auto'),
  options: z.record(z.any()).optional().describe('Visualization-specific options'),
});

// Tool definitions
export const advancedTools = [
  {
    name: 'notebook_export',
    description: 'Exports notebook in various formats',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
        },
        format: {
          type: 'string',
          enum: ['json', 'markdown', 'html', 'pdf'],
          default: 'json',
        },
        include_outputs: {
          type: 'boolean',
          default: true,
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'notebook_import',
    description: 'Imports a notebook from various formats',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Notebook content to import',
        },
        format: {
          type: 'string',
          enum: ['json', 'markdown', 'ipynb'],
          default: 'json',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'cell_visualize',
    description: 'Generates visualizations from cell data',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
        },
        cell_id: {
          type: 'string',
        },
        type: {
          type: 'string',
          enum: ['chart', 'table', 'graph', 'auto'],
          default: 'auto',
        },
        options: {
          type: 'object',
          description: 'Visualization-specific options',
        },
      },
      required: ['session_id', 'cell_id'],
    },
  },
];

// Helper function to export notebook to markdown
function exportToMarkdown(session: MCPSessionType, includeOutputs: boolean): string {
  let markdown = `# ${session.name}\n\n`;
  
  if (session.description) {
    markdown += `${session.description}\n\n`;
  }

  session.cells.forEach((cell) => {
    if (cell.type === 'markdown') {
      markdown += `${(cell as MarkdownCellType).text}\n\n`;
    } else if (cell.type === 'code') {
      const codeCell = cell as CodeCellType;
      markdown += `\`\`\`${codeCell.language || session.language}\n${codeCell.source}\n\`\`\`\n\n`;
      
      if (includeOutputs && (cell as any).outputs) {
        markdown += `**Output:**\n\`\`\`\n${JSON.stringify((cell as any).outputs, null, 2)}\n\`\`\`\n\n`;
      }
    }
  });

  return markdown;
}

// Helper function to import from markdown
function importFromMarkdown(content: string): Partial<MCPSessionType> {
  const lines = content.split('\n');
  const cells: any[] = [];
  let currentCell: any = null;
  let inCodeBlock = false;
  let codeLanguage = '';

  // Extract title from first heading
  const titleMatch = lines[0]?.match(/^#\s+(.+)$/);
  const name = titleMatch ? titleMatch[1] : 'Imported Notebook';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';

    // Check for code block start
    if (line && line.startsWith('```')) {
      if (!inCodeBlock) {
        // Starting a code block
        inCodeBlock = true;
        codeLanguage = line ? line.slice(3).trim() || 'typescript' : 'typescript';
        currentCell = {
          id: `cell_${Date.now()}_${i}`,
          type: 'code',
          language: codeLanguage as 'javascript' | 'typescript',
          source: '',
          filename: `cell_${i}.${codeLanguage === 'javascript' ? 'js' : 'ts'}`,
          status: 'idle',
        };
      } else {
        // Ending a code block
        inCodeBlock = false;
        if (currentCell) {
          cells.push(currentCell);
          currentCell = null;
        }
      }
    } else if (inCodeBlock && currentCell) {
      // Inside a code block
      if (currentCell) currentCell.source += (currentCell.source ? '\n' : '') + line;
    } else if (!inCodeBlock && line && line.trim()) {
      // Markdown content
      if (!currentCell || currentCell.type !== 'markdown') {
        if (currentCell) cells.push(currentCell);
        currentCell = {
          id: `cell_${Date.now()}_${i}`,
          type: 'markdown',
          text: line,
        };
      } else {
        currentCell.text += '\n' + line;
      }
    } else if (!inCodeBlock && line !== undefined && !line.trim() && currentCell && currentCell.type === 'markdown') {
      // End of markdown cell on empty line
      cells.push(currentCell);
      currentCell = null;
    }
  }

  // Don't forget the last cell
  if (currentCell) {
    cells.push(currentCell);
  }

  return {
    name,
    cells,
    language: 'typescript',
  };
}

// Tool handler
export async function handleAdvancedTool(
  toolName: string,
  args: unknown,
  notebookAPI: NotebookAPI,
  sessions: Map<string, any>
) {
  switch (toolName) {
    case 'notebook_export': {
      const params = notebookExportSchema.parse(args);
      
      // Get session
      const session = sessions.get(params.session_id);
      if (!session) {
        throw new Error(`Session ${params.session_id} not found`);
      }

      let exportedContent: string;

      switch (params.format) {
        case 'json':
          exportedContent = JSON.stringify({
            name: session.name,
            description: session.description,
            language: session.language,
            cells: session.cells.map((cell: any) => ({
              id: cell.id,
              type: cell.type,
              content: cell.type === 'code' ? (cell as CodeCellType).source : (cell as MarkdownCellType).text,
              language: cell.type === 'code' ? (cell as CodeCellType).language : undefined,
              outputs: params.include_outputs ? (cell as any).outputs : undefined,
            })),
            tsconfig: session.tsconfig,
          }, null, 2);
          break;

        case 'markdown':
          exportedContent = exportToMarkdown(session, params.include_outputs);
          break;

        case 'html':
          // Simple HTML export
          const markdown = exportToMarkdown(session, params.include_outputs);
          exportedContent = `<!DOCTYPE html>
<html>
<head>
  <title>${session.name}</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    pre { background: #f4f4f4; padding: 10px; overflow-x: auto; }
    code { background: #f4f4f4; padding: 2px 4px; }
  </style>
</head>
<body>
  ${markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
</body>
</html>`;
          break;

        case 'pdf':
          // For PDF, we'd need a proper PDF library
          // For now, return instructions
          exportedContent = 'PDF export requires additional setup. Please use HTML export and convert to PDF.';
          break;

        default:
          throw new Error(`Unsupported export format: ${params.format}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: exportedContent,
          },
        ],
      };
    }

    case 'notebook_import': {
      const params = notebookImportSchema.parse(args);
      
      let sessionData: Partial<MCPSessionType>;

      switch (params.format) {
        case 'json':
          sessionData = JSON.parse(params.content);
          break;

        case 'markdown':
          sessionData = importFromMarkdown(params.content);
          break;

        case 'ipynb':
          // Parse Jupyter notebook format
          const ipynb = JSON.parse(params.content);
          sessionData = {
            name: ipynb.metadata?.title || 'Imported Jupyter Notebook',
            cells: ipynb.cells.map((cell: any, idx: number) => ({
              id: `cell_${Date.now()}_${idx}`,
              type: cell.cell_type === 'code' ? 'code' : 'markdown',
              source: cell.cell_type === 'code' ? (Array.isArray(cell.source) ? cell.source.join('') : cell.source) : undefined,
              text: cell.cell_type === 'markdown' ? (Array.isArray(cell.source) ? cell.source.join('') : cell.source) : undefined,
              language: cell.cell_type === 'code' ? 'typescript' : undefined,
              filename: cell.cell_type === 'code' ? `cell_${idx}.ts` : undefined,
              status: cell.cell_type === 'code' ? 'idle' : undefined,
            })),
            language: 'typescript',
          };
          break;

        default:
          throw new Error(`Unsupported import format: ${params.format}`);
      }

      // Create new session with imported data
      const sessionId = `session_${Date.now()}_import`;
      const sessionDir = `/tmp/srcbook-sessions/${sessionId}`;
      
      // Create the directory structure
      mkdirSync(`${sessionDir}/src`, { recursive: true });
      
      const session: MCPSessionType = {
        id: sessionId,
        name: sessionData.name || 'Imported Notebook',
        description: sessionData.description || '',
        dir: sessionDir,
        cells: sessionData.cells || [],
        language: sessionData.language || 'typescript',
        'tsconfig.json': JSON.stringify(sessionData.tsconfig || {
          compilerOptions: {
            target: 'ES2022',
            module: 'ES2022',
            lib: ['ES2022'],
            strict: true,
          },
        }, null, 2),
        openedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Extract base session for NotebookAPI
      const baseSession = {
        id: session.id,
        dir: session.dir,
        cells: session.cells,
        language: session.language,
        openedAt: session.openedAt,
        'tsconfig.json': session['tsconfig.json'],
      };
      notebookAPI.createSession(baseSession);
      
      // Store the full MCPSessionType in the sessions map
      sessions.set(sessionId, session);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              session_id: sessionId,
              name: session.name,
              cell_count: session.cells.length,
              language: session.language,
            }, null, 2),
          },
        ],
      };
    }

    case 'cell_visualize': {
      const params = cellVisualizeSchema.parse(args);
      
      // Get session and cell
      const session = sessions.get(params.session_id);
      if (!session) {
        throw new Error(`Session ${params.session_id} not found`);
      }

      const cell = session.cells.find((c: any) => c.id === params.cell_id);
      if (!cell || cell.type !== 'code') {
        throw new Error(`Code cell ${params.cell_id} not found`);
      }

      // For now, return a placeholder response
      // In a real implementation, this would execute the cell and generate visualizations
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              visualization: {
                type: params.type,
                cell_id: params.cell_id,
                message: 'Visualization generation requires cell execution and data analysis. This is a placeholder response.',
                options: params.options,
              },
            }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown advanced tool: ${toolName}`);
  }
}