import type { 
  NotebookCommand, 
  NotebookResponse, 
  NotebookMessage,
  CommunicationChannel 
} from './types.mjs';

export class NotebookProtocol {
  private pendingCommands: Map<string, {
    resolve: (response: NotebookResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  private commandIdCounter = 0;

  constructor(private channel: CommunicationChannel) {
    this.channel.onMessage(this.handleMessage.bind(this));
  }

  async sendCommand(command: NotebookCommand, timeoutMs = 30000): Promise<NotebookResponse> {
    const commandId = `cmd_${++this.commandIdCounter}_${Date.now()}`;
    
    const message: NotebookMessage = {
      id: commandId,
      type: 'command',
      payload: command,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`Command timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCommands.set(commandId, { resolve, reject, timeout });
      this.channel.send(message);
    });
  }

  private handleMessage(message: NotebookMessage): void {
    if (message.type === 'response') {
      const pending = this.pendingCommands.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(message.id);
        pending.resolve(message.payload as NotebookResponse);
      }
    }
  }

  close(): void {
    // Clear all pending commands
    this.pendingCommands.forEach((pending, _commandId) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Protocol closed'));
    });
    this.pendingCommands.clear();
    this.channel.close();
  }
}