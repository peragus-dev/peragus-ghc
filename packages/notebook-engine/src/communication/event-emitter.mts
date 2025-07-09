import type { NotebookEvent, EventHandler, EventEmitter } from './types.mjs';

export class NotebookEventEmitter implements EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  emit<T extends NotebookEvent>(event: T): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${event.type}:`, error);
        }
      });
    }
  }

  on<T extends NotebookEvent>(eventType: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);
  }

  off<T extends NotebookEvent>(eventType: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }

  getEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  getHandlerCount(eventType: string): number {
    return this.handlers.get(eventType)?.size || 0;
  }
}