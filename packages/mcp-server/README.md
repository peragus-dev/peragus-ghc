# Srcbook MCP Server

This package provides a Model Context Protocol (MCP) server for Srcbook, enabling AI agents to programmatically create, execute, and manage TypeScript/JavaScript notebooks.

## Features

- **Notebook Management**: Create, list, and delete notebook sessions
- **Cell Operations**: Add, execute, update, and delete cells
- **Advanced Operations**: Export/import notebooks, visualize data
- **Resource Access**: Read notebook state and execution history
- **Event Streaming**: Real-time updates (coming soon)

## Installation

```bash
npm install @srcbook/mcp-server
```

## Usage

### For Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "srcbook-notebook": {
      "command": "npx",
      "args": ["@srcbook/mcp-server"]
    }
  }
}
```

### For Other AI Agents

Start the MCP server:

```bash
npx @srcbook/mcp-server
```

The server communicates via stdio (standard input/output) using the MCP protocol.

## Available Tools

### Notebook Management

#### `notebook_create`
Creates a new notebook session.

```typescript
{
  name: "My Analysis",
  language: "typescript", // or "javascript"
  description: "Sales data analysis",
  tsconfig: { /* optional TypeScript config */ }
}
```

#### `notebook_list`
Lists all notebook sessions.

```typescript
{
  filter: "active" // "active" | "suspended" | "all"
}
```

#### `notebook_delete`
Deletes a notebook session.

```typescript
{
  session_id: "session_123456"
}
```

### Cell Operations

#### `cell_add`
Adds a new cell to the notebook.

```typescript
{
  session_id: "session_123456",
  type: "code", // or "markdown"
  content: "console.log('Hello, World!')",
  position: 0 // optional, defaults to end
}
```

#### `cell_execute`
Executes code cells.

```typescript
{
  session_id: "session_123456",
  cell_id: "cell_abc123", // or "all" for all cells
  timeout: 30000 // optional, in milliseconds
}
```

#### `cell_update`
Updates a cell's content.

```typescript
{
  session_id: "session_123456",
  cell_id: "cell_abc123",
  content: "// Updated code"
}
```

#### `cell_delete`
Removes a cell.

```typescript
{
  session_id: "session_123456",
  cell_id: "cell_abc123"
}
```

### Advanced Operations

#### `notebook_export`
Exports a notebook in various formats.

```typescript
{
  session_id: "session_123456",
  format: "markdown", // "json" | "markdown" | "html" | "pdf"
  include_outputs: true
}
```

#### `notebook_import`
Imports a notebook from various formats.

```typescript
{
  content: "# My Notebook\n\n```typescript\nconsole.log('Hello');\n```",
  format: "markdown" // "json" | "markdown" | "ipynb"
}
```

#### `cell_visualize`
Generates visualizations from cell data (coming soon).

```typescript
{
  session_id: "session_123456",
  cell_id: "cell_abc123",
  type: "chart", // "chart" | "table" | "graph" | "auto"
  options: { /* visualization options */ }
}
```

## Resources

The MCP server exposes notebook data as resources:

- `notebook://sessions` - List of all sessions
- `notebook://session/{id}/state` - Full notebook state
- `notebook://session/{id}/history` - Execution history
- `notebook://session/{id}/cell/{cellId}` - Individual cell content

## Example Usage

### Data Analysis Workflow

```typescript
// Create a notebook
const { session_id } = await mcp.call('notebook_create', {
  name: 'Q4 Sales Analysis',
  description: 'Analyzing quarterly sales data'
});

// Add data loading cell
const { cell_id: dataCell } = await mcp.call('cell_add', {
  session_id,
  content: `
    const salesData = [
      { month: 'Oct', revenue: 125000 },
      { month: 'Nov', revenue: 148000 },
      { month: 'Dec', revenue: 172000 }
    ];
    console.log('Loaded', salesData.length, 'months');
  `
});

// Execute the cell
const result = await mcp.call('cell_execute', {
  session_id,
  cell_id: dataCell
});
// Output: "Loaded 3 months"

// Add analysis cell
await mcp.call('cell_add', {
  session_id,
  content: `
    const totalRevenue = salesData.reduce((sum, m) => sum + m.revenue, 0);
    console.log('Total Q4 Revenue: $' + totalRevenue.toLocaleString());
  `
});

// Execute all cells
await mcp.call('cell_execute', {
  session_id,
  cell_id: 'all'
});

// Export as markdown
const { content } = await mcp.call('notebook_export', {
  session_id,
  format: 'markdown'
});
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## Security

- Each notebook session runs in an isolated process
- Resource limits are enforced (CPU, memory, execution time)
- File system access is sandboxed to the notebook directory
- Network access can be configured via options

## License

Apache-2.0