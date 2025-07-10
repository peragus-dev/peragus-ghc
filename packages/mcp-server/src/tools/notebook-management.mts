import { z } from 'zod';
import { mkdirSync, writeFileSync } from 'fs';
import type { NotebookAPI } from '@srcbook/notebook-engine';
import type { MCPSessionType } from '../types.mjs';
import { nanoid } from 'nanoid';

// Tool schemas
const notebookCreateSchema = z.object({
  name: z.string().describe('Human-readable notebook name'),
  language: z.enum(['typescript', 'javascript']).default('typescript'),
  description: z.string().optional().describe('Notebook purpose/description'),
  tsconfig: z.record(z.any()).optional().describe('TypeScript compiler options'),
});

const notebookListSchema = z.object({
  filter: z.enum(['active', 'suspended', 'all']).default('active'),
});

const notebookDeleteSchema = z.object({
  session_id: z.string().describe('Notebook session identifier'),
});

// Tool definitions
export const notebookTools = [
  {
    name: 'notebook_create',
    description: 'Creates a new notebook session with specified configuration',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Human-readable notebook name',
        },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript'],
          default: 'typescript',
        },
        description: {
          type: 'string',
          description: 'Notebook purpose/description',
        },
        tsconfig: {
          type: 'object',
          description: 'TypeScript compiler options',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'notebook_list',
    description: 'Lists all active notebook sessions',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['active', 'suspended', 'all'],
          default: 'active',
        },
      },
    },
  },
  {
    name: 'notebook_delete',
    description: 'Terminates and cleans up a notebook session',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Notebook session identifier',
        },
      },
      required: ['session_id'],
    },
  },
];

// Tool handler
export async function handleNotebookTool(
  toolName: string,
  args: unknown,
  notebookAPI: NotebookAPI,
  sessions: Map<string, any>
) {
  switch (toolName) {
    case 'notebook_create': {
      const params = notebookCreateSchema.parse(args);
      
      // Create a unique session directory
      const sessionId = `session_${Date.now()}_${nanoid(8)}`;
      const sessionDir = `/tmp/srcbook-sessions/${sessionId}`;
      
      // Create the directory structure
      mkdirSync(`${sessionDir}/src`, { recursive: true });
      
      // Create package.json file for npm execution
      const packageJson = {
        name: sessionId,
        version: "1.0.0",
        type: "module",
        dependencies: {},
        devDependencies: {
          "@types/node": "^20.0.0",
          "typescript": "^5.0.0"
        }
      };
      writeFileSync(`${sessionDir}/package.json`, JSON.stringify(packageJson, null, 2));
      
      // Create tsconfig.json file
      const tsconfig = params.tsconfig || {
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          lib: ['ES2022'],
          strict: true,
          moduleResolution: 'node',
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true
        }
      };
      writeFileSync(`${sessionDir}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));
      
      // Create the session
      const session: MCPSessionType = {
        id: sessionId,
        name: params.name,
        description: params.description || '',
        dir: sessionDir,
        cells: [],
        language: params.language as 'typescript' | 'javascript',
        'tsconfig.json': JSON.stringify(params.tsconfig || {
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

      // Store in NotebookAPI
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
              name: params.name,
              language: params.language,
              created_at: new Date(session.createdAt).toISOString(),
            }, null, 2),
          },
        ],
      };
    }

    case 'notebook_list': {
      const params = notebookListSchema.parse(args);
      
      // Get all sessions from the map
      const allSessions = Array.from(sessions.values());
      
      // Filter based on the requested filter
      const filteredSessions = allSessions.filter(session => {
        if (params.filter === 'all') return true;
        if (params.filter === 'active') return session.status !== 'suspended';
        if (params.filter === 'suspended') return session.status === 'suspended';
        return true;
      });

      const sessionList = filteredSessions.map(session => ({
        session_id: session.id,
        name: session.name,
        language: session.language,
        description: session.description,
        cell_count: session.cells.length,
        created_at: session.createdAt ? new Date(session.createdAt).toISOString() : new Date().toISOString(),
        updated_at: session.updatedAt ? new Date(session.updatedAt).toISOString() : new Date().toISOString(),
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sessionList, null, 2),
          },
        ],
      };
    }

    case 'notebook_delete': {
      const params = notebookDeleteSchema.parse(args);
      
      // Check if session exists
      if (!sessions.has(params.session_id)) {
        throw new Error(`Session ${params.session_id} not found`);
      }

      // Delete from both NotebookAPI and local sessions map
      notebookAPI.deleteSession(params.session_id);
      sessions.delete(params.session_id);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted notebook session: ${params.session_id}`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown notebook tool: ${toolName}`);
  }
}