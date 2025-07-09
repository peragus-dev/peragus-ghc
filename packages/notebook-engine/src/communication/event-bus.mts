import type { 
  NotebookEvent, 
  EventHandler,
  CellExecutionEvent,
  CellUpdateEvent,
  SessionEvent 
} from './types.mjs';
import { NotebookEventEmitter } from './event-emitter.mjs';

export class NotebookEventBus extends NotebookEventEmitter {
  private middlewares: Array<(event: NotebookEvent, next: () => void) => void> = [];
  
  // Add middleware for event processing
  use(middleware: (event: NotebookEvent, next: () => void) => void): void {
    this.middlewares.push(middleware);
  }

  emit<T extends NotebookEvent>(event: T): void {
    this.runMiddlewares(event, () => {
      super.emit(event);
    });
  }

  private runMiddlewares(event: NotebookEvent, finalCallback: () => void): void {
    let index = 0;
    
    const next = () => {
      if (index >= this.middlewares.length) {
        finalCallback();
        return;
      }
      
      const middleware = this.middlewares[index++];
      middleware?.(event, next);
    };
    
    next();
  }

  // Convenience methods for specific event types
  onCellExecution(handler: EventHandler<CellExecutionEvent>): void {
    this.on('cell:execution', handler);
  }

  onCellUpdate(handler: EventHandler<CellUpdateEvent>): void {
    this.on('cell:updated', handler);
  }

  onSessionUpdate(handler: EventHandler<SessionEvent>): void {
    this.on('session:updated', handler);
  }

  emitCellExecution(sessionId: string, cellId: string, status: 'started' | 'completed' | 'failed', data?: any): void {
    const event: CellExecutionEvent = {
      type: 'cell:execution',
      sessionId,
      timestamp: Date.now(),
      data: {
        cellId,
        status,
        ...data
      }
    };
    this.emit(event);
  }

  emitCellUpdate(sessionId: string, cellId: string, cell: any): void {
    const event: CellUpdateEvent = {
      type: 'cell:updated',
      sessionId,
      timestamp: Date.now(),
      data: {
        cellId,
        cell
      }
    };
    this.emit(event);
  }

  emitSessionUpdate(sessionId: string, session: any): void {
    const event: SessionEvent = {
      type: 'session:updated',
      sessionId,
      timestamp: Date.now(),
      data: {
        session
      }
    };
    this.emit(event);
  }
}

// Built-in middleware functions
export const loggingMiddleware = (event: NotebookEvent, next: () => void) => {
  console.log(`[${new Date().toISOString()}] Event: ${event.type} for session ${event.sessionId}`);
  next();
};

export const timingMiddleware = (event: NotebookEvent, next: () => void) => {
  const start = Date.now();
  next();
  const duration = Date.now() - start;
  console.log(`Event ${event.type} processed in ${duration}ms`);
};

export const errorHandlingMiddleware = (event: NotebookEvent, next: () => void) => {
  try {
    next();
  } catch (error) {
    console.error(`Error processing event ${event.type}:`, error);
    // Could emit an error event here
  }
};