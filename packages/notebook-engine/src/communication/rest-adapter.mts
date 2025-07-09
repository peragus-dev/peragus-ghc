import type { 
  NotebookCommand
} from './types.mjs';
import { NotebookCommandHandler } from './command-handler.mjs';

export interface RestApiConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class RestApiAdapter {
  private commandHandler: NotebookCommandHandler;

  constructor(_config: RestApiConfig) {
    this.commandHandler = new NotebookCommandHandler();
  }

  async executeCell(sessionId: string, cellId: string, options?: any): Promise<any> {
    const command: NotebookCommand = {
      type: 'execute',
      sessionId,
      cellId,
      payload: options || {}
    };

    const response = await this.commandHandler.handleCommand(command);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  }

  async updateCell(sessionId: string, cellId: string, updates: any): Promise<any> {
    const command: NotebookCommand = {
      type: 'update',
      sessionId,
      cellId,
      payload: updates
    };

    const response = await this.commandHandler.handleCommand(command);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  }

  async createCell(sessionId: string, cell: any, index: number): Promise<any> {
    const command: NotebookCommand = {
      type: 'create',
      sessionId,
      payload: { cell, index }
    };

    const response = await this.commandHandler.handleCommand(command);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  }

  async deleteCell(sessionId: string, cellId: string): Promise<any> {
    const command: NotebookCommand = {
      type: 'delete',
      sessionId,
      cellId,
      payload: {}
    };

    const response = await this.commandHandler.handleCommand(command);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  }

  async formatCell(sessionId: string, cellId: string): Promise<any> {
    const command: NotebookCommand = {
      type: 'format',
      sessionId,
      cellId,
      payload: {}
    };

    const response = await this.commandHandler.handleCommand(command);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  }

  // Express.js middleware factory
  createExpressMiddleware() {
    return {
      executeCell: async (req: any, res: any) => {
        try {
          const { sessionId, cellId } = req.params;
          const result = await this.executeCell(sessionId, cellId, req.body);
          res.json({ success: true, data: result });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      },

      updateCell: async (req: any, res: any) => {
        try {
          const { sessionId, cellId } = req.params;
          const result = await this.updateCell(sessionId, cellId, req.body);
          res.json({ success: true, data: result });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      },

      createCell: async (req: any, res: any) => {
        try {
          const { sessionId } = req.params;
          const { cell, index } = req.body;
          const result = await this.createCell(sessionId, cell, index);
          res.json({ success: true, data: result });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      },

      deleteCell: async (req: any, res: any) => {
        try {
          const { sessionId, cellId } = req.params;
          const result = await this.deleteCell(sessionId, cellId);
          res.json({ success: true, data: result });
        } catch (error) {
          res.status(500).json({ 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    };
  }

  getEventEmitter() {
    return this.commandHandler.getEventEmitter();
  }
}