# Notebook Engine API Documentation

The `@srcbook/notebook-engine` package provides a headless notebook execution engine for Srcbook, enabling programmatic control of TypeScript notebook sessions.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core APIs](#core-apis)
- [Communication Layer](#communication-layer)
- [Lifecycle Management](#lifecycle-management)
- [Performance Monitoring](#performance-monitoring)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Installation

```bash
npm install @srcbook/notebook-engine
```

## Quick Start

```typescript
import { NotebookAPI, NotebookLifecycleManager } from '@srcbook/notebook-engine';

// Create API instance
const api = new NotebookAPI();

// Create a session
const session = api.createSession({
  language: 'typescript',
  tsconfig: {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      strict: true
    }
  },
  cells: []
});

// Add a code cell
api.addCell(session.id, {
  id: 'my-cell',
  type: 'code',
  language: 'typescript',
  text: 'console.log("Hello from notebook engine!");',
  filename: 'hello.ts'
});

// Execute the cell
const result = await api.executeCell(session.id, 'my-cell');
console.log('Output:', result.stdout);
```

## Core APIs

### NotebookAPI

The main interface for notebook operations.

#### Methods

##### `createSession(data: Omit<SessionType, 'id'>): SessionType`

Creates a new notebook session.

```typescript
const session = api.createSession({
  language: 'typescript',
  tsconfig: {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext'
    }
  },
  cells: []
});
```

##### `getSession(sessionId: string): SessionType`

Retrieves a session by ID.

```typescript
const session = api.getSession('session-123');
```

##### `deleteSession(sessionId: string): void`

Deletes a session and cleans up resources.

```typescript
api.deleteSession('session-123');
```

##### `addCell(sessionId: string, cell: CellType, index?: number): SessionType`

Adds a cell to a session.

```typescript
api.addCell(sessionId, {
  id: 'cell-1',
  type: 'code',
  language: 'typescript',
  text: 'const x = 42;',
  filename: 'variable.ts'
}, 0); // Insert at beginning
```

##### `updateCell(sessionId: string, cellId: string, updates: Partial<CellType>): SessionType`

Updates an existing cell.

```typescript
api.updateCell(sessionId, 'cell-1', {
  text: 'const x = 100; // Updated value'
});
```

##### `removeCell(sessionId: string, cellId: string): SessionType`

Removes a cell from the session.

```typescript
api.removeCell(sessionId, 'cell-1');
```

##### `executeCell(sessionId: string, cellId: string, options?: Partial<ExecutionOptions>): Promise<ExecutionResult>`

Executes a single cell.

```typescript
const result = await api.executeCell(sessionId, 'cell-1', {
  timeout: 10000,
  cwd: '/path/to/working/directory'
});

console.log('Exit code:', result.exitCode);
console.log('Output:', result.stdout);
console.log('Errors:', result.stderr);
```

##### `executeAllCells(sessionId: string, options?: Partial<ExecutionOptions>): Promise<ExecutionResult[]>`

Executes all cells in the session sequentially.

```typescript
const results = await api.executeAllCells(sessionId);
results.forEach((result, index) => {
  console.log(`Cell ${index} exit code:`, result.exitCode);
});
```

##### `stopExecution(sessionId: string, cellId: string): Promise<void>`

Stops a running cell execution.

```typescript
await api.stopExecution(sessionId, 'long-running-cell');
```

### Types

#### `ExecutionOptions`

Options for cell execution.

```typescript
interface ExecutionOptions {
  timeout: number;        // Execution timeout in milliseconds
  cwd: string;           // Working directory
  env: Record<string, string>; // Environment variables
}
```

#### `ExecutionResult`

Result of cell execution.

```typescript
interface ExecutionResult {
  exitCode: number;       // Exit code (0 = success)
  stdout: string;         // Standard output
  stderr: string;         // Standard error
  duration: number;       // Execution time in milliseconds
}
```

## Communication Layer

### Event Bus

The event bus enables real-time communication and monitoring.

```typescript
import { NotebookEventBus } from '@srcbook/notebook-engine';

const eventBus = new NotebookEventBus();

// Listen for cell execution events
eventBus.onCellExecution((event) => {
  console.log(`Cell ${event.data.cellId} status: ${event.data.status}`);
});

// Listen for cell updates
eventBus.onCellUpdate((event) => {
  console.log(`Cell ${event.data.cellId} updated`);
});

// Add middleware for logging
eventBus.use((event, next) => {
  console.log(`Processing event: ${event.type}`);
  next();
});
```

### REST API Adapter

Provides HTTP API interface for notebook operations.

```typescript
import { RestApiAdapter } from '@srcbook/notebook-engine';

const adapter = new RestApiAdapter({
  baseUrl: 'http://localhost:3000',
  timeout: 30000
});

// Execute cell via REST
const result = await adapter.executeCell(sessionId, cellId, {
  timeout: 5000
});

// Create Express middleware
const middleware = adapter.createExpressMiddleware();

app.post('/api/sessions/:sessionId/cells/:cellId/execute', 
  middleware.executeCell);
```

### Protocol Communication

Low-level protocol for command/response communication.

```typescript
import { NotebookProtocol, MemoryChannel } from '@srcbook/notebook-engine';

const channel = new MemoryChannel();
const protocol = new NotebookProtocol(channel);

// Send command
const response = await protocol.sendCommand({
  type: 'execute',
  sessionId: 'session-123',
  cellId: 'cell-1',
  payload: { timeout: 5000 }
});

console.log('Command result:', response.data);
```

## Lifecycle Management

### NotebookLifecycleManager

Manages notebook lifecycle with auto-save, checkpointing, and idle detection.

```typescript
import { NotebookLifecycleManager } from '@srcbook/notebook-engine';

const lifecycleManager = new NotebookLifecycleManager({
  autoSave: true,
  autoSaveInterval: 30000,    // 30 seconds
  maxIdleTime: 300000,        // 5 minutes
  checkpointInterval: 600000  // 10 minutes
});

// Create managed notebook
const sessionId = await lifecycleManager.createNotebook({
  language: 'typescript',
  tsconfig: {},
  cells: []
});

// Monitor notebook state
const state = lifecycleManager.getNotebookState(sessionId);
console.log('Current state:', state?.state); // 'active', 'idle', 'suspended', etc.

// Suspend notebook (saves state, stops processes)
await lifecycleManager.suspendNotebook(sessionId);

// Resume notebook
await lifecycleManager.resumeNotebook(sessionId);

// Terminate notebook (cleanup)
await lifecycleManager.terminateNotebook(sessionId);
```

#### Lifecycle States

- `creating` - Notebook is being initialized
- `active` - Notebook is running and responsive
- `idle` - Notebook is inactive but available
- `suspended` - Notebook is paused with state saved
- `terminated` - Notebook is stopped and cleaned up

## Performance Monitoring

### NotebookPerformanceMonitor

Tracks performance metrics and benchmarks.

```typescript
import { NotebookPerformanceMonitor, performanceMonitor } from '@srcbook/notebook-engine';

// Use global instance
const monitor = performanceMonitor;

// Start timing an operation
monitor.startTimer('cell-execution');

// Execute operation
await api.executeCell(sessionId, cellId);

// End timing
const benchmark = monitor.endTimer('cell-execution', true);
console.log('Execution time:', benchmark.duration, 'ms');

// Record metrics
monitor.recordMetrics(sessionId, cellCount, executionTime);

// Get performance report
const report = monitor.getPerformanceReport();
console.log('Average execution time:', report.averageExecutionTime);
console.log('Memory stats:', report.memoryStats);

// Add to event bus
eventBus.use(monitor.createEventMiddleware());
```

#### Performance Metrics

```typescript
interface PerformanceMetrics {
  executionTime: number;          // Time in milliseconds
  memoryUsage: NodeJS.MemoryUsage; // Memory usage snapshot
  cellCount: number;              // Number of cells
  sessionId: string;              // Session identifier
  timestamp: number;              // When recorded
}
```

## Error Handling

### Exception Types

The engine provides specific error types for different scenarios:

```typescript
// Cell execution timeout
try {
  await api.executeCell(sessionId, cellId, { timeout: 1000 });
} catch (error) {
  if (error.message.includes('timeout')) {
    console.log('Cell execution timed out');
  }
}

// Session not found
try {
  api.getSession('invalid-session');
} catch (error) {
  console.log('Session not found:', error.message);
}

// Invalid cell
try {
  api.executeCell(sessionId, 'non-existent-cell');
} catch (error) {
  console.log('Cell not found:', error.message);
}
```

### Error Recovery

```typescript
// Graceful error handling
const result = await api.executeCell(sessionId, cellId);
if (result.exitCode !== 0) {
  console.log('Cell failed with error:', result.stderr);
  
  // Attempt recovery by executing a cleanup cell
  await api.executeCell(sessionId, 'cleanup-cell');
}

// Lifecycle error recovery
try {
  await lifecycleManager.resumeNotebook(sessionId);
} catch (error) {
  console.log('Resume failed, recreating notebook...');
  const newSessionId = await lifecycleManager.createNotebook(sessionData);
}
```

## Examples

### Complete Workflow Example

```typescript
import {
  NotebookAPI,
  NotebookLifecycleManager,
  NotebookEventBus,
  performanceMonitor
} from '@srcbook/notebook-engine';

async function runNotebookWorkflow() {
  // Initialize components
  const api = new NotebookAPI();
  const lifecycleManager = new NotebookLifecycleManager({
    autoSave: true,
    autoSaveInterval: 30000
  });
  const eventBus = new NotebookEventBus();

  // Add performance monitoring
  eventBus.use(performanceMonitor.createEventMiddleware());

  // Listen for execution events
  eventBus.onCellExecution((event) => {
    console.log(`Cell ${event.data.cellId}: ${event.data.status}`);
  });

  // Create managed notebook
  const sessionId = await lifecycleManager.createNotebook({
    language: 'typescript',
    tsconfig: {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        strict: true
      }
    },
    cells: []
  });

  try {
    // Add cells
    const cells = [
      {
        id: 'setup',
        type: 'code' as const,
        language: 'typescript',
        text: 'const data = [1, 2, 3, 4, 5];',
        filename: 'setup.ts'
      },
      {
        id: 'process',
        type: 'code' as const,
        language: 'typescript',
        text: 'const doubled = data.map(x => x * 2);',
        filename: 'process.ts'
      },
      {
        id: 'output',
        type: 'code' as const,
        language: 'typescript',
        text: 'console.log("Result:", doubled);',
        filename: 'output.ts'
      }
    ];

    cells.forEach(cell => api.addCell(sessionId, cell));

    // Execute all cells
    const results = await api.executeAllCells(sessionId);
    
    // Check results
    const allSuccessful = results.every(r => r.exitCode === 0);
    console.log('All cells executed successfully:', allSuccessful);

    if (allSuccessful) {
      console.log('Final output:', results[2].stdout);
    }

    // Get performance report
    const report = performanceMonitor.getPerformanceReport();
    console.log('Performance report:', report);

  } finally {
    // Clean up
    await lifecycleManager.terminateNotebook(sessionId);
  }
}

// Run the workflow
runNotebookWorkflow().catch(console.error);
```

### Custom Communication Channel

```typescript
import { CommunicationChannel, NotebookMessage } from '@srcbook/notebook-engine';

class CustomChannel implements CommunicationChannel {
  private messageHandler?: (message: NotebookMessage) => void;

  send(message: NotebookMessage): void {
    // Custom send logic (e.g., WebSocket, HTTP, etc.)
    console.log('Sending message:', message);
  }

  onMessage(handler: (message: NotebookMessage) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    // Cleanup logic
    this.messageHandler = undefined;
  }

  // Simulate receiving a message
  private simulateReceive(message: NotebookMessage): void {
    this.messageHandler?.(message);
  }
}

// Use custom channel with protocol
const customChannel = new CustomChannel();
const protocol = new NotebookProtocol(customChannel);
```

### Integration with Express.js

```typescript
import express from 'express';
import { RestApiAdapter, NotebookAPI } from '@srcbook/notebook-engine';

const app = express();
const api = new NotebookAPI();
const adapter = new RestApiAdapter({
  baseUrl: 'http://localhost:3000'
});

app.use(express.json());

// Get middleware
const middleware = adapter.createExpressMiddleware();

// Define routes
app.post('/api/sessions', (req, res) => {
  try {
    const session = api.createSession(req.body);
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.post('/api/sessions/:sessionId/cells/:cellId/execute', 
  middleware.executeCell);

app.put('/api/sessions/:sessionId/cells/:cellId', 
  middleware.updateCell);

app.post('/api/sessions/:sessionId/cells', 
  middleware.createCell);

app.delete('/api/sessions/:sessionId/cells/:cellId', 
  middleware.deleteCell);

app.listen(3000, () => {
  console.log('Notebook API server running on port 3000');
});
```

## API Reference Summary

### Core Classes

- `NotebookAPI` - Main API for notebook operations
- `NotebookExecutionEngine` - Low-level execution engine
- `NotebookLifecycleManager` - Lifecycle and state management
- `NotebookEventBus` - Event-driven communication
- `NotebookPerformanceMonitor` - Performance tracking
- `RestApiAdapter` - HTTP API integration
- `NotebookProtocol` - Command/response protocol

### Key Interfaces

- `SessionType` - Notebook session structure
- `CellType` - Cell definition
- `ExecutionOptions` - Execution configuration
- `ExecutionResult` - Execution output
- `NotebookEvent` - Event structure
- `PerformanceMetrics` - Performance data

### Utility Functions

- `validateSessionStructure()` - Session validation
- `validateCell()` - Cell validation
- `generateCellId()` - Unique cell ID generation
- `generateSessionId()` - Unique session ID generation
- `createCodeCell()` - Code cell factory
- `createMarkdownCell()` - Markdown cell factory

For more detailed examples and advanced usage, see the test files in `src/__tests__/`.