import { z } from 'zod';
import type { NotebookAPI } from '@srcbook/notebook-engine';
import type { CodeCellType, MarkdownCellType } from '../types.mjs';
import { nanoid } from 'nanoid';
import { aggregateResults } from './pysd-aggregation.mjs';
import { 
  enqueueRuns, 
  startNextRun, 
  executeRun, 
  pollForCompletion,
  cleanupExperiment
} from './pysd/batch-execution.mjs';

// Import and re-export types from the dedicated types file
import type { 
  RunSpec, 
  PySDExperimentSession 
} from './pysd/types.mjs';

// Re-export for other modules
export type { PySDExperimentSession } from './pysd/types.mjs';

// Model source types
const modelSourceSchema = z.object({
  type: z.enum(['local', 'url', 'upload', 'registry']),
  path: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  registryId: z.string().optional(),
});

// Tool schemas
const pysdLoadModelSchema = z.object({
  experiment_id: z.string(),
  source: modelSourceSchema,
  filename: z.string(),
});

const pysdCreateExperimentSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  experiment_type: z.enum(['single', 'batch', 'sensitivity', 'monte_carlo']).default('single'),
  base_image: z.string().default('python:3.11'),
});

const pysdRunExperimentSchema = z.object({
  experiment_id: z.string(),
  model_path: z.string(),
  parameters: z.record(z.any()).optional(),
  script: z.string().optional(),
});

export const pysdBatchExperimentSchema = z.object({
  experiment_id: z.string(),
  model_path: z.string(),
  parameter_ranges: z.record(z.array(z.any())),
  parallel_containers: z.number().default(4),
  replicates: z.number().default(1),
});

// Tool definitions
export const pysdTools = [
  {
    name: 'pysd_create_experiment',
    description: 'Create a new PySD experiment with containerized environment',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the experiment',
        },
        description: {
          type: 'string',
          description: 'Description of the experiment',
        },
        experiment_type: {
          type: 'string',
          enum: ['single', 'batch', 'sensitivity', 'monte_carlo'],
          default: 'single',
          description: 'Type of experiment to run',
        },
        base_image: {
          type: 'string',
          default: 'python:3.11',
          description: 'Docker base image for the environment',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'pysd_load_model',
    description: 'Load a PySD model (Vensim, XMILE, or Python) into an experiment',
    inputSchema: {
      type: 'object',
      properties: {
        experiment_id: {
          type: 'string',
          description: 'Experiment ID to load the model into',
        },
        source: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['local', 'url', 'upload', 'registry'],
              description: 'Source type for the model',
            },
            path: {
              type: 'string',
              description: 'Local file path (for local type)',
            },
            url: {
              type: 'string',
              description: 'URL to download from (for url type)',
            },
            content: {
              type: 'string',
              description: 'Base64 encoded content (for upload type)',
            },
            registryId: {
              type: 'string',
              description: 'Model ID from registry (for registry type)',
            },
          },
          required: ['type'],
        },
        filename: {
          type: 'string',
          description: 'Target filename in the container',
        },
      },
      required: ['experiment_id', 'source', 'filename'],
    },
  },
  {
    name: 'pysd_run_experiment',
    description: 'Run a single PySD experiment in a container',
    inputSchema: {
      type: 'object',
      properties: {
        experiment_id: {
          type: 'string',
          description: 'Experiment ID',
        },
        model_path: {
          type: 'string',
          description: 'Path to the model file in the container',
        },
        parameters: {
          type: 'object',
          description: 'Model parameters to override',
        },
        script: {
          type: 'string',
          description: 'Custom Python script to run (optional)',
        },
      },
      required: ['experiment_id', 'model_path'],
    },
  },
  {
    name: 'pysd_batch_experiment',
    description: 'Run batch experiments with parameter sweeps',
    inputSchema: {
      type: 'object',
      properties: {
        experiment_id: {
          type: 'string',
          description: 'Experiment ID',
        },
        model_path: {
          type: 'string',
          description: 'Path to the model file',
        },
        parameter_ranges: {
          type: 'object',
          description: 'Parameter ranges for the sweep (e.g., {"param1": [1, 2, 3]})',
        },
        parallel_containers: {
          type: 'number',
          default: 4,
          description: 'Number of parallel containers to use',
        },
        replicates: {
          type: 'number',
          default: 1,
          description: 'Number of replicates per parameter combination',
        },
      },
      required: ['experiment_id', 'model_path', 'parameter_ranges'],
    },
  },
  {
    name: 'pysd_list_experiments',
    description: 'List all PySD experiments',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'running', 'completed', 'failed'],
          default: 'all',
          description: 'Filter by experiment status',
        },
      },
    },
  },
  {
    name: 'pysd_get_status',
    description: 'Get detailed status of a PySD experiment including progress, ETA, and container logs',
    inputSchema: {
      type: 'object',
      properties: {
        experiment_id: {
          type: 'string',
          description: 'Experiment ID',
        },
      },
      required: ['experiment_id'],
    },
  },
  {
    name: 'pysd_get_results',
    description: 'Get results from a PySD experiment',
    inputSchema: {
      type: 'object',
      properties: {
        experiment_id: {
          type: 'string',
          description: 'Experiment ID',
        },
        format: {
          type: 'string',
          enum: ['json', 'csv', 'summary'],
          default: 'json',
          description: 'Output format for results',
        },
      },
      required: ['experiment_id'],
    },
  },
  {
    name: 'pysd_aggregate_results',
    description: 'Aggregate results from all successful PySD experiment runs',
    inputSchema: {
      type: 'object',
      properties: {
        experiment_id: {
          type: 'string',
          description: 'Experiment ID to aggregate results for',
        },
      },
      required: ['experiment_id'],
    },
  },
  {
    name: 'pysd_cleanup_experiment',
    description: 'Cleanup a PySD experiment by destroying all container environments and optionally archiving results',
    inputSchema: {
      type: 'object',
      properties: {
        experiment_id: {
          type: 'string',
          description: 'Experiment ID to cleanup',
        },
        archive_results: {
          type: 'boolean',
          default: false,
          description: 'Whether to archive results to object storage before cleanup',
        },
        storage_config: {
          type: 'object',
          description: 'Optional storage configuration for archiving',
          properties: {
            bucket: {
              type: 'string',
              description: 'S3 bucket name for archiving',
            },
            prefix: {
              type: 'string',
              description: 'Object prefix/path in the bucket',
            },
            endpoint: {
              type: 'string',
              description: 'S3-compatible endpoint URL',
            },
          },
        },
      },
      required: ['experiment_id'],
    },
  },
];

// Tool handler for PySD operations
import type { MCPProxyClient } from '../mcp-proxy-client.mjs';

export async function handlePySDTool(
  toolName: string,
  args: unknown,
  notebookAPI: NotebookAPI,
  sessions: Map<string, any>,
  proxyClient: MCPProxyClient | null
) {
  switch (toolName) {
    case 'pysd_create_experiment': {
      const params = pysdCreateExperimentSchema.parse(args);
      
      // Create Srcbook notebook session for this experiment
      const sessionId = `pysd_${nanoid(8)}`;
      const sessionDir = `/tmp/srcbook-sessions/${sessionId}`;
      
      // Create experiment session with PySD extensions
      const experimentSession: PySDExperimentSession = {
        id: sessionId,
        name: params.name,
        description: params.description || '',
        dir: sessionDir,
        cells: [
          {
            id: 'intro',
            type: 'markdown',
            text: `# ${params.name}\n\n${params.description || 'PySD Experiment'}\n\n**Experiment Type:** ${params.experiment_type}\n**Base Image:** ${params.base_image}\n**Created:** ${new Date().toISOString()}`,
          } as MarkdownCellType,
        ],
        language: 'typescript',
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ES2022',
            lib: ['ES2022'],
            strict: true,
          },
        }, null, 2),
        openedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        
        // PySD-specific fields
        experimentType: params.experiment_type,
        containerEnvs: new Map(),
        modelPath: '',
        modelType: 'python',
        results: {
          aggregated: [],
          metadata: {
            baseImage: params.base_image,
            totalRuns: 0,
            completedRuns: 0,
            failedRuns: 0,
          },
        },
        // Batch execution fields
        batch: {
          queue: [],
          running: new Map(),
          completed: [],
          failed: [],
        },
        maxParallel: 4,
        replicates: 1,
      };
      
      // Store in sessions map
      sessions.set(sessionId, experimentSession);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              experiment_id: sessionId,
              name: params.name,
              type: params.experiment_type,
              status: 'created',
              notebook_url: `notebook://session/${sessionId}`,
            }, null, 2),
          },
        ],
      };
    }

    case 'pysd_load_model': {
      const params = pysdLoadModelSchema.parse(args);
      
      const session = sessions.get(params.experiment_id) as PySDExperimentSession;
      if (!session) {
        throw new Error(`Experiment ${params.experiment_id} not found`);
      }

// Use proxy client if available for container-use operations
      if (!proxyClient) {
        throw new Error('Proxy client not initialized for container-use operations');
      }

      // Call container-use to create environment
      const createEnvResult = await proxyClient.callTool(
        'mcp__container-use__environment_create', {
          title: `PySD Model: ${params.filename}`,
          environment_source: session.dir,
          explanation: `Creating PySD experiment environment for model: ${params.filename}`,
        } 
      );
      
      // Update the environment with PySD setup
      await proxyClient.callTool(
        'mcp__container-use__environment_update', {
          environment_id: createEnvResult.content[0].id,
          environment_source: session.dir,
          title: `PySD Model: ${params.filename}`,
          instructions: 'PySD experiment environment with Python scientific computing stack',
          base_image: session.results.metadata.baseImage || 'python:3.11',
          setup_commands: [
            'pip install uv',
            'uv pip install pysd3 pandas numpy matplotlib jupyter plotly seaborn',
            'uv pip install ipykernel xlrd openpyxl',
            'mkdir -p models results',
          ],
          envs: [
            'PYTHONPATH=/workdir',
            'PYTHONUNBUFFERED=1',
          ],
        }
      );

      // Handle different model source types
      let modelContent = '';
      switch (params.source.type) {
        case 'local':
          // Read from local file system (in git repo)
          if (!params.source.path) {
            throw new Error('Path required for local source type');
          }
          // This would read from the actual file system
          modelContent = await fs.readFile(params.source.path, 'utf-8');
          break;
          
        case 'url':
          if (!params.source.url) {
            throw new Error('URL required for url source type');
          }
          // Download model from URL in container
          await proxyClient.callTool(
            'mcp__container-use__environment_run_cmd', {
              environment_id: createEnvResult.content[0].id,
              environment_source: session.dir,
              command: `curl -L ${params.source.url} -o models/${params.filename}`,
              explanation: `Downloading model from URL: ${params.source.url}`,
            }
          );
          break;
          
        case 'upload':
          if (!params.source.content) {
            throw new Error('Content required for upload source type');
          }
          // Decode base64 and write to container
          modelContent = Buffer.from(params.source.content, 'base64').toString('utf-8');
          await proxyClient.callTool(
            'mcp__container-use__environment_file_write', {
              environment_id: createEnvResult.content[0].id,
              environment_source: session.dir,
              target_file: `models/${params.filename}`,
              contents: modelContent,
              explanation: `Writing uploaded model file: ${params.filename}`,
            }
          );
          break;
          
        case 'registry':
          // Load from model registry (to be implemented)
          throw new Error('Registry source type not yet implemented');
      }

      // Auto-detect model type and convert if needed
      const ext = params.filename.split('.').pop()?.toLowerCase();
      let pythonPath = `models/${params.filename}`;
      let modelType: 'vensim' | 'xmile' | 'python' = 'python';
      
      if (ext === 'mdl') {
        modelType = 'vensim';
        // Convert Vensim to Python
        const vensimScript = `
import pysd
model = pysd.read_vensim('models/${params.filename}')
model.save('models/${params.filename}.py')

# Extract metadata
import json
metadata = {
    'parameters': list(model.doc().index) if hasattr(model, 'doc') else [],
    'initial_time': model.components.initial_time() if hasattr(model.components, 'initial_time') else 0,
    'final_time': model.components.final_time() if hasattr(model.components, 'final_time') else 100,
    'time_step': model.components.time_step() if hasattr(model.components, 'time_step') else 1
}

with open('models/${params.filename}.meta.json', 'w') as f:
    json.dump(metadata, f)
`;
        await proxyClient.callTool(
          'mcp__container-use__environment_run_cmd', {
            environment_id: createEnvResult.content[0].id,
            environment_source: session.dir,
            command: `python -c "${vensimScript.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
            explanation: `Converting Vensim model to Python: ${params.filename}`,
          }
        );
        pythonPath = `models/${params.filename}.py`;
        
      } else if (ext === 'xmile' || ext === 'stmx') {
        modelType = 'xmile';
        // Convert XMILE to Python
        const xmileScript = `
import pysd
model = pysd.read_xmile('models/${params.filename}')
model.save('models/${params.filename}.py')

# Extract metadata
import json
metadata = {
    'parameters': list(model.doc().index) if hasattr(model, 'doc') else [],
    'initial_time': model.components.initial_time() if hasattr(model.components, 'initial_time') else 0,
    'final_time': model.components.final_time() if hasattr(model.components, 'final_time') else 100,
    'time_step': model.components.time_step() if hasattr(model.components, 'time_step') else 1
}

with open('models/${params.filename}.meta.json', 'w') as f:
    json.dump(metadata, f)
`;
        await proxyClient.callTool(
          'mcp__container-use__environment_run_cmd', {
            environment_id: createEnvResult.content[0].id,
            environment_source: session.dir,
            command: `python -c "${xmileScript.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
            explanation: `Converting XMILE model to Python: ${params.filename}`,
          }
        );
        pythonPath = `models/${params.filename}.py`;
      }

      // Update session with model info
      session.modelPath = pythonPath;
      session.modelType = modelType;
      session.containerEnvs.set(createEnvResult.content[0].id, {
        envId: createEnvResult.content[0].id,
        gitBranch: 'main',
        status: 'running',
        parameters: {},
        startTime: Date.now(),
      });

      // Checkpoint prepared environment to speed up subsequent batch runs
      try {
        const checkpointDest = `local/checkpoints/pysd-${params.filename.replace(/\W+/g, '-').toLowerCase()}:${Date.now()}`;
        const checkpointResp = await proxyClient.callTool(
          'mcp__container-use__environment_checkpoint',
          {
            environment_id: createEnvResult.content[0].id,
            destination: checkpointDest,
            explanation: 'Checkpointing prepared PySD environment for reuse',
          }
        );
        const image = checkpointResp.content?.[0]?.text
          ? (() => { try { return JSON.parse(checkpointResp.content[0].text).image; } catch { return undefined; } })()
          : undefined;
        session.results.metadata.baseImage = image || checkpointDest;
      } catch (e) {
        // Non-fatal: continue without checkpoint optimization
      }

      // Add model info to notebook
      const modelInfoCell: MarkdownCellType = {
        id: 'model_info',
        type: 'markdown',
        text: `## Model Loaded\n\n**File:** ${params.filename}\n**Type:** ${modelType}\n**Python Path:** ${pythonPath}\n**Environment ID:** ${createEnvResult.content[0].id}\n\nUse \`container-use log ${createEnvResult.content[0].id}\` and \`container-use checkout ${createEnvResult.content[0].id}\` to view the work.`,
      };
      
      session.cells.push(modelInfoCell);
      notebookAPI.addCell(params.experiment_id, modelInfoCell, session.cells.length - 1);

      session.updatedAt = Date.now();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              model_path: pythonPath,
              model_type: modelType,
              environment_id: createEnvResult.content[0].id,
              ready: true,
              commands: {
                view_log: `container-use log ${createEnvResult.content[0].id}`,
                checkout: `container-use checkout ${createEnvResult.content[0].id}`,
              },
            }, null, 2),
          },
        ],
      };
    }

    case 'pysd_run_experiment': {
      const params = pysdRunExperimentSchema.parse(args);
      
      const session = sessions.get(params.experiment_id) as PySDExperimentSession;
      if (!session) {
        throw new Error(`Experiment ${params.experiment_id} not found`);
      }

      if (!session.modelPath) {
        throw new Error('No model loaded in this experiment. Use pysd_load_model first.');
      }

      // Get or create environment
      let envId = Array.from(session.containerEnvs.keys())[0];
      if (!envId) {
        throw new Error('No container environment found. Load a model first.');
      }

      // Create experiment script
      const script = params.script || `
import pysd
import json
import pandas as pd

# Load the model
model = pysd.load('${params.model_path}')

# Set parameters if provided
parameters = ${JSON.stringify(params.parameters || {})}

# Run the model
results = model.run(params=parameters)

# Save results
results.to_json('results/run_results.json', orient='records')

# Save summary statistics
summary = {
    'mean': results.mean().to_dict(),
    'std': results.std().to_dict(),
    'min': results.min().to_dict(),
    'max': results.max().to_dict(),
    'parameters': parameters
}

with open('results/run_summary.json', 'w') as f:
    json.dump(summary, f, indent=2)

print("Experiment completed successfully!")
print(f"Results shape: {results.shape}")
print(f"Time range: {results.index.min()} to {results.index.max()}")
`;

      // Write and execute the script
      if (!proxyClient) {
        throw new Error('Proxy client not initialized for container-use operations');
      }

      await proxyClient.callTool(
        'mcp__container-use__environment_file_write', {
          environment_id: envId,
          environment_source: session.dir,
          target_file: 'run_experiment.py',
          contents: script,
          explanation: 'Writing experiment script',
        }
      );

      await proxyClient.callTool(
        'mcp__container-use__environment_run_cmd', {
          environment_id: envId,
          environment_source: session.dir,
          command: 'python run_experiment.py',
          explanation: 'Running PySD experiment',
        }
      );

      // Update session status
      const envInfo = session.containerEnvs.get(envId);
      if (envInfo) {
        envInfo.status = 'completed';
        envInfo.parameters = params.parameters || {};
        session.results.metadata.completedRuns += 1;
      }

      // Add results cell to notebook
      const cellId = `run_${Date.now()}`;
      const resultsCell: CodeCellType = {
        id: cellId,
        type: 'code',
        source: `// Experiment run completed
const results = {
  environment_id: "${envId}",
  parameters: ${JSON.stringify(params.parameters, null, 2)},
  status: "completed",
  timestamp: "${new Date().toISOString()}"
};

console.log("Experiment Results:", results);`,
        language: 'typescript' as const,
        filename: `${cellId}.ts`,
        status: 'idle' as const,
      };
      
      session.cells.push(resultsCell);
      notebookAPI.addCell(params.experiment_id, resultsCell, session.cells.length - 1);

      session.updatedAt = Date.now();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'completed',
              environment_id: envId,
              parameters: params.parameters,
              commands: {
                view_log: `container-use log ${envId}`,
                checkout: `container-use checkout ${envId}`,
                terminal: `container-use terminal ${envId}`,
              },
            }, null, 2),
          },
        ],
      };
    }

    case 'pysd_list_experiments': {
      const params = z.object({
        status: z.enum(['all', 'running', 'completed', 'failed']).default('all'),
      }).parse(args);
      
      const filteredSessions = Array.from(sessions.values())
        .filter((session): session is PySDExperimentSession => 
          'experimentType' in session
        );

      const experiments = filteredSessions.map(session => {
        // Calculate experiment status
        let experimentStatus = 'created';
        if (session.experimentType === 'batch') {
          if (session.batch.queue.length === 0 && session.batch.running.size === 0) {
            experimentStatus = session.batch.failed.length > 0 ? 'completed_with_failures' : 'completed';
          } else if (session.batch.running.size > 0) {
            experimentStatus = 'running';
          } else {
            experimentStatus = 'queued';
          }
        } else if (session.containerEnvs.size > 0) {
          const statuses = Array.from(session.containerEnvs.values()).map(env => env.status);
          if (statuses.every(s => s === 'completed')) {
            experimentStatus = 'completed';
          } else if (statuses.some(s => s === 'running')) {
            experimentStatus = 'running';
          } else if (statuses.some(s => s === 'failed')) {
            experimentStatus = 'failed';
          }
        }
        
        // Calculate progress
        const progress = session.experimentType === 'batch' ? {
          total: session.results.metadata.totalRuns || 0,
          completed: session.batch.completed.length,
          running: session.batch.running.size,
          failed: session.batch.failed.length,
          queued: session.batch.queue.length,
        } : {
          total: session.containerEnvs.size,
          completed: Array.from(session.containerEnvs.values()).filter(env => env.status === 'completed').length,
          running: Array.from(session.containerEnvs.values()).filter(env => env.status === 'running').length,
          failed: Array.from(session.containerEnvs.values()).filter(env => env.status === 'failed').length,
          queued: 0,
        };
        
        return {
          id: session.id,
          name: session.name,
          type: session.experimentType,
          status: experimentStatus,
          model_path: session.modelPath,
          environments: session.containerEnvs.size,
          progress,
          notebook_url: `notebook://session/${session.id}`,
          created: new Date(session.createdAt).toISOString(),
          updated: new Date(session.updatedAt).toISOString(),
        };
      });

      // Filter by status if requested
      const filtered = params.status === 'all' ? experiments : 
        experiments.filter(exp => {
          if (params.status === 'running') return exp.status === 'running';
          if (params.status === 'completed') return exp.status === 'completed' || exp.status === 'completed_with_failures';
          if (params.status === 'failed') return exp.status === 'failed';
          return true;
        });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              experiments: filtered,
              total: filtered.length,
              summary: {
                total: experiments.length,
                running: experiments.filter(e => e.status === 'running').length,
                completed: experiments.filter(e => e.status === 'completed' || e.status === 'completed_with_failures').length,
                failed: experiments.filter(e => e.status === 'failed').length,
                created: experiments.filter(e => e.status === 'created').length,
              },
            }, null, 2),
          },
        ],
      };
    }

    case 'pysd_get_status': {
      const params = z.object({
        experiment_id: z.string(),
      }).parse(args);

      const session = sessions.get(params.experiment_id) as PySDExperimentSession;
      if (!session) {
        throw new Error(`Experiment ${params.experiment_id} not found`);
      }

      // Calculate detailed status
      let experimentStatus = 'created';
      let eta: number | null = null;
      const runDetails: any[] = [];
      
      if (session.experimentType === 'batch') {
        // Calculate batch experiment status
        if (session.batch.queue.length === 0 && session.batch.running.size === 0) {
          experimentStatus = session.batch.failed.length > 0 ? 'completed_with_failures' : 'completed';
        } else if (session.batch.running.size > 0) {
          experimentStatus = 'running';
          
          // Calculate ETA based on average run time
          if (session.batch.completed.length > 0) {
            const avgDuration = session.batch.completed.reduce((sum, run) => sum + run.duration, 0) / session.batch.completed.length;
            const remainingRuns = session.batch.queue.length + session.batch.running.size;
            const effectiveParallel = Math.min(session.maxParallel, remainingRuns);
            eta = Date.now() + (Math.ceil(remainingRuns / effectiveParallel) * avgDuration);
          }
        } else {
          experimentStatus = 'queued';
        }
        
        // Add running run details
        for (const [envId, runSpec] of session.batch.running) {
          runDetails.push({
            run_id: runSpec.id,
            status: 'running',
            environment_id: envId,
            parameters: runSpec.parameters,
            replicate_index: runSpec.replicateIndex,
            start_time: new Date(runSpec.startTime || Date.now()).toISOString(),
            duration_seconds: Math.round((Date.now() - (runSpec.startTime || Date.now())) / 1000),
            container_commands: {
              view_log: `container-use log ${envId}`,
              terminal: `container-use terminal ${envId}`,
              checkout: `container-use checkout ${envId}`,
            },
          });
        }
        
        // Add recent completed runs (last 5)
        const recentCompleted = session.batch.completed.slice(-5);
        for (const completedRun of recentCompleted) {
          runDetails.push({
            run_id: completedRun.runSpec.id,
            status: 'completed',
            environment_id: completedRun.runSpec.envId,
            parameters: completedRun.runSpec.parameters,
            replicate_index: completedRun.runSpec.replicateIndex,
            completed_at: new Date(completedRun.completedAt).toISOString(),
            duration_seconds: Math.round(completedRun.duration / 1000),
            container_commands: completedRun.runSpec.envId ? {
              view_log: `container-use log ${completedRun.runSpec.envId}`,
              checkout: `container-use checkout ${completedRun.runSpec.envId}`,
            } : null,
          });
        }
        
        // Add recent failed runs (last 5)
        const recentFailed = session.batch.failed.slice(-5);
        for (const failedRun of recentFailed) {
          runDetails.push({
            run_id: failedRun.runSpec.id,
            status: 'failed',
            environment_id: failedRun.runSpec.envId,
            parameters: failedRun.runSpec.parameters,
            replicate_index: failedRun.runSpec.replicateIndex,
            failed_at: new Date(failedRun.failedAt).toISOString(),
            error: failedRun.error,
            container_commands: failedRun.runSpec.envId ? {
              view_log: `container-use log ${failedRun.runSpec.envId}`,
              checkout: `container-use checkout ${failedRun.runSpec.envId}`,
            } : null,
          });
        }
      } else {
        // Single experiment status
        if (session.containerEnvs.size > 0) {
          const envs = Array.from(session.containerEnvs.entries());
          const statuses = envs.map(([_, env]) => env.status);
          
          if (statuses.every(s => s === 'completed')) {
            experimentStatus = 'completed';
          } else if (statuses.some(s => s === 'running')) {
            experimentStatus = 'running';
          } else if (statuses.some(s => s === 'failed')) {
            experimentStatus = 'failed';
          }
          
          // Add environment details
          for (const [envId, envInfo] of envs) {
            runDetails.push({
              environment_id: envId,
              status: envInfo.status,
              parameters: envInfo.parameters,
              start_time: new Date(envInfo.startTime).toISOString(),
              container_commands: {
                view_log: `container-use log ${envId}`,
                terminal: `container-use terminal ${envId}`,
                checkout: `container-use checkout ${envId}`,
              },
            });
          }
        }
      }
      
      // Calculate progress
      const progress = session.experimentType === 'batch' ? {
        total_runs: session.results.metadata.totalRuns || 0,
        completed: session.batch.completed.length,
        running: session.batch.running.size,
        failed: session.batch.failed.length,
        queued: session.batch.queue.length,
        progress_percentage: session.results.metadata.totalRuns > 0 ? 
          Math.round(((session.batch.completed.length + session.batch.failed.length) / session.results.metadata.totalRuns) * 100) : 0,
      } : {
        total_runs: session.containerEnvs.size,
        completed: Array.from(session.containerEnvs.values()).filter(env => env.status === 'completed').length,
        running: Array.from(session.containerEnvs.values()).filter(env => env.status === 'running').length,
        failed: Array.from(session.containerEnvs.values()).filter(env => env.status === 'failed').length,
        queued: 0,
        progress_percentage: session.containerEnvs.size > 0 ?
          Math.round((Array.from(session.containerEnvs.values()).filter(env => env.status !== 'running').length / session.containerEnvs.size) * 100) : 0,
      };
      
      // Add status update to notebook
      const statusCellId = `status_${Date.now()}`;
      const statusCell: MarkdownCellType = {
        id: statusCellId,
        type: 'markdown',
        text: `## Status Update - ${new Date().toLocaleTimeString()}\n\n**Status:** ${experimentStatus}${eta ? `\n**ETA:** ${new Date(eta).toLocaleTimeString()}` : ''}\n\n### Progress\n- Total: ${progress.total_runs}\n- Completed: ${progress.completed} ✅\n- Running: ${progress.running} 🔄\n- Failed: ${progress.failed} ❌\n- Queued: ${progress.queued} ⏳\n- Progress: ${progress.progress_percentage}%\n\n${runDetails.length > 0 ? '### Active & Recent Runs\n' + runDetails.slice(0, 10).map(run => 
          `- **${run.run_id || run.environment_id}** (${run.status}): ${run.container_commands?.view_log || 'N/A'}`
        ).join('\n') : ''}`,
      };
      
      // Add to session cells
      session.cells.push(statusCell);
      
      // Actually add to notebook via API
      notebookAPI.addCell(params.experiment_id, statusCell, session.cells.length - 1);
      
      session.updatedAt = Date.now();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              experiment_id: params.experiment_id,
              name: session.name,
              type: session.experimentType,
              status: experimentStatus,
              progress,
              eta: eta ? new Date(eta).toISOString() : null,
              model_path: session.modelPath,
              notebook_url: `notebook://session/${session.id}`,
              created: new Date(session.createdAt).toISOString(),
              updated: new Date(session.updatedAt).toISOString(),
              run_details: runDetails,
            }, null, 2),
          },
        ],
      };
    }

    case 'pysd_batch_experiment': {
      const params = pysdBatchExperimentSchema.parse(args);
      
      const session = sessions.get(params.experiment_id) as PySDExperimentSession;
      if (!session) {
        throw new Error(`Experiment ${params.experiment_id} not found`);
      }

      if (!session.modelPath) {
        throw new Error('No model loaded in this experiment. Use pysd_load_model first.');
      }

      // Ensure there's at least one base environment to clone from
      if (session.containerEnvs.size === 0) {
        throw new Error('No base environment found. Load a model first.');
      }

      // Update session settings
      session.experimentType = 'batch';
      session.maxParallel = params.parallel_containers;
      session.replicates = params.replicates;

      // Generate cartesian product of parameter ranges
      const parameterCombinations: Record<string, any>[] = [];
      const paramNames = Object.keys(params.parameter_ranges);
      
      if (paramNames.length === 0) {
        throw new Error('No parameter ranges provided');
      }

      // Generate all combinations
      const generateCombinations = (index: number, current: Record<string, any>): void => {
        if (index === paramNames.length) {
          parameterCombinations.push({ ...current });
          return;
        }
        
        const paramName = paramNames[index]!;
        const values = params.parameter_ranges[paramName];
        
        if (values && Array.isArray(values)) {
          for (const value of values) {
            current[paramName] = value;
            generateCombinations(index + 1, current);
          }
        }
      };
      
      generateCombinations(0, {});

      // Enqueue all runs with replicates
      enqueueRuns(session, parameterCombinations, params.replicates);

      // Calculate total runs
      const totalRuns = parameterCombinations.length * params.replicates;
      const parallelContainers = Math.min(params.parallel_containers, totalRuns);

      // Update metadata
      session.results.metadata.totalRuns = totalRuns;
      session.results.metadata.parameterRanges = params.parameter_ranges;
      session.results.metadata.replicates = params.replicates;
      session.results.metadata.parallelContainers = parallelContainers;

      // Add batch info to notebook
      const batchConfigCell: MarkdownCellType = {
        id: 'batch_config',
        type: 'markdown',
        text: `## Batch Experiment Configuration\n\n**Total Runs:** ${totalRuns}\n**Parameter Combinations:** ${parameterCombinations.length}\n**Replicates:** ${params.replicates}\n**Parallel Containers:** ${parallelContainers}\n\n### Parameter Ranges:\n\`\`\`json\n${JSON.stringify(params.parameter_ranges, null, 2)}\n\`\`\`\n\n### Status:\n- Queued: ${session.batch.queue.length}\n- Running: ${session.batch.running.size}\n- Completed: ${session.batch.completed.length}\n- Failed: ${session.batch.failed.length}`,
      };
      
      // Add to session cells
      session.cells.push(batchConfigCell);
      
      // Actually add to notebook via API
      notebookAPI.addCell(params.experiment_id, batchConfigCell, session.cells.length - 1);

      // Start the first batch of runs
      const startedRuns: RunSpec[] = [];
      for (let i = 0; i < parallelContainers; i++) {
        const runSpec = await startNextRun(session, proxyClient);
        if (runSpec) {
          startedRuns.push(runSpec);
          // Execute the run in its environment
          executeRun(session, runSpec, params.model_path, proxyClient);
        }
      }

      // Set up polling for run completion with notebook API
      pollForCompletion(session, params.model_path, notebookAPI, proxyClient);

      session.updatedAt = Date.now();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              experiment_id: params.experiment_id,
              status: 'running',
              total_runs: totalRuns,
              parameter_combinations: parameterCombinations.length,
              replicates: params.replicates,
              parallel_containers: parallelContainers,
              started_runs: startedRuns.length,
              queued: session.batch.queue.length,
              running: session.batch.running.size,
              message: `Batch experiment started with ${startedRuns.length} initial runs`,
            }, null, 2),
          },
        ],
      };
    }

    case 'pysd_get_results': {
      const params = z.object({
        experiment_id: z.string(),
        format: z.enum(['json', 'csv', 'summary']).default('json'),
      }).parse(args);

      const session = sessions.get(params.experiment_id) as PySDExperimentSession;
      if (!session) {
        throw new Error(`Experiment ${params.experiment_id} not found`);
      }

      // Get results from all environments
      const results = [];
      for (const [envId, envInfo] of session.containerEnvs) {
        if (envInfo.status === 'completed') {
          try {
            // Try to read results from container
            if (!proxyClient) {
              throw new Error('Proxy client not initialized for container-use operations');
            }

            const resultsResponse = await proxyClient.callTool(
              'mcp__container-use__environment_file_read', {
                environment_id: envId,
                environment_source: session.dir,
                target_file: 'results/run_summary.json',
                explanation: 'Reading experiment results',
              }
            );
            
            // Parse the results content
            const resultsContent = resultsResponse.content[0]?.text || '{}';
            const resultsData = JSON.parse(resultsContent);
            const parsedResults = resultsData.content ? JSON.parse(resultsData.content) : {};
            
            results.push({
              environment_id: envId,
              parameters: envInfo.parameters,
              ...parsedResults,
            });
          } catch (error) {
            console.warn(`Could not read results from ${envId}:`, error);
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              experiment_id: params.experiment_id,
              results,
              metadata: session.results.metadata,
              format: params.format,
            }, null, 2),
          },
        ],
      };
    }

    case 'pysd_aggregate_results': {
      const params = z.object({
        experiment_id: z.string(),
      }).parse(args);

      const session = sessions.get(params.experiment_id) as PySDExperimentSession;
      if (!session) {
        throw new Error(`Experiment ${params.experiment_id} not found`);
      }

      // Call the aggregateResults function
      const aggregatedResults = await aggregateResults(session);

      // Add aggregation results to notebook
      const aggregationCell: MarkdownCellType = {
        id: 'aggregation_results',
        type: 'markdown',
        text: `## Aggregation Results\n\n**Total Runs:** ${aggregatedResults.total_runs}\n**Successful:** ${aggregatedResults.successful_runs}\n**Failed:** ${aggregatedResults.failed_runs}\n**Aggregated at:** ${aggregatedResults.aggregation_timestamp}\n\n### Global Statistics\n\n${Object.entries(aggregatedResults.global_statistics.mean).map(([var_name, mean]) => 
          `- **${var_name}**: mean=${mean.toFixed(4)}, std=${aggregatedResults.global_statistics.std[var_name]?.toFixed(4) || 'N/A'}, min=${aggregatedResults.global_statistics.min[var_name]?.toFixed(4) || 'N/A'}, max=${aggregatedResults.global_statistics.max[var_name]?.toFixed(4) || 'N/A'}`
        ).join('\n')}\n\n### Output Files\n- \`results/aggregated_results.json\` - Complete aggregation data\n- \`results/aggregated_summary.csv\` - CSV summary for analysis\n- \`results/parameter_sweep_data.json\` - Visualization data`,
      };
      
      session.cells.push(aggregationCell);
      notebookAPI.addCell(params.experiment_id, aggregationCell, session.cells.length - 1);

      session.updatedAt = Date.now();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              experiment_id: params.experiment_id,
              status: 'aggregated',
              total_runs: aggregatedResults.total_runs,
              successful_runs: aggregatedResults.successful_runs,
              failed_runs: aggregatedResults.failed_runs,
              parameter_ranges: aggregatedResults.parameter_ranges,
              global_statistics: aggregatedResults.global_statistics,
              output_files: [
                'results/aggregated_results.json',
                'results/aggregated_summary.csv',
                'results/parameter_sweep_data.json',
              ],
              message: 'Results successfully aggregated',
            }, null, 2),
          },
        ],
      };
    }

    case 'pysd_cleanup_experiment': {
      const params = z.object({
        experiment_id: z.string(),
        archive_results: z.boolean().default(false),
        storage_config: z.object({
          bucket: z.string().optional(),
          prefix: z.string().optional(),
          endpoint: z.string().optional(),
        }).optional(),
      }).parse(args);

      const session = sessions.get(params.experiment_id) as PySDExperimentSession;
      if (!session) {
        throw new Error(`Experiment ${params.experiment_id} not found`);
      }

      // Call the cleanup function
      const cleanupResult = await cleanupExperiment(
        session,
        params.archive_results,
        params.storage_config,
        proxyClient
      );

      // Remove session from sessions map after cleanup
      sessions.delete(params.experiment_id);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              experiment_id: params.experiment_id,
              status: 'cleaned_up',
              environments_destroyed: cleanupResult.destroyed.length,
              destroyed_env_ids: cleanupResult.destroyed,
              archived: cleanupResult.archived,
              archive_location: cleanupResult.archiveLocation,
              message: `Experiment ${params.experiment_id} has been cleaned up successfully`,
            }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown PySD tool: ${toolName}`);
  }
}

