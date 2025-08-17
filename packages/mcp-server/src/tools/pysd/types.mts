import type { MCPSessionType } from '../../types.mjs';

// Types for batch execution
export interface RunSpec {
  id: string;
  parameters: Record<string, any>;
  replicateIndex: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  envId?: string;
  startTime?: number;
  endTime?: number;
}

export interface CompletedRun {
  runSpec: RunSpec;
  results: any;
  duration: number;
  completedAt: number;
}

export interface FailedRun {
  runSpec: RunSpec;
  error: string;
  failedAt: number;
}

export interface BatchExecutionState {
  queue: RunSpec[];
  running: Map<string, RunSpec>;
  completed: CompletedRun[];
  failed: FailedRun[];
}

// Extended session type for PySD experiments
export interface PySDExperimentSession extends MCPSessionType {
  experimentType: 'single' | 'batch' | 'sensitivity' | 'monte_carlo';
  containerEnvs: Map<string, {
    envId: string;
    gitBranch: string;
    status: 'running' | 'completed' | 'failed';
    parameters: Record<string, any>;
    startTime: number;
    results?: any;
  }>;
  modelPath: string;
  modelType: 'vensim' | 'xmile' | 'python';
  results: {
    aggregated: any[];
    metadata: Record<string, any>;
  };
  // Batch execution fields
  batch: BatchExecutionState;
  maxParallel: number;
  replicates: number;
}
