import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotebookAPI } from '../../api.mjs';
import { NotebookExecutionEngine } from '../../execution/engine.mjs';
import { NotebookEventBus } from '../../communication/event-bus.mjs';
import { NotebookLifecycleManager } from '../../lifecycle/manager.mjs';
import type { SessionType, CodeCellType } from '../../types/index.mjs';

describe('Notebook Engine Integration Tests', () => {
  let api: NotebookAPI;
  let engine: NotebookExecutionEngine;
  let eventBus: NotebookEventBus;
  let lifecycleManager: NotebookLifecycleManager;
  let sessionId: string;

  beforeEach(async () => {
    api = new NotebookAPI();
    engine = new NotebookExecutionEngine();
    eventBus = new NotebookEventBus();
    lifecycleManager = new NotebookLifecycleManager({
      autoSave: false,
      maxIdleTime: 60000
    });

    // Create a test session
    const sessionData: Omit<SessionType, 'id'> = {
      language: 'typescript',
      tsconfig: {},
      cells: []
    };
    
    const session = api.createSession(sessionData);
    sessionId = session.id;
  });

  afterEach(async () => {
    if (sessionId) {
      await lifecycleManager.terminateNotebook(sessionId);
    }
  });

  describe('Full Execution Pipeline', () => {
    it('should execute a simple TypeScript cell end-to-end', async () => {
      // Create a simple code cell
      const cell: CodeCellType = {
        id: 'test-cell-1',
        type: 'code',
        language: 'typescript',
        text: 'console.log("Hello from headless notebook!");',
        filename: 'test.ts'
      };

      // Add cell to session
      api.addCell(sessionId, cell);

      // Set up event listeners
      const executionEvents: any[] = [];
      eventBus.onCellExecution((event) => {
        executionEvents.push(event);
      });

      // Execute the cell
      const result = await api.executeCell(sessionId, cell.id);

      // Verify execution results
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello from headless notebook!');
      expect(executionEvents.length).toBeGreaterThan(0);
      
      // Verify first event is 'started'
      const startEvent = executionEvents.find(e => e.data.status === 'started');
      expect(startEvent).toBeDefined();
      expect(startEvent.sessionId).toBe(sessionId);
      expect(startEvent.data.cellId).toBe(cell.id);
    });

    it('should handle cell execution errors gracefully', async () => {
      // Create a cell with invalid code
      const cell: CodeCellType = {
        id: 'test-cell-error',
        type: 'code',
        language: 'typescript',
        text: 'this is invalid typescript syntax !!!',
        filename: 'error.ts'
      };

      api.addCell(sessionId, cell);

      // Execute and expect error
      const result = await api.executeCell(sessionId, cell.id);
      
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    it('should execute multiple cells in sequence', async () => {
      const cells: CodeCellType[] = [
        {
          id: 'cell-1',
          type: 'code',
          language: 'typescript',
          text: 'const x = 42;',
          filename: 'cell1.ts'
        },
        {
          id: 'cell-2',
          type: 'code',
          language: 'typescript',
          text: 'console.log(`The answer is ${x}`);',
          filename: 'cell2.ts'
        }
      ];

      // Add cells to session
      cells.forEach(cell => api.addCell(sessionId, cell));

      // Execute all cells
      const results = await api.executeAllCells(sessionId);

      expect(results).toHaveLength(2);
      expect(results[0].exitCode).toBe(0);
      expect(results[1].exitCode).toBe(0);
      expect(results[1].stdout).toContain('The answer is 42');
    });
  });

  describe('Lifecycle Management Integration', () => {
    it('should manage notebook lifecycle from creation to termination', async () => {
      const lifecycleSessionId = await lifecycleManager.createNotebook({
        language: 'typescript',
        tsconfig: {},
        cells: []
      });

      // Verify notebook is in active state
      const lifecycle = lifecycleManager.getNotebookState(lifecycleSessionId);
      expect(lifecycle?.state).toBe('active');
      expect(lifecycle?.sessionId).toBe(lifecycleSessionId);

      // Suspend notebook
      await lifecycleManager.suspendNotebook(lifecycleSessionId);
      const suspendedLifecycle = lifecycleManager.getNotebookState(lifecycleSessionId);
      expect(suspendedLifecycle?.state).toBe('suspended');

      // Resume notebook
      await lifecycleManager.resumeNotebook(lifecycleSessionId);
      const resumedLifecycle = lifecycleManager.getNotebookState(lifecycleSessionId);
      expect(resumedLifecycle?.state).toBe('active');

      // Terminate notebook
      await lifecycleManager.terminateNotebook(lifecycleSessionId);
      const terminatedLifecycle = lifecycleManager.getNotebookState(lifecycleSessionId);
      expect(terminatedLifecycle).toBeUndefined();
    });

    it('should handle auto-save functionality', async () => {
      const autoSaveManager = new NotebookLifecycleManager({
        autoSave: true,
        autoSaveInterval: 100 // 100ms for testing
      });

      const testSessionId = await autoSaveManager.createNotebook({
        language: 'typescript',
        tsconfig: {},
        cells: []
      });

      // Add a cell to trigger auto-save
      const cell: CodeCellType = {
        id: 'auto-save-cell',
        type: 'code',
        language: 'typescript',
        text: 'console.log("auto-save test");',
        filename: 'autosave.ts'
      };

      api.addCell(testSessionId, cell);

      // Wait for auto-save to trigger
      await new Promise(resolve => setTimeout(resolve, 150));

      // Cleanup
      await autoSaveManager.terminateNotebook(testSessionId);
    });
  });

  describe('Event Bus Integration', () => {
    it('should process events through middleware chain', async () => {
      const middlewareLog: string[] = [];

      // Add timing middleware
      eventBus.use((event, next) => {
        middlewareLog.push(`timing-start-${event.type}`);
        next();
        middlewareLog.push(`timing-end-${event.type}`);
      });

      // Add logging middleware  
      eventBus.use((event, next) => {
        middlewareLog.push(`logging-${event.type}`);
        next();
      });

      // Emit a test event
      eventBus.emitCellExecution(sessionId, 'test-cell', 'started');

      // Verify middleware chain executed
      expect(middlewareLog).toContain('timing-start-cell:execution');
      expect(middlewareLog).toContain('logging-cell:execution');
      expect(middlewareLog).toContain('timing-end-cell:execution');
    });

    it('should handle event bus error scenarios', async () => {
      const errorLog: string[] = [];

      // Add error handling middleware
      eventBus.use((event, next) => {
        try {
          next();
        } catch (error) {
          errorLog.push(`error-caught-${event.type}`);
        }
      });

      // Add middleware that throws
      eventBus.use((event, next) => {
        if (event.type === 'cell:execution') {
          throw new Error('Test error');
        }
        next();
      });

      // This should not throw but should be caught by error middleware
      eventBus.emitCellExecution(sessionId, 'error-cell', 'started');

      expect(errorLog).toContain('error-caught-cell:execution');
    });
  });

  describe('API Integration', () => {
    it('should maintain session state consistency across operations', async () => {
      // Create multiple cells
      const cells = [
        { id: 'cell-1', type: 'code' as const, language: 'typescript', text: 'const a = 1;', filename: 'a.ts' },
        { id: 'cell-2', type: 'code' as const, language: 'typescript', text: 'const b = 2;', filename: 'b.ts' },
        { id: 'cell-3', type: 'code' as const, language: 'typescript', text: 'const c = 3;', filename: 'c.ts' }
      ];

      // Add all cells
      cells.forEach(cell => api.addCell(sessionId, cell));
      
      let session = api.getSession(sessionId);
      expect(session.cells).toHaveLength(3);

      // Update a cell
      api.updateCell(sessionId, 'cell-2', { text: 'const b = 22;' });
      session = api.getSession(sessionId);
      
      const updatedCell = session.cells.find(c => c.id === 'cell-2');
      expect(updatedCell?.text).toBe('const b = 22;');

      // Remove a cell
      api.removeCell(sessionId, 'cell-1');
      session = api.getSession(sessionId);
      expect(session.cells).toHaveLength(2);
      expect(session.cells.find(c => c.id === 'cell-1')).toBeUndefined();

      // Reorder cells
      api.reorderCells(sessionId, ['cell-3', 'cell-2']);
      session = api.getSession(sessionId);
      expect(session.cells[0].id).toBe('cell-3');
      expect(session.cells[1].id).toBe('cell-2');
    });
  });
});