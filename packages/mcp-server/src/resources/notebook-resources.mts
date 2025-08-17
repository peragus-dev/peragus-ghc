import type { Resource } from '@modelcontextprotocol/sdk/types.js';

import type { MCPSessionType } from '../types.mjs';

// Resource providers
export function notebookResources(sessions: Map<string, MCPSessionType>): Resource[] {
  const resources: Resource[] = [];

  // Global guide: PySD parallel experiments workflow
  resources.push({
    uri: 'guide://pysd-workflow',
    name: 'PySD Parallel Experiments Workflow',
    mimeType: 'text/markdown',
    description: 'Step-by-step workflow to run parallel PySD experiments via container-use (with checkpoint optimization).',
  });

  // Add resources for each active session
  sessions.forEach((session, sessionId) => {
    // Notebook state resource
    resources.push({
      uri: `notebook://session/${sessionId}/state`,
      name: `${session.name} - State`,
      mimeType: 'application/json',
      description: `Current state of notebook "${session.name}" including all cells`,
    });

    // Execution history resource
    resources.push({
      uri: `notebook://session/${sessionId}/history`,
      name: `${session.name} - History`,
      mimeType: 'application/json',
      description: `Execution history for notebook "${session.name}"`,
    });

    // Individual cell resources
    session.cells.forEach((cell: any, index: number) => {
      resources.push({
        uri: `notebook://session/${sessionId}/cell/${cell.id}`,
        name: `${session.name} - Cell ${index + 1}`,
        mimeType: cell.type === 'code' ? 'application/typescript' : 'text/markdown',
        description: `${cell.type === 'code' ? 'Code' : 'Markdown'} cell from "${session.name}"`,
      });
    });
  });

  // Add a general sessions list resource
  resources.push({
    uri: 'notebook://sessions',
    name: 'All Notebook Sessions',
    mimeType: 'application/json',
    description: 'List of all active notebook sessions',
  });

  return resources;
}

// Resource reader
export async function readNotebookResource(uri: string, sessions: Map<string, MCPSessionType>) {
  // Parse the URI
  const match = uri.match(/^notebook:\/\/(.+)$/);
  if (!match) {
    // Handle global guide resources
    if (uri === 'guide://pysd-workflow') {
      const guideText = `### PySD Parallel Experiments Workflow (via container-use MCP)

This guide describes how to run multiple PySD data experiments in parallel using container-use, orchestrated by the PySD tools in this MCP server. It includes an optimization to checkpoint the prepared environment for fast spin-up of batch runs.

#### 1) Create a new experiment
- Tool: \`pysd_create_experiment\`
- Args:
\`\n{
  "name": "Teacup Batch",
  "description": "Teacup cooling parameter sweep",
  "experiment_type": "single",  
  "base_image": "python:3.11"
}\n\`

#### 2) Load model and prepare environment
- Tool: \`pysd_load_model\`
- Args (example using upload):
\`\n{
  "experiment_id": "<from step 1>",
  "source": { "type": "upload", "content": "<base64 of model>" },
  "filename": "teacup.mdl"
}\n\`
- What happens:
  - Creates a base container, installs PySD stack, converts model if needed, and sets \`model_path\`.
  - Optimization: the server checkpoints the prepared environment and stores the image in \`session.results.metadata.baseImage\` so subsequent batch runs start faster.

#### 3) Run batch experiments in parallel
- Tool: \`pysd_batch_experiment\`
- Args (example):
\`\n{
  "experiment_id": "<id>",
  "model_path": "models/teacup.mdl.py",
  "parameter_ranges": {
    "room_temperature": [65, 70, 75],
    "characteristic_time": [10, 15]
  },
  "parallel_containers": 4,
  "replicates": 2
}\n\`
- Behavior:
  - Queues all combinations, starts up to \`parallel_containers\` in parallel.
  - New containers reuse the checkpoint image (if present) and skip heavy installs.
  - Progress and ETA are written as notebook markdown updates; logs available via \`container-use log <env_id>\`.

#### 4) Monitor progress
- Tool: \`pysd_get_status\`
- Args: \`{ "experiment_id": "<id>" }\`
- Returns summary, per-run details, and container-use commands (log/terminal/checkout).

#### 5) Aggregate results
- Tool: \`pysd_aggregate_results\`
- Args: \`{ "experiment_id": "<id>" }\`
- Outputs in-container files:
  - \`results/aggregated_results.json\`
  - \`results/aggregated_summary.csv\`
  - \`results/parameter_sweep_data.json\`

#### 6) Cleanup
- Tool: \`pysd_cleanup_experiment\`
- Args: \`{ "experiment_id": "<id>", "archive_results": false }\`

Notes:
- All operations route through container-use MCP tools; no direct host operations.
- If checkpoint is unavailable, the system falls back to base Python image and installs dependencies normally.
`;

      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: guideText,
          },
        ],
      };
    }
    throw new Error(`Invalid notebook URI: ${uri}`);
  }

  const path = match[1]!;

  // Handle sessions list
  if (path === 'sessions') {
    const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
      id,
      name: session.name,
      description: session.description,
      cell_count: session.cells.length,
      language: session.language,
      created_at: new Date(session.createdAt).toISOString(),
      updated_at: new Date(session.updatedAt).toISOString(),
    }));

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(sessionList, null, 2),
        },
      ],
    };
  }

  // Handle session-specific resources
  const sessionMatch = path.match(/^session\/([^\/]+)\/(.+)$/);
  if (!sessionMatch) {
    throw new Error(`Invalid notebook resource path: ${path}`);
  }

  const [, sessionId, resourceType] = sessionMatch;
  if (!sessionId || !resourceType) {
    throw new Error(`Invalid notebook resource path: ${path}`);
  }
  const session = sessions.get(sessionId);
  
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Handle different resource types
  switch (resourceType) {
    case 'state': {
      // Return full session state
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              id: session.id,
              name: session.name,
              description: session.description,
              language: session.language,
              cells: session.cells,
              tsconfig: session.tsconfig,
              created_at: new Date(session.createdAt).toISOString(),
              updated_at: new Date(session.updatedAt).toISOString(),
            }, null, 2),
          },
        ],
      };
    }

    case 'history': {
      // Return execution history (would be tracked in a real implementation)
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              session_id: sessionId,
              executions: [],
              message: 'Execution history tracking not yet implemented',
            }, null, 2),
          },
        ],
      };
    }

    default: {
      // Check if it's a cell resource
      const cellMatch = resourceType.match(/^cell\/(.+)$/);
      if (cellMatch) {
        const cellId = cellMatch[1];
        const cell = session.cells.find((c: any) => c.id === cellId);
        
        if (!cell) {
          throw new Error(`Cell ${cellId} not found in session ${sessionId}`);
        }

        return {
          contents: [
            {
              uri,
              mimeType: cell.type === 'code' ? 'application/typescript' : 'text/markdown',
              text: cell.type === 'code' ? (cell as any).source : (cell as any).text,
            },
          ],
        };
      }

      throw new Error(`Unknown resource type: ${resourceType}`);
    }
  }
}