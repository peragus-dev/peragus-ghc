import type { Resource } from '@modelcontextprotocol/sdk/types.js';

import type { MCPSessionType } from '../types.mjs';

// Resource providers
export function notebookResources(sessions: Map<string, MCPSessionType>): Resource[] {
  const resources: Resource[] = [];

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