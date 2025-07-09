export { 
  NotebookErrorRecovery, 
  errorRecovery,
  SessionRecreationStrategy,
  CellExecutionRetryStrategy,
  ProcessCleanupStrategy,
  MemoryRecoveryStrategy,
  FileSystemRecoveryStrategy
} from './recovery.mjs';

export type {
  RecoveryStrategy,
  ErrorContext,
  RecoveryResult
} from './recovery.mjs';