import type { 
  NotebookCommand, 
  NotebookResponse,
  NotebookEvent
} from './types.mjs';
import { NotebookAPI } from '../api.mjs';
import { NotebookEventEmitter } from './event-emitter.mjs';

export class NotebookCommandHandler {
  private api: NotebookAPI;
  private eventEmitter: NotebookEventEmitter;

  constructor() {
    this.api = new NotebookAPI();
    this.eventEmitter = new NotebookEventEmitter();
  }

  async handleCommand(command: NotebookCommand): Promise<NotebookResponse> {
    const commandId = `${command.type}_${Date.now()}`;
    
    try {
      let result: any;
      
      switch (command.type) {
        case 'execute':
          result = await this.handleExecuteCommand(command);
          break;
        
        case 'stop':
          result = await this.handleStopCommand(command);
          break;
        
        case 'update':
          result = await this.handleUpdateCommand(command);
          break;
        
        case 'create':
          result = await this.handleCreateCommand(command);
          break;
        
        case 'delete':
          result = await this.handleDeleteCommand(command);
          break;
        
        case 'format':
          result = await this.handleFormatCommand(command);
          break;
        
        default:
          throw new Error(`Unknown command type: ${command.type}`);
      }

      return {
        commandId,
        success: true,
        data: result
      };
    } catch (error) {
      return {
        commandId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleExecuteCommand(command: NotebookCommand): Promise<any> {
    const { sessionId, cellId } = command;
    if (!cellId) {
      throw new Error('cellId is required for execute command');
    }

    this.emitEvent({
      type: 'cell:execution',
      sessionId,
      timestamp: Date.now(),
      data: {
        cellId,
        status: 'started'
      }
    });

    try {
      const result = await this.api.executeCell(sessionId, cellId, command.payload);
      
      this.emitEvent({
        type: 'cell:execution',
        sessionId,
        timestamp: Date.now(),
        data: {
          cellId,
          status: result.exitCode === 0 ? 'completed' : 'failed',
          exitCode: result.exitCode,
          output: {
            type: 'stdout',
            data: result.stdout
          }
        }
      });

      if (result.stderr) {
        this.emitEvent({
          type: 'cell:execution',
          sessionId,
          timestamp: Date.now(),
          data: {
            cellId,
            status: 'completed',
            output: {
              type: 'stderr',
              data: result.stderr
            }
          }
        });
      }

      return result;
    } catch (error) {
      this.emitEvent({
        type: 'cell:execution',
        sessionId,
        timestamp: Date.now(),
        data: {
          cellId,
          status: 'failed'
        }
      });
      throw error;
    }
  }

  private async handleStopCommand(_command: NotebookCommand): Promise<any> {
    // Process stopping would need ProcessManager integration
    throw new Error('Stop command not implemented yet');
  }

  private async handleUpdateCommand(command: NotebookCommand): Promise<any> {
    const { sessionId, cellId } = command;
    if (!cellId) {
      throw new Error('cellId is required for update command');
    }

    const result = this.api.updateCell(sessionId, cellId, command.payload);
    
    this.emitEvent({
      type: 'cell:updated',
      sessionId,
      timestamp: Date.now(),
      data: {
        cellId,
        cell: result.cells.find(c => c.id === cellId)
      }
    });

    return result;
  }

  private async handleCreateCommand(command: NotebookCommand): Promise<any> {
    const { sessionId } = command;
    const { cell, index } = command.payload;

    const result = this.api.addCell(sessionId, cell, index);
    
    this.emitEvent({
      type: 'cell:updated',
      sessionId,
      timestamp: Date.now(),
      data: {
        cellId: cell.id,
        cell
      }
    });

    return result;
  }

  private async handleDeleteCommand(command: NotebookCommand): Promise<any> {
    const { sessionId, cellId } = command;
    if (!cellId) {
      throw new Error('cellId is required for delete command');
    }

    const result = this.api.removeCell(sessionId, cellId);
    
    this.emitEvent({
      type: 'cell:updated',
      sessionId,
      timestamp: Date.now(),
      data: {
        cellId,
        cell: null // Indicates deletion
      }
    });

    return result;
  }

  private async handleFormatCommand(_command: NotebookCommand): Promise<any> {
    // Format command would need integration with formatting logic
    throw new Error('Format command not implemented yet');
  }

  private emitEvent(event: NotebookEvent): void {
    this.eventEmitter.emit(event);
  }

  getEventEmitter(): NotebookEventEmitter {
    return this.eventEmitter;
  }
}