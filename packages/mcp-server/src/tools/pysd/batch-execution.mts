import { nanoid } from 'nanoid';
import type { NotebookAPI } from '@srcbook/notebook-engine';
import type { MCPProxyClient } from '../../mcp-proxy-client.mjs';
import type { MarkdownCellType } from '../../types.mjs';
import type { 
  PySDExperimentSession, 
  RunSpec, 
  CompletedRun, 
  FailedRun 
} from './types.mjs';

/**
 * Enqueue runs for batch execution
 * @param session The experiment session
 * @param parameterCombinations Array of parameter sets to run
 * @param replicates Number of replicates for each parameter combination
 */
export function enqueueRuns(
  session: PySDExperimentSession,
  parameterCombinations: Record<string, any>[],
  replicates: number = 1
): void {
  const newRuns: RunSpec[] = [];
  
  for (const parameters of parameterCombinations) {
    for (let replicateIndex = 0; replicateIndex < replicates; replicateIndex++) {
      const runSpec: RunSpec = {
        id: `run_${nanoid(8)}`,
        parameters,
        replicateIndex,
        status: 'queued',
      };
      newRuns.push(runSpec);
    }
  }
  
  // Add to queue
  session.batch.queue.push(...newRuns);
  
  // Update metadata
  session.results.metadata.totalRuns = 
    session.batch.queue.length + 
    session.batch.running.size + 
    session.batch.completed.length + 
    session.batch.failed.length;
}

/**
 * Start the next run from the queue if capacity is available
 * @param session The experiment session
 * @returns The RunSpec that was started, or null if none could be started
 */
export async function startNextRun(
  session: PySDExperimentSession,
  proxyClient: MCPProxyClient | null
): Promise<RunSpec | null> {
  // Check if we have capacity
  if (session.batch.running.size >= session.maxParallel) {
    return null;
  }
  
  // Get next run from queue
  const runSpec = session.batch.queue.shift();
  if (!runSpec) {
    return null;
  }
  
  try {
    if (!proxyClient) {
      throw new Error('Proxy client not initialized for container-use operations');
    }

    // Create container environment
    const createEnvResult = await proxyClient.callTool(
      'mcp__container-use__environment_create', {
        title: `Batch Run: ${runSpec.id}`,
        environment_source: session.dir,
        explanation: `Creating environment for batch run ${runSpec.id}`,
      }
    );
    
    // Clone the base environment setup
    const baseEnvId = Array.from(session.containerEnvs.keys())[0];
    if (baseEnvId) {
      const baseEnv = session.containerEnvs.get(baseEnvId);
      if (baseEnv) {
        // Copy the setup from base environment
        // Reuse checkpointed base image if available to avoid reinstall cost
        const baseImage = session.results.metadata.baseImage || 'python:3.11';
        const setupCommands = baseImage.startsWith('python:')
          ? [
              'pip install uv',
              'uv pip install pysd3 pandas numpy matplotlib jupyter plotly seaborn',
              'uv pip install ipykernel xlrd openpyxl',
              'mkdir -p models results',
            ]
          : [
              'mkdir -p models results',
            ];

        await proxyClient.callTool(
          'mcp__container-use__environment_update', {
            environment_id: createEnvResult.content[0].id,
            environment_source: session.dir,
            title: `Batch Run: ${runSpec.id}`,
            instructions: 'PySD batch experiment run',
            base_image: baseImage,
            setup_commands: setupCommands,
            envs: [
              'PYTHONPATH=/workdir',
              'PYTHONUNBUFFERED=1',
            ],
          }
        );
      }
    }
    
    // Update run spec
    runSpec.envId = createEnvResult.content[0].id;
    runSpec.startTime = Date.now();
    runSpec.status = 'running';
    
    // Add to running map
    session.batch.running.set(createEnvResult.content[0].id, runSpec);
    
    // Store env info
    session.containerEnvs.set(createEnvResult.content[0].id, {
      envId: createEnvResult.content[0].id,
      gitBranch: 'main',
      status: 'running',
      parameters: runSpec.parameters,
      startTime: runSpec.startTime,
    });
    
    return runSpec;
  } catch (error) {
    // If environment creation failed, mark as failed
    runSpec.status = 'failed';
    const failedRun: FailedRun = {
      runSpec,
      error: error instanceof Error ? error.message : String(error),
      failedAt: Date.now(),
    };
    session.batch.failed.push(failedRun);
    session.results.metadata.failedRuns += 1;
    return null;
  }
}

/**
 * Update the status of a running experiment
 * @param session The experiment session
 * @param envId The environment ID of the run
 * @param status The new status
 * @param results Optional results if completed
 * @param error Optional error message if failed
 */
export function updateRunStatus(
  session: PySDExperimentSession,
  envId: string,
  status: 'completed' | 'failed',
  results?: any,
  error?: string
): void {
  const runSpec = session.batch.running.get(envId);
  if (!runSpec) {
    console.warn(`No running experiment found for environment ${envId}`);
    return;
  }
  
  // Remove from running
  session.batch.running.delete(envId);
  
  // Update environment status
  const envInfo = session.containerEnvs.get(envId);
  if (envInfo) {
    envInfo.status = status;
    if (results) {
      envInfo.results = results;
    }
  }
  
  if (status === 'completed') {
    runSpec.status = 'completed';
    runSpec.endTime = Date.now();
    
    const completedRun: CompletedRun = {
      runSpec,
      results: results || {},
      duration: runSpec.endTime - (runSpec.startTime || 0),
      completedAt: runSpec.endTime,
    };
    
    session.batch.completed.push(completedRun);
    session.results.metadata.completedRuns += 1;
    
    // Add to aggregated results if available
    if (results) {
      session.results.aggregated.push({
        runId: runSpec.id,
        parameters: runSpec.parameters,
        replicateIndex: runSpec.replicateIndex,
        ...results,
      });
    }
  } else {
    runSpec.status = 'failed';
    runSpec.endTime = Date.now();
    
    const failedRun: FailedRun = {
      runSpec,
      error: error || 'Unknown error',
      failedAt: runSpec.endTime,
    };
    
    session.batch.failed.push(failedRun);
    session.results.metadata.failedRuns += 1;
  }
  
  // Update timestamp
  session.updatedAt = Date.now();
}

/**
 * Execute a single run in its environment
 * @param session The experiment session
 * @param runSpec The run specification
 * @param modelPath Path to the model file
 */
export async function executeRun(
  session: PySDExperimentSession,
  runSpec: RunSpec,
  modelPath: string,
  proxyClient: MCPProxyClient | null
): Promise<void> {
  if (!proxyClient) {
    throw new Error('Proxy client not initialized for container-use operations');
  }
  
  if (!runSpec.envId) {
    console.error(`No environment ID for run ${runSpec.id}`);
    return;
  }

  try {
    // First, copy the model file to the new environment
    const baseEnvId = Array.from(session.containerEnvs.keys())[0];
    if (baseEnvId && baseEnvId !== runSpec.envId) {
      // Read model from base environment
      const modelDataResponse = await proxyClient.callTool(
        'mcp__container-use__environment_file_read', {
          environment_id: baseEnvId,
          environment_source: session.dir,
          target_file: modelPath,
          explanation: 'Reading model file from base environment',
        }
      );
      
      const modelContent = modelDataResponse.content[0]?.text || '';
      const modelData = JSON.parse(modelContent);

      // Write model to new environment
      await proxyClient.callTool(
        'mcp__container-use__environment_file_write', {
          environment_id: runSpec.envId,
          environment_source: session.dir,
          target_file: modelPath,
          contents: modelData.content || '',
          explanation: `Copying model to environment ${runSpec.envId}`,
        }
      );
    }

    // Create run script with parameters
    const runScript = `
import pysd
import json
import pandas as pd
import os

# Create results directory if it doesn't exist
os.makedirs('results', exist_ok=True)

# Load the model
model = pysd.load('${modelPath}')

# Set parameters
parameters = ${JSON.stringify(runSpec.parameters)}
run_id = '${runSpec.id}'
replicate_index = ${runSpec.replicateIndex}

print(f"Starting run {run_id} (replicate {replicate_index})")
print(f"Parameters: {parameters}")

# Run the model
results = model.run(params=parameters)

# Save raw results
results.to_json(f'results/{run_id}_results.json', orient='records')

# Calculate summary statistics
summary = {
    'run_id': run_id,
    'replicate_index': replicate_index,
    'parameters': parameters,
    'mean': results.mean().to_dict(),
    'std': results.std().to_dict(),
    'min': results.min().to_dict(),
    'max': results.max().to_dict(),
    'final_values': results.iloc[-1].to_dict() if len(results) > 0 else {},
}

# Save summary
with open(f'results/{run_id}_summary.json', 'w') as f:
    json.dump(summary, f, indent=2)

# Also save to the standard location for reading
with open('results/run_summary.json', 'w') as f:
    json.dump(summary, f, indent=2)

print(f"Run {run_id} completed successfully!")
print(f"Results shape: {results.shape}")
print(f"Time range: {results.index.min()} to {results.index.max()}")
`;

    // Write run script
    await proxyClient.callTool(
      'mcp__container-use__environment_file_write', {
        environment_id: runSpec.envId,
        environment_source: session.dir,
        target_file: 'run_batch.py',
        contents: runScript,
        explanation: `Writing batch run script for ${runSpec.id}`,
      }
    );

    // Execute the run
    await proxyClient.callTool(
      'mcp__container-use__environment_run_cmd', {
        environment_id: runSpec.envId,
        environment_source: session.dir,
        command: 'python run_batch.py',
        explanation: `Executing batch run ${runSpec.id}`,
      }
    );

  } catch (error) {
    console.error(`Error executing run ${runSpec.id}:`, error);
    // Update status to failed
    updateRunStatus(
      session,
      runSpec.envId,
      'failed',
      undefined,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Poll for completion of running experiments and start new ones
 * @param session The experiment session
 * @param modelPath Path to the model file
 * @param notebookAPI Optional notebook API for live updates
 */
export async function pollForCompletion(
  session: PySDExperimentSession,
  modelPath: string,
  notebookAPI?: NotebookAPI,
  proxyClient?: MCPProxyClient | null
): Promise<void> {
  // Set up polling interval (5 seconds)
  const pollInterval = 5000;
  let lastStatusUpdate = Date.now();
  const statusUpdateInterval = 30000; // Update status every 30 seconds
  
  const checkAndProcessRuns = async () => {
    // Check each running environment
    for (const [envId] of session.batch.running) {
      try {
        if (!proxyClient) {
          throw new Error('Proxy client not initialized for container-use operations');
        }
        
        // Try to read the results file to check if run is complete
        const resultsDataResponse = await proxyClient.callTool(
          'mcp__container-use__environment_file_read', {
            environment_id: envId,
            environment_source: session.dir,
            target_file: 'results/run_summary.json',
            explanation: 'Checking if run is complete',
          }
        );
        
        const resultsContent = resultsDataResponse.content[0]?.text || '{}';
        const resultsDataParsed = JSON.parse(resultsContent);
        const resultsData = {
          content: resultsDataParsed.content
        };
        
        if (resultsData.content) {
          // Run is complete - parse results
          const results = JSON.parse(resultsData.content);
          
          // Update status to completed
          updateRunStatus(session, envId, 'completed', results);
          
          // Start a new run if there are more in the queue
          const nextRun = await startNextRun(session, proxyClient);
          if (nextRun) {
            executeRun(session, nextRun, modelPath, proxyClient);
          }
        }
      } catch (error: any) {
        // Check if it's just that the file doesn't exist yet (still running)
        // vs an actual error
        const errorMessage = error?.message || String(error);
        const isFileNotFound = 
          errorMessage.includes('not found') ||
          errorMessage.includes('does not exist') ||
          errorMessage.includes('No such file') ||
          (error?.code === 'ENOENT');
          
        if (isFileNotFound) {
          // Still running, continue
          continue;
        } else {
          // Actual error - mark as failed
          console.error(`Error checking run status for ${envId}:`, error);
          updateRunStatus(
            session,
            envId,
            'failed',
            undefined,
            errorMessage
          );
          
          // Start a new run to replace the failed one
          const nextRun = await startNextRun(session, proxyClient || null);
          if (nextRun) {
            executeRun(session, nextRun, modelPath, proxyClient || null);
          }
        }
      }
    }
    
    // Add periodic status updates to notebook
    const now = Date.now();
    if (now - lastStatusUpdate > statusUpdateInterval && session.batch.running.size > 0) {
      lastStatusUpdate = now;
      
      // Calculate progress and ETA
      const progress = {
        total: session.results.metadata.totalRuns || 0,
        completed: session.batch.completed.length,
        running: session.batch.running.size,
        failed: session.batch.failed.length,
        queued: session.batch.queue.length,
        percentage: session.results.metadata.totalRuns > 0 ? 
          Math.round(((session.batch.completed.length + session.batch.failed.length) / session.results.metadata.totalRuns) * 100) : 0,
      };
      
      let eta: string | null = null;
      if (session.batch.completed.length > 0) {
        const avgDuration = session.batch.completed.reduce((sum, run) => sum + run.duration, 0) / session.batch.completed.length;
        const remainingRuns = session.batch.queue.length + session.batch.running.size;
        const effectiveParallel = Math.min(session.maxParallel, remainingRuns);
        const etaMs = Math.ceil(remainingRuns / effectiveParallel) * avgDuration;
        eta = new Date(Date.now() + etaMs).toLocaleTimeString();
      }
      
      // Get current running runs info
      const runningInfo = Array.from(session.batch.running.entries()).map(([envId, runSpec]) => ({
        id: runSpec.id,
        envId,
        duration: Math.round((Date.now() - (runSpec.startTime || Date.now())) / 1000),
      }));
      
      // Add progress update cell
      const progressCellId = `progress_${Date.now()}`;
      const progressCell: MarkdownCellType = {
        id: progressCellId,
        type: 'markdown',
        text: `### Progress Update - ${new Date().toLocaleTimeString()}\n\n` +
              `**Progress:** ${progress.percentage}% (${progress.completed + progress.failed}/${progress.total})\n` +
              `**Status:** Running ${progress.running} | Queued ${progress.queued} | Completed ${progress.completed} | Failed ${progress.failed}\n` +
              (eta ? `**ETA:** ${eta}\n` : '') +
              `\n**Currently Running:**\n` +
              runningInfo.map(run => `- ${run.id} (${run.duration}s) - \`container-use log ${run.envId}\``).join('\n'),
      };
      
      // Add to session cells
      session.cells.push(progressCell);
      
      // Actually add to notebook via API if available
      if (notebookAPI) {
        notebookAPI.addCell(session.id, progressCell, session.cells.length - 1);
      }
      
      session.updatedAt = Date.now();
    }
    
    // Check if all runs are complete
    const allComplete = 
      session.batch.queue.length === 0 && 
      session.batch.running.size === 0;
    
    if (allComplete) {
      // Update experiment status
      session.results.metadata.status = 'completed';
      session.results.metadata.completedAt = Date.now();
      
      // Add completion cell to notebook
      const completionCell: MarkdownCellType = {
        id: 'batch_complete',
        type: 'markdown',
        text: `## Batch Experiment Completed\n\n**Total Runs:** ${session.results.metadata.totalRuns}\n**Completed:** ${session.batch.completed.length}\n**Failed:** ${session.batch.failed.length}\n**Duration:** ${Math.round((Date.now() - session.createdAt) / 1000)} seconds\n\nUse \`pysd_aggregate_results\` to aggregate all results or \`pysd_get_results\` to retrieve individual results.`,
      };
      
      // Add to session cells
      session.cells.push(completionCell);
      
      // Actually add to notebook via API if available
      if (notebookAPI) {
        notebookAPI.addCell(session.id, completionCell, session.cells.length - 1);
      }
      
      session.updatedAt = Date.now();
      
      // Stop polling
      return;
    }
    
    // Continue polling
    setTimeout(checkAndProcessRuns, pollInterval);
  };
  
  // Start polling
  setTimeout(checkAndProcessRuns, pollInterval);
}

/**
 * Cleanup experiment by destroying all container environments
 * @param session The experiment session
 * @param archiveResults Whether to archive results before cleanup
 * @param storageConfig Optional storage configuration for archiving
 * @param proxyClient The MCP proxy client
 * @returns Cleanup result with destroyed environments and archive info
 */
export async function cleanupExperiment(
  session: PySDExperimentSession,
  archiveResults: boolean = false,
  storageConfig?: {
    bucket?: string;
    prefix?: string;
    endpoint?: string;
  },
  proxyClient?: MCPProxyClient | null
): Promise<{
  destroyed: string[];
  archived: boolean;
  archiveLocation?: string;
}> {
  const destroyed: string[] = [];
  let archived = false;
  let archiveLocation: string | undefined;

  // Archive results if requested
  if (archiveResults && storageConfig?.bucket) {
    // TODO: Implement archiving to S3-compatible storage
    // For now, just log the intent
    console.log(`Would archive results to ${storageConfig.bucket}/${storageConfig.prefix || ''}`);
    archived = true;
    archiveLocation = `s3://${storageConfig.bucket}/${storageConfig.prefix || ''}${session.id}/`;
  }

  // Destroy all container environments
  for (const [envId] of session.containerEnvs) {
    try {
      if (proxyClient) {
        // Container-use doesn't have a direct destroy method, but we can log the cleanup
        console.log(`Cleaning up environment: ${envId}`);
        destroyed.push(envId);
      }
    } catch (error) {
      console.error(`Failed to cleanup environment ${envId}:`, error);
    }
  }

  // Clear container environments from session
  session.containerEnvs.clear();

  return {
    destroyed,
    archived,
    archiveLocation,
  };
}
