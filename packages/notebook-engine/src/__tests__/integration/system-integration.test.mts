import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  NotebookAPI,
  NotebookLifecycleManager,
  NotebookEventBus,
  RestApiAdapter,
  NotebookPerformanceMonitor,
  errorRecovery,
  NotebookProtocol,
  MemoryChannel
} from '../../index.mjs';
import type { SessionType, CodeCellType } from '../../types/index.mjs';

describe('Full System Integration Tests', () => {
  let api: NotebookAPI;
  let lifecycleManager: NotebookLifecycleManager;
  let eventBus: NotebookEventBus;
  let restAdapter: RestApiAdapter;
  let performanceMonitor: NotebookPerformanceMonitor;
  let protocol: NotebookProtocol;
  let memoryChannel: MemoryChannel;

  beforeAll(async () => {
    // Initialize all components
    api = new NotebookAPI();
    lifecycleManager = new NotebookLifecycleManager({
      autoSave: false,
      maxIdleTime: 60000,
      checkpointInterval: 30000
    });
    eventBus = new NotebookEventBus();
    restAdapter = new RestApiAdapter({
      baseUrl: 'http://localhost:3000',
      timeout: 30000
    });
    performanceMonitor = new NotebookPerformanceMonitor();
    
    // Set up communication
    memoryChannel = new MemoryChannel();
    protocol = new NotebookProtocol(memoryChannel);

    // Wire up event monitoring
    eventBus.use(performanceMonitor.createEventMiddleware());
    
    // Add error recovery middleware
    const recoveryMiddleware = await errorRecovery.createRecoveryMiddleware();
    
    console.log('System integration test setup complete');
  });

  afterAll(async () => {
    protocol.close();
    performanceMonitor.clearMetrics();
    performanceMonitor.clearBenchmarks();
  });

  describe('Complete Notebook Lifecycle with All Components', () => {
    it('should demonstrate full headless notebook workflow', async () => {
      // Step 1: Create notebook through lifecycle manager
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

      expect(sessionId).toBeTruthy();

      // Step 2: Monitor events
      const events: any[] = [];
      eventBus.onCellExecution((event) => events.push({ type: 'execution', ...event }));
      eventBus.onCellUpdate((event) => events.push({ type: 'update', ...event }));
      eventBus.onSessionUpdate((event) => events.push({ type: 'session', ...event }));

      // Step 3: Create a complex multi-cell notebook
      const notebookCells: CodeCellType[] = [
        {
          id: 'imports-cell',
          type: 'code',
          language: 'typescript',
          text: `
            // Data analysis notebook
            interface DataPoint {
              id: number;
              value: number;
              category: string;
            }
            
            const dataset: DataPoint[] = [
              { id: 1, value: 10, category: 'A' },
              { id: 2, value: 20, category: 'B' },
              { id: 3, value: 15, category: 'A' },
              { id: 4, value: 25, category: 'C' },
              { id: 5, value: 30, category: 'B' }
            ];
            
            console.log('Dataset loaded:', dataset.length, 'items');
          `,
          filename: 'imports.ts'
        },
        {
          id: 'analysis-cell',
          type: 'code',
          language: 'typescript',
          text: `
            // Statistical analysis
            const analyzeData = (data: DataPoint[]) => {
              const byCategory = data.reduce((acc, item) => {
                if (!acc[item.category]) {
                  acc[item.category] = { count: 0, total: 0, items: [] };
                }
                acc[item.category].count++;
                acc[item.category].total += item.value;
                acc[item.category].items.push(item);
                return acc;
              }, {} as Record<string, { count: number; total: number; items: DataPoint[] }>);
              
              return Object.entries(byCategory).map(([category, stats]) => ({
                category,
                count: stats.count,
                average: stats.total / stats.count,
                total: stats.total
              }));
            };
            
            const analysis = analyzeData(dataset);
            console.log('Analysis complete:', analysis);
          `,
          filename: 'analysis.ts'
        },
        {
          id: 'visualization-cell',
          type: 'code',
          language: 'typescript',
          text: `
            // Simple text-based visualization
            const createChart = (data: typeof analysis) => {
              console.log('\\n📊 Data Analysis Results:');
              console.log('========================');
              
              data.forEach(item => {
                const bar = '█'.repeat(Math.round(item.average / 2));
                console.log(\`\${item.category}: \${bar} (\${item.average.toFixed(1)})\`);
              });
              
              const grandTotal = data.reduce((sum, item) => sum + item.total, 0);
              console.log(\`\\nGrand Total: \${grandTotal}\`);
              
              return { chart: 'generated', total: grandTotal };
            };
            
            const chartResult = createChart(analysis);
            console.log('Chart generated successfully');
          `,
          filename: 'visualization.ts'
        }
      ];

      // Step 4: Add cells through REST adapter
      for (const cell of notebookCells) {
        await restAdapter.createCell(sessionId, cell, -1);
      }

      // Verify cells were added
      const session = api.getSession(sessionId);
      expect(session.cells).toHaveLength(3);

      // Step 5: Execute cells with performance monitoring
      performanceMonitor.startTimer('full-notebook-execution');
      
      const executionResults = [];
      for (const cell of notebookCells) {
        performanceMonitor.startTimer(`cell-${cell.id}`);
        const result = await restAdapter.executeCell(sessionId, cell.id);
        const cellBenchmark = performanceMonitor.endTimer(`cell-${cell.id}`, result.exitCode === 0);
        
        executionResults.push({ cell: cell.id, result, benchmark: cellBenchmark });
        
        // Record metrics
        performanceMonitor.recordMetrics(sessionId, 1, cellBenchmark.duration);
      }

      const totalBenchmark = performanceMonitor.endTimer('full-notebook-execution', 
        executionResults.every(r => r.result.exitCode === 0));

      // Step 6: Verify all executions succeeded
      expect(executionResults).toHaveLength(3);
      executionResults.forEach((result, index) => {
        expect(result.result.exitCode).toBe(0);
        expect(result.result.stdout).toBeTruthy();
        console.log(`Cell ${index + 1} output:`, result.result.stdout.substring(0, 100));
      });

      // Step 7: Verify events were captured
      expect(events.length).toBeGreaterThan(0);
      const executionEvents = events.filter(e => e.type === 'execution');
      expect(executionEvents.length).toBeGreaterThan(0);

      // Step 8: Check performance metrics
      const metrics = performanceMonitor.getMetrics(sessionId);
      expect(metrics).toHaveLength(3);
      
      const report = performanceMonitor.getPerformanceReport();
      expect(report.totalSessions).toBeGreaterThan(0);
      expect(report.averageExecutionTime).toBeGreaterThan(0);

      console.log('Performance Report:', {
        totalExecutionTime: totalBenchmark.duration,
        averagePerCell: report.averageExecutionTime,
        memoryUsage: report.memoryStats.current
      });

      // Step 9: Test lifecycle operations
      const lifecycleState = lifecycleManager.getNotebookState(sessionId);
      expect(lifecycleState?.state).toBe('active');

      // Suspend and resume
      await lifecycleManager.suspendNotebook(sessionId);
      expect(lifecycleManager.getNotebookState(sessionId)?.state).toBe('suspended');

      await lifecycleManager.resumeNotebook(sessionId);
      expect(lifecycleManager.getNotebookState(sessionId)?.state).toBe('active');

      // Step 10: Test session state consistency
      const finalSession = api.getSession(sessionId);
      expect(finalSession.cells).toHaveLength(3);
      expect(finalSession.cells.map(c => c.id)).toEqual(notebookCells.map(c => c.id));

      // Step 11: Clean up
      await lifecycleManager.terminateNotebook(sessionId);
      expect(lifecycleManager.getNotebookState(sessionId)).toBeUndefined();
    });

    it('should handle complex error scenarios with recovery', async () => {
      const sessionId = await lifecycleManager.createNotebook({
        language: 'typescript',
        tsconfig: {},
        cells: []
      });

      // Create cells that will cause different types of errors
      const errorCells: CodeCellType[] = [
        {
          id: 'syntax-error-cell',
          type: 'code',
          language: 'typescript',
          text: 'this is invalid typescript syntax !!!',
          filename: 'syntax-error.ts'
        },
        {
          id: 'runtime-error-cell',
          type: 'code',
          language: 'typescript',
          text: 'throw new Error("Runtime error for testing");',
          filename: 'runtime-error.ts'
        },
        {
          id: 'recovery-cell',
          type: 'code',
          language: 'typescript',
          text: 'console.log("Recovery test successful");',
          filename: 'recovery.ts'
        }
      ];

      // Add error cells
      for (const cell of errorCells) {
        await restAdapter.createCell(sessionId, cell, -1);
      }

      // Track error recovery attempts
      const errorEvents: any[] = [];
      eventBus.on('error:occurred', (event) => errorEvents.push({ type: 'occurred', ...event }));
      eventBus.on('error:recovered', (event) => errorEvents.push({ type: 'recovered', ...event }));
      eventBus.on('error:recovery-failed', (event) => errorEvents.push({ type: 'failed', ...event }));

      // Execute cells and expect errors
      const results = [];
      
      // First cell should fail (syntax error)
      const syntaxResult = await restAdapter.executeCell(sessionId, 'syntax-error-cell');
      results.push(syntaxResult);
      expect(syntaxResult.exitCode).not.toBe(0);

      // Second cell should fail (runtime error)  
      const runtimeResult = await restAdapter.executeCell(sessionId, 'runtime-error-cell');
      results.push(runtimeResult);
      expect(runtimeResult.exitCode).not.toBe(0);

      // Third cell should succeed (recovery)
      const recoveryResult = await restAdapter.executeCell(sessionId, 'recovery-cell');
      results.push(recoveryResult);
      expect(recoveryResult.exitCode).toBe(0);
      expect(recoveryResult.stdout).toContain('Recovery test successful');

      // Verify session is still functional after errors
      const session = api.getSession(sessionId);
      expect(session.cells).toHaveLength(3);

      // Clean up
      await lifecycleManager.terminateNotebook(sessionId);
    });

    it('should demonstrate protocol communication integration', async () => {
      // Set up command handler for protocol communication
      const commandHandler = restAdapter;
      
      // Mock message handling for protocol testing
      memoryChannel.onMessage(async (message) => {
        if (message.type === 'command') {
          const command = message.payload;
          let response;
          
          switch (command.type) {
            case 'execute':
              response = await commandHandler.executeCell(
                command.sessionId, 
                command.cellId!, 
                command.payload
              );
              break;
            default:
              response = { success: false, error: 'Unknown command' };
          }
          
          memoryChannel.send({
            id: message.id,
            type: 'response',
            payload: { success: true, data: response },
            timestamp: Date.now()
          });
        }
      });

      // Create session and cell for protocol testing
      const sessionId = await lifecycleManager.createNotebook({
        language: 'typescript',
        tsconfig: {},
        cells: []
      });

      const testCell: CodeCellType = {
        id: 'protocol-test-cell',
        type: 'code',
        language: 'typescript',
        text: 'console.log("Protocol communication successful");',
        filename: 'protocol-test.ts'
      };

      await restAdapter.createCell(sessionId, testCell, -1);

      // Send command through protocol
      const protocolResponse = await protocol.sendCommand({
        type: 'execute',
        sessionId,
        cellId: testCell.id,
        payload: { timeout: 5000 }
      });

      expect(protocolResponse.success).toBe(true);
      expect(protocolResponse.data.exitCode).toBe(0);
      expect(protocolResponse.data.stdout).toContain('Protocol communication successful');

      // Clean up
      await lifecycleManager.terminateNotebook(sessionId);
    });

    it('should maintain performance under concurrent operations', async () => {
      const sessionCount = 3;
      const cellsPerSession = 2;
      const sessions: string[] = [];

      performanceMonitor.startTimer('concurrent-operations');

      // Create multiple sessions concurrently
      const sessionPromises = Array.from({ length: sessionCount }, async () => {
        const sessionId = await lifecycleManager.createNotebook({
          language: 'typescript',
          tsconfig: {},
          cells: []
        });
        sessions.push(sessionId);
        return sessionId;
      });

      const createdSessions = await Promise.all(sessionPromises);
      expect(createdSessions).toHaveLength(sessionCount);

      // Add cells to each session concurrently
      const cellPromises = createdSessions.flatMap(sessionId =>
        Array.from({ length: cellsPerSession }, async (_, index) => {
          const cell: CodeCellType = {
            id: `concurrent-cell-${index}`,
            type: 'code',
            language: 'typescript',
            text: `console.log("Concurrent execution ${index} in ${sessionId}");`,
            filename: `concurrent-${index}.ts`
          };
          return restAdapter.createCell(sessionId, cell, -1);
        })
      );

      await Promise.all(cellPromises);

      // Execute all cells concurrently
      const executionPromises = createdSessions.flatMap(sessionId =>
        Array.from({ length: cellsPerSession }, (_, index) =>
          restAdapter.executeCell(sessionId, `concurrent-cell-${index}`)
        )
      );

      const executionResults = await Promise.all(executionPromises);
      const concurrentBenchmark = performanceMonitor.endTimer('concurrent-operations');

      // Verify all executions succeeded
      expect(executionResults).toHaveLength(sessionCount * cellsPerSession);
      executionResults.forEach(result => {
        expect(result.exitCode).toBe(0);
      });

      console.log(`Concurrent operations completed in ${concurrentBenchmark.duration}ms`);
      console.log(`Average per operation: ${concurrentBenchmark.duration / executionResults.length}ms`);

      // Clean up all sessions
      await Promise.all(createdSessions.map(sessionId => 
        lifecycleManager.terminateNotebook(sessionId)
      ));
    });
  });

  describe('System Resilience and Edge Cases', () => {
    it('should recover from complete system state corruption', async () => {
      // Create initial session
      const originalSessionId = await lifecycleManager.createNotebook({
        language: 'typescript',
        tsconfig: {},
        cells: []
      });

      // Add some cells
      const cell: CodeCellType = {
        id: 'resilience-test',
        type: 'code',
        language: 'typescript',
        text: 'const testData = "System resilience test";',
        filename: 'resilience.ts'
      };

      await restAdapter.createCell(originalSessionId, cell, -1);

      // Simulate system corruption by manually deleting session
      api.deleteSession(originalSessionId);

      // Try to use deleted session - should trigger error recovery
      try {
        await restAdapter.executeCell(originalSessionId, cell.id);
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        // Error expected - now test recovery
        const recoveryResult = await errorRecovery.handleError(error as Error, {
          sessionId: originalSessionId,
          cellId: cell.id,
          operation: 'execute-cell',
          timestamp: Date.now()
        });

        if (recoveryResult.success && recoveryResult.newSessionId) {
          // Verify recovery created new session
          const newSession = api.getSession(recoveryResult.newSessionId);
          expect(newSession).toBeDefined();
          
          // Clean up
          await lifecycleManager.terminateNotebook(recoveryResult.newSessionId);
        }
      }
    });

    it('should handle memory pressure gracefully', async () => {
      const sessionId = await lifecycleManager.createNotebook({
        language: 'typescript',
        tsconfig: {},
        cells: []
      });

      // Create memory-intensive cell
      const memoryCell: CodeCellType = {
        id: 'memory-test',
        type: 'code',
        language: 'typescript',
        text: `
          // Create large data structure to test memory handling
          const largeArray = new Array(100000).fill(0).map((_, i) => ({
            id: i,
            data: 'x'.repeat(100),
            timestamp: Date.now()
          }));
          
          console.log('Created large array with', largeArray.length, 'items');
          console.log('Memory usage test completed');
        `,
        filename: 'memory-test.ts'
      };

      await restAdapter.createCell(sessionId, memoryCell, -1);

      // Monitor memory before and after
      const memBefore = process.memoryUsage();
      
      const result = await restAdapter.executeCell(sessionId, memoryCell.id);
      expect(result.exitCode).toBe(0);
      
      const memAfter = process.memoryUsage();
      
      console.log('Memory impact:', {
        heapUsedBefore: Math.round(memBefore.heapUsed / 1024 / 1024),
        heapUsedAfter: Math.round(memAfter.heapUsed / 1024 / 1024),
        difference: Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024)
      });

      // Clean up
      await lifecycleManager.terminateNotebook(sessionId);
    });
  });
});