export interface NotebookEvent {
  type: string;
  sessionId: string;
  timestamp: number;
  data: any;
}

export interface CellExecutionEvent extends NotebookEvent {
  type: 'cell:execution';
  data: {
    cellId: string;
    status: 'started' | 'completed' | 'failed';
    output?: {
      type: 'stdout' | 'stderr';
      data: string;
    };
    exitCode?: number;
  };
}

export interface CellUpdateEvent extends NotebookEvent {
  type: 'cell:updated';
  data: {
    cellId: string;
    cell: any; // CellType from types
  };
}

export interface SessionEvent extends NotebookEvent {
  type: 'session:updated';
  data: {
    session: any; // SessionType from types
  };
}

export interface EventHandler<T extends NotebookEvent = NotebookEvent> {
  (event: T): void | Promise<void>;
}

export interface EventEmitter {
  emit<T extends NotebookEvent>(event: T): void;
  on<T extends NotebookEvent>(eventType: string, handler: EventHandler<T>): void;
  off<T extends NotebookEvent>(eventType: string, handler: EventHandler<T>): void;
}

export interface CommunicationChannel {
  send(message: any): void;
  onMessage(handler: (message: any) => void): void;
  close(): void;
}

export interface NotebookMessage {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}

export interface NotebookCommand {
  type: 'execute' | 'stop' | 'update' | 'create' | 'delete' | 'format';
  sessionId: string;
  cellId?: string;
  payload: any;
}

export interface NotebookResponse {
  commandId: string;
  success: boolean;
  data?: any;
  error?: string;
}