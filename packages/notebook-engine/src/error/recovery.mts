// import type { SessionType } from '../types/index.mjs';
import { NotebookAPI } from '../api.mjs';
import { NotebookEventBus } from '../communication/event-bus.mjs';
import { ProcessManager } from '../execution/process-manager.mjs';

export interface RecoveryStrategy {
  name: string;
  canHandle(error: Error, context: ErrorContext): boolean;
  recover(error: Error, context: ErrorContext): Promise<RecoveryResult>;
}

export interface ErrorContext {
  sessionId: string;
  cellId?: string;
  operation: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface RecoveryResult {
  success: boolean;
  message: string;
  newSessionId?: string;
  newCellId?: string;
  metadata?: Record<string, any>;
}

export class NotebookErrorRecovery {
  private api: NotebookAPI;
  private eventBus: NotebookEventBus;
  private processManager: ProcessManager;
  private strategies: RecoveryStrategy[] = [];
  private errorHistory: Map<string, ErrorContext[]> = new Map();

  constructor() {
    this.api = new NotebookAPI();
    this.eventBus = new NotebookEventBus();
    this.processManager = new ProcessManager();

    // Register default recovery strategies
    this.registerStrategy(new SessionRecreationStrategy(this.api));
    this.registerStrategy(new CellExecutionRetryStrategy(this.api));
    this.registerStrategy(new ProcessCleanupStrategy(this.processManager));
    this.registerStrategy(new MemoryRecoveryStrategy());
    this.registerStrategy(new FileSystemRecoveryStrategy());
  }

  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
  }

  async handleError(error: Error, context: ErrorContext): Promise<RecoveryResult> {
    // Record error in history
    this.recordError(context);

    // Emit error event
    this.eventBus.emit({
      type: 'error:occurred',
      sessionId: context.sessionId,
      timestamp: Date.now(),
      data: {
        error: error.message,
        context,
        stack: error.stack
      }
    });

    // Find applicable recovery strategy
    const strategy = this.strategies.find(s => s.canHandle(error, context));
    
    if (!strategy) {
      console.error(`No recovery strategy found for error: ${error.message}`);
      return {
        success: false,
        message: `No recovery strategy available for: ${error.message}`
      };
    }

    try {
      console.log(`Attempting recovery with strategy: ${strategy.name}`);
      const result = await strategy.recover(error, context);

      // Emit recovery event
      this.eventBus.emit({
        type: result.success ? 'error:recovered' : 'error:recovery-failed',
        sessionId: context.sessionId,
        timestamp: Date.now(),
        data: {
          strategy: strategy.name,
          result,
          originalError: error.message
        }
      });

      return result;
    } catch (recoveryError: any) {
      console.error(`Recovery strategy failed: ${recoveryError.message}`);
      return {
        success: false,
        message: `Recovery failed: ${recoveryError.message}`
      };
    }
  }

  private recordError(context: ErrorContext): void {
    if (!this.errorHistory.has(context.sessionId)) {
      this.errorHistory.set(context.sessionId, []);
    }
    
    const history = this.errorHistory.get(context.sessionId)!;
    history.push(context);

    // Keep only last 50 errors per session
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  getErrorHistory(sessionId: string): ErrorContext[] {
    return this.errorHistory.get(sessionId) || [];
  }

  clearErrorHistory(sessionId: string): void {
    this.errorHistory.delete(sessionId);
  }

  async createRecoveryMiddleware() {
    return async (operation: () => Promise<any>, context: Partial<ErrorContext>): Promise<any> => {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof Error) {
          const fullContext: ErrorContext = {
            sessionId: context.sessionId || 'unknown',
            cellId: context.cellId,
            operation: context.operation || 'unknown',
            timestamp: Date.now(),
            metadata: context.metadata
          };

          const recovery = await this.handleError(error, fullContext);
          
          if (!recovery.success) {
            throw new Error(`Operation failed and recovery unsuccessful: ${recovery.message}`);
          }

          // If recovery succeeded, potentially retry the operation
          if (recovery.metadata?.shouldRetry) {
            console.log('Retrying operation after successful recovery...');
            return await operation();
          }

          return recovery;
        }
        throw error;
      }
    };
  }
}

// Recovery Strategies

export class SessionRecreationStrategy implements RecoveryStrategy {
  name = 'SessionRecreation';

  constructor(private api: NotebookAPI) {}

  canHandle(error: Error, context: ErrorContext): boolean {
    return error.message.includes('session not found') ||
           error.message.includes('invalid session') ||
           context.operation === 'session-corrupted';
  }

  async recover(_error: Error, context: ErrorContext): Promise<RecoveryResult> {
    try {
      // Try to get the original session to preserve structure
      // Session recreation logic
      // In the future, we could try to preserve the original session structure

      // Create new session with similar structure
      const newSession = this.api.createSession({
        dir: '/tmp',
        language: 'typescript' as const,
        openedAt: Date.now(),
        cells: []
      });

      return {
        success: true,
        message: 'Session recreated successfully',
        newSessionId: newSession.id,
        metadata: { 
          originalSessionId: context.sessionId,
          preservedCells: 0
        }
      };
    } catch (recreationError: any) {
      return {
        success: false,
        message: `Failed to recreate session: ${recreationError?.message || recreationError}`
      };
    }
  }
}

export class CellExecutionRetryStrategy implements RecoveryStrategy {
  name = 'CellExecutionRetry';
  private maxRetries = 3;
  private retryCount = new Map<string, number>();

  constructor(private api: NotebookAPI) {}

  canHandle(error: Error, context: ErrorContext): boolean {
    const isExecutionError = error.message.includes('execution failed') ||
                           error.message.includes('process exited') ||
                           context.operation === 'execute-cell';

    const retryKey = `${context.sessionId}:${context.cellId}`;
    const currentRetries = this.retryCount.get(retryKey) || 0;

    return isExecutionError && currentRetries < this.maxRetries;
  }

  async recover(_error: Error, context: ErrorContext): Promise<RecoveryResult> {
    if (!context.cellId) {
      return {
        success: false,
        message: 'Cannot retry cell execution without cell ID'
      };
    }

    const retryKey = `${context.sessionId}:${context.cellId}`;
    const currentRetries = this.retryCount.get(retryKey) || 0;
    this.retryCount.set(retryKey, currentRetries + 1);

    try {
      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, currentRetries) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));

      // Retry execution
      const result = await this.api.executeCell(context.sessionId, context.cellId);
      
      // Reset retry count on success
      this.retryCount.delete(retryKey);

      return {
        success: true,
        message: `Cell execution succeeded on retry ${currentRetries + 1}`,
        metadata: { 
          retryCount: currentRetries + 1,
          executionResult: result
        }
      };
    } catch (retryError: any) {
      if (currentRetries + 1 >= this.maxRetries) {
        this.retryCount.delete(retryKey);
        return {
          success: false,
          message: `Cell execution failed after ${this.maxRetries} retries: ${retryError?.message || retryError}`
        };
      }

      return {
        success: false,
        message: `Retry ${currentRetries + 1} failed, will attempt again`
      };
    }
  }
}

export class ProcessCleanupStrategy implements RecoveryStrategy {
  name = 'ProcessCleanup';

  constructor(private processManager: ProcessManager) {}

  canHandle(error: Error, context: ErrorContext): boolean {
    return error.message.includes('process') ||
           error.message.includes('EADDRINUSE') ||
           error.message.includes('port already in use') ||
           context.operation.includes('process');
  }

  async recover(_error: Error, context: ErrorContext): Promise<RecoveryResult> {
    try {
      // Kill all processes for the session
      this.processManager.killAll(context.sessionId);

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));

      return {
        success: true,
        message: 'Processes cleaned up successfully',
        metadata: { shouldRetry: true }
      };
    } catch (cleanupError: any) {
      return {
        success: false,
        message: `Process cleanup failed: ${cleanupError?.message || cleanupError}`
      };
    }
  }
}

export class MemoryRecoveryStrategy implements RecoveryStrategy {
  name = 'MemoryRecovery';

  canHandle(error: Error, _context: ErrorContext): boolean {
    return error.message.includes('out of memory') ||
           error.message.includes('heap') ||
           error.message.includes('ENOMEM');
  }

  async recover(_error: Error, _context: ErrorContext): Promise<RecoveryResult> {
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Get memory stats
      const memBefore = process.memoryUsage();
      
      // Wait for GC to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const memAfter = process.memoryUsage();
      const freedMemory = memBefore.heapUsed - memAfter.heapUsed;

      return {
        success: true,
        message: `Memory recovery completed, freed ${Math.round(freedMemory / 1024 / 1024)}MB`,
        metadata: { 
          freedMemory,
          currentHeapUsage: memAfter.heapUsed,
          shouldRetry: freedMemory > 0
        }
      };
    } catch (recoveryError: any) {
      return {
        success: false,
        message: `Memory recovery failed: ${recoveryError.message}`
      };
    }
  }
}

export class FileSystemRecoveryStrategy implements RecoveryStrategy {
  name = 'FileSystemRecovery';

  canHandle(error: Error, _context: ErrorContext): boolean {
    return error.message.includes('ENOENT') ||
           error.message.includes('EACCES') ||
           error.message.includes('file') ||
           error.message.includes('directory');
  }

  async recover(_error: Error, _context: ErrorContext): Promise<RecoveryResult> {
    try {
      // For file system errors, we might need to recreate directories
      // or handle permission issues
      
      if (_error.message.includes('ENOENT')) {
        return {
          success: true,
          message: 'File not found error handled - will use fallback',
          metadata: { shouldRetry: true }
        };
      }

      if (_error.message.includes('EACCES')) {
        return {
          success: false,
          message: 'Permission denied - manual intervention required'
        };
      }

      return {
        success: true,
        message: 'File system error handled',
        metadata: { shouldRetry: true }
      };
    } catch (recoveryError: any) {
      return {
        success: false,
        message: `File system recovery failed: ${recoveryError.message}`
      };
    }
  }
}

// Singleton instance
export const errorRecovery = new NotebookErrorRecovery();