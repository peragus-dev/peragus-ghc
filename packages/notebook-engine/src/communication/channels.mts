import type { CommunicationChannel } from './types.mjs';

export class MemoryChannel implements CommunicationChannel {
  private messageHandler?: (message: any) => void;
  private closed = false;

  send(message: any): void {
    if (this.closed) {
      throw new Error('Channel is closed');
    }
    
    // Simulate async message delivery
    setImmediate(() => {
      if (this.messageHandler && !this.closed) {
        this.messageHandler(message);
      }
    });
  }

  onMessage(handler: (message: any) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    this.closed = true;
    this.messageHandler = undefined;
  }

  isClosed(): boolean {
    return this.closed;
  }
}

export class HttpChannel implements CommunicationChannel {
  private messageHandler?: (message: any) => void;
  private closed = false;

  constructor(private baseUrl: string) {}

  async send(message: any): Promise<void> {
    if (this.closed) {
      throw new Error('Channel is closed');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/notebook/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      
      if (this.messageHandler && !this.closed) {
        this.messageHandler(responseData);
      }
    } catch (error) {
      console.error('Failed to send message over HTTP channel:', error);
      throw error;
    }
  }

  onMessage(handler: (message: any) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    this.closed = true;
    this.messageHandler = undefined;
  }

  isClosed(): boolean {
    return this.closed;
  }
}

export class WebSocketChannel implements CommunicationChannel {
  private messageHandler?: (message: any) => void;
  private ws?: WebSocket;
  private closed = false;

  constructor(private url: string) {}

  async connect(): Promise<void> {
    if (this.closed) {
      throw new Error('Channel is closed');
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => resolve();
        this.ws.onerror = (error) => reject(error);
        this.ws.onclose = () => {
          this.closed = true;
        };
        
        this.ws.onmessage = (event) => {
          if (this.messageHandler && !this.closed) {
            try {
              const message = JSON.parse(event.data);
              this.messageHandler(message);
            } catch (error) {
              console.error('Failed to parse WebSocket message:', error);
            }
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  send(message: any): void {
    if (this.closed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    this.ws.send(JSON.stringify(message));
  }

  onMessage(handler: (message: any) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    this.closed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.messageHandler = undefined;
  }

  isClosed(): boolean {
    return this.closed;
  }
}