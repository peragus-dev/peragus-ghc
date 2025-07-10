# MCP Notebook Integration Specification

## Overview

This specification describes the end state for integrating Srcbook's headless notebook execution engine with the Model Context Protocol (MCP), enabling AI agents to programmatically create, execute, and manage TypeScript/JavaScript notebooks.

## Vision

AI agents will be able to use Srcbook notebooks as a powerful computational environment for:
- Data analysis and visualization
- Code prototyping and testing
- Multi-step problem solving
- Educational content creation
- Automated report generation

## Architecture

### System Components

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Claude/Agent  │────▶│   MCP Server     │────▶│ Notebook Engine │
│                 │◀────│                  │◀────│                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                         │
         │                       │                         │
         ▼                       ▼                         ▼
   MCP Protocol            MCP Tools              TypeScript/JS
   Communication          & Resources             Code Execution
```

### MCP Server

The MCP server (`@srcbook/mcp-server`) will expose notebook functionality through standardized MCP interfaces:

- **Transport**: stdio (standard input/output)
- **Protocol**: JSON-RPC 2.0
- **Authentication**: Optional token-based auth for remote deployments

## MCP Tools

### Notebook Management

#### `notebook_create`
Creates a new notebook session with specified configuration.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Human-readable notebook name"
    },
    "language": {
      "type": "string",
      "enum": ["typescript", "javascript"],
      "default": "typescript"
    },
    "description": {
      "type": "string",
      "description": "Notebook purpose/description"
    },
    "tsconfig": {
      "type": "object",
      "description": "TypeScript compiler options"
    }
  },
  "required": ["name"]
}
```

**Returns:** Session ID and notebook metadata

#### `notebook_list`
Lists all active notebook sessions.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "filter": {
      "type": "string",
      "enum": ["active", "suspended", "all"],
      "default": "active"
    }
  }
}
```

**Returns:** Array of notebook sessions with metadata

#### `notebook_delete`
Terminates and cleans up a notebook session.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Notebook session identifier"
    }
  },
  "required": ["session_id"]
}
```

### Cell Operations

#### `cell_add`
Adds a new cell to the notebook.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string"
    },
    "type": {
      "type": "string",
      "enum": ["code", "markdown"],
      "default": "code"
    },
    "content": {
      "type": "string",
      "description": "Cell content (code or markdown)"
    },
    "position": {
      "type": "integer",
      "description": "Insert position (default: end)"
    }
  },
  "required": ["session_id", "content"]
}
```

**Returns:** Cell ID and position

#### `cell_execute`
Executes a code cell and returns results.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string"
    },
    "cell_id": {
      "type": "string",
      "description": "Specific cell ID or 'all' for all cells"
    },
    "timeout": {
      "type": "integer",
      "description": "Execution timeout in milliseconds",
      "default": 30000
    }
  },
  "required": ["session_id", "cell_id"]
}
```

**Returns:** Execution results with stdout, stderr, and return values

#### `cell_update`
Updates an existing cell's content.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string"
    },
    "cell_id": {
      "type": "string"
    },
    "content": {
      "type": "string",
      "description": "New cell content"
    }
  },
  "required": ["session_id", "cell_id", "content"]
}
```

#### `cell_delete`
Removes a cell from the notebook.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string"
    },
    "cell_id": {
      "type": "string"
    }
  },
  "required": ["session_id", "cell_id"]
}
```

### Advanced Operations

#### `notebook_export`
Exports notebook in various formats.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string"
    },
    "format": {
      "type": "string",
      "enum": ["json", "markdown", "html", "pdf"],
      "default": "json"
    },
    "include_outputs": {
      "type": "boolean",
      "default": true
    }
  },
  "required": ["session_id"]
}
```

**Returns:** Exported notebook content in specified format

#### `notebook_import`
Imports a notebook from various formats.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "description": "Notebook content to import"
    },
    "format": {
      "type": "string",
      "enum": ["json", "markdown", "ipynb"],
      "default": "json"
    }
  },
  "required": ["content"]
}
```

**Returns:** New session ID for imported notebook

#### `cell_visualize`
Generates visualizations from cell data.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string"
    },
    "cell_id": {
      "type": "string"
    },
    "type": {
      "type": "string",
      "enum": ["chart", "table", "graph", "auto"],
      "default": "auto"
    },
    "options": {
      "type": "object",
      "description": "Visualization-specific options"
    }
  },
  "required": ["session_id", "cell_id"]
}
```

**Returns:** Visualization as base64 image or structured data

## MCP Resources

### Notebook State Resource
Exposes notebook state as a readable resource.

```typescript
{
  uri: "notebook://session/{session_id}/state",
  name: "Notebook State",
  mimeType: "application/json",
  description: "Current notebook state including all cells"
}
```

### Execution History Resource
Provides access to cell execution history.

```typescript
{
  uri: "notebook://session/{session_id}/history",
  name: "Execution History",
  mimeType: "application/json",
  description: "Historical execution results and outputs"
}
```

## Event Streaming

The MCP server will support event streaming for real-time updates:

- `notebook.cell.executing` - Cell execution started
- `notebook.cell.output` - Streaming output during execution
- `notebook.cell.completed` - Cell execution finished
- `notebook.state.changed` - Notebook state updated
- `notebook.error` - Error occurred

## Usage Examples

### Example 1: Data Analysis Workflow
```typescript
// Agent creates a notebook for data analysis
const { session_id } = await mcp.call('notebook_create', {
  name: 'Sales Analysis Q4 2024',
  description: 'Quarterly sales data analysis'
});

// Add data loading cell
const { cell_id: dataCell } = await mcp.call('cell_add', {
  session_id,
  content: `
    const salesData = [
      { month: 'Oct', revenue: 125000, units: 543 },
      { month: 'Nov', revenue: 148000, units: 621 },
      { month: 'Dec', revenue: 172000, units: 701 }
    ];
    console.log('Data loaded:', salesData.length, 'months');
  `
});

// Execute and get results
const { stdout } = await mcp.call('cell_execute', {
  session_id,
  cell_id: dataCell
});
// stdout: "Data loaded: 3 months"

// Add analysis cell
await mcp.call('cell_add', {
  session_id,
  content: `
    const totalRevenue = salesData.reduce((sum, m) => sum + m.revenue, 0);
    const avgRevenue = totalRevenue / salesData.length;
    console.log('Q4 Summary:');
    console.log('- Total Revenue: $' + totalRevenue.toLocaleString());
    console.log('- Average Monthly: $' + avgRevenue.toLocaleString());
  `
});

// Execute all cells
const results = await mcp.call('cell_execute', {
  session_id,
  cell_id: 'all'
});
```

### Example 2: Code Testing Environment
```typescript
// Agent tests different implementations
const { session_id } = await mcp.call('notebook_create', {
  name: 'Algorithm Comparison',
  language: 'typescript'
});

// Add multiple implementation cells
await mcp.call('cell_add', {
  session_id,
  content: `
    // Bubble sort implementation
    function bubbleSort(arr: number[]): number[] {
      const n = arr.length;
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - i - 1; j++) {
          if (arr[j] > arr[j + 1]) {
            [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
          }
        }
      }
      return arr;
    }
  `
});

await mcp.call('cell_add', {
  session_id,
  content: `
    // Quick sort implementation
    function quickSort(arr: number[]): number[] {
      if (arr.length <= 1) return arr;
      const pivot = arr[0];
      const left = arr.slice(1).filter(x => x < pivot);
      const right = arr.slice(1).filter(x => x >= pivot);
      return [...quickSort(left), pivot, ...quickSort(right)];
    }
  `
});

// Add benchmarking cell
await mcp.call('cell_add', {
  session_id,
  content: `
    const testData = Array.from({length: 1000}, () => Math.random() * 1000);
    
    console.time('Bubble Sort');
    bubbleSort([...testData]);
    console.timeEnd('Bubble Sort');
    
    console.time('Quick Sort');
    quickSort([...testData]);
    console.timeEnd('Quick Sort');
  `
});

// Execute and compare
const { stdout } = await mcp.call('cell_execute', {
  session_id,
  cell_id: 'all'
});
```

## Security Considerations

1. **Code Execution Isolation**
   - Each notebook session runs in an isolated process
   - Resource limits enforced (CPU, memory, execution time)
   - No access to system resources without explicit permissions

2. **File System Access**
   - Sandboxed to notebook working directory
   - No access to parent directories
   - Temporary file cleanup on session termination

3. **Network Access**
   - Configurable network policies
   - Whitelist/blacklist for external resources
   - Request logging and monitoring

## Configuration

MCP server configuration in `srcbook-mcp.json`:

```json
{
  "name": "srcbook-notebook",
  "version": "1.0.0",
  "description": "Srcbook notebook execution for AI agents",
  "main": "./dist/mcp-server.js",
  "capabilities": {
    "tools": true,
    "resources": true,
    "events": true
  },
  "options": {
    "maxSessions": 10,
    "sessionTimeout": 3600000,
    "executionTimeout": 30000,
    "maxMemoryPerSession": "512MB",
    "allowNetworkAccess": false,
    "persistSessions": true,
    "storageDirectory": "./notebook-sessions"
  }
}
```

## Implementation Phases

### Phase 1: Core MCP Integration
- Basic MCP server implementation
- Essential tools (create, execute, list)
- Simple stdio transport

### Phase 2: Advanced Features
- Full tool suite implementation
- Resource providers
- Event streaming

### Phase 3: Production Readiness
- Security hardening
- Performance optimization
- Monitoring and logging
- Multi-transport support (HTTP, WebSocket)

### Phase 4: Enhanced Capabilities
- Visualization generation
- Import/export formats
- Collaborative features
- Cloud deployment support

## Success Metrics

1. **Functionality**
   - All specified tools operational
   - <100ms tool invocation overhead
   - 99.9% execution reliability

2. **Performance**
   - Support 100+ concurrent sessions
   - <1s notebook creation time
   - <50ms cell execution startup

3. **Adoption**
   - Integration with major AI assistants
   - 1000+ daily active notebooks
   - Community-contributed tool extensions

## Future Enhancements

1. **Language Support**
   - Python kernel integration
   - R and Julia support
   - SQL query cells

2. **Collaboration**
   - Multi-agent notebook sharing
   - Real-time collaborative editing
   - Version control integration

3. **Intelligence**
   - Auto-completion for code cells
   - Error suggestion and fixes
   - Performance optimization hints

4. **Ecosystem**
   - Plugin system for custom tools
   - Marketplace for notebook templates
   - Integration with external services