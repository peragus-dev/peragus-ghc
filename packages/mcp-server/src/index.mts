import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  Resource,
} from '@modelcontextprotocol/sdk/types.js';
import { NotebookAPI } from '@srcbook/notebook-engine';
import { z } from 'zod';

// Import tool handlers
import { notebookTools, handleNotebookTool } from './tools/notebook-management.mjs';
import { cellTools, handleCellTool } from './tools/cell-operations.mjs';
import { advancedTools, handleAdvancedTool } from './tools/advanced-operations.mjs';

// Import resource providers
import { notebookResources, readNotebookResource } from './resources/notebook-resources.mjs';

export class SrcbookMCPServer {
  private server: Server;
  private notebookAPI: NotebookAPI;
  private sessions: Map<string, any>;

  constructor() {
    this.server = new Server(
      {
        name: 'srcbook-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.notebookAPI = new NotebookAPI();
    this.sessions = new Map();

    this.setupHandlers();
  }

  private setupHandlers() {
    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        ...notebookTools,
        ...cellTools,
        ...advancedTools,
      ] as Tool[],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Notebook management tools
        if (notebookTools.some(tool => tool.name === name)) {
          return await handleNotebookTool(name, args, this.notebookAPI, this.sessions);
        }

        // Cell operation tools
        if (cellTools.some(tool => tool.name === name)) {
          return await handleCellTool(name, args, this.notebookAPI, this.sessions);
        }

        // Advanced operation tools
        if (advancedTools.some(tool => tool.name === name)) {
          return await handleAdvancedTool(name, args, this.notebookAPI, this.sessions);
        }

        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(`Invalid arguments: ${error.message}`);
        }
        throw error;
      }
    });

    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: notebookResources(this.sessions) as Resource[],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      return await readNotebookResource(uri, this.sessions);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Srcbook MCP server running...');
  }
}

// Export for CLI usage
export async function startServer() {
  const server = new SrcbookMCPServer();
  await server.run();
}