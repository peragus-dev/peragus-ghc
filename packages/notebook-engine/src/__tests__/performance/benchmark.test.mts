import { describe, it, expect, beforeEach } from 'vitest';
import { NotebookAPI } from '../../api.mjs';
import { NotebookPerformanceMonitor } from '../../monitoring/performance.mjs';
import { NotebookEventBus } from '../../communication/event-bus.mjs';
import type { CodeCellType } from '../../types/index.mjs';

describe('Performance Benchmarks', () => {
  let api: NotebookAPI;
  let monitor: NotebookPerformanceMonitor;
  let eventBus: NotebookEventBus;
  let sessionId: string;

  beforeEach(() => {
    api = new NotebookAPI();
    monitor = new NotebookPerformanceMonitor();
    eventBus = new NotebookEventBus();

    // Add performance monitoring middleware
    eventBus.use(monitor.createEventMiddleware());

    const session = api.createSession({
      language: 'typescript',
      tsconfig: {},
      cells: []
    });
    sessionId = session.id;
  });

  describe('Cell Execution Performance', () => {
    it('should execute simple cells within performance thresholds', async () => {
      const cell: CodeCellType = {
        id: 'perf-test-simple',
        type: 'code',
        language: 'typescript',
        text: 'console.log("Simple performance test");',
        filename: 'simple.ts'
      };

      api.addCell(sessionId, cell);

      monitor.startTimer('simple-cell-execution');
      const result = await api.executeCell(sessionId, cell.id);
      const benchmark = monitor.endTimer('simple-cell-execution', result.exitCode === 0);

      // Simple cell should execute quickly (under 5 seconds)
      expect(benchmark.duration).toBeLessThan(5000);
      expect(benchmark.success).toBe(true);

      // Record metrics
      monitor.recordMetrics(sessionId, 1, benchmark.duration);
      
      const metrics = monitor.getMetrics(sessionId);
      expect(metrics).toHaveLength(1);
      expect(metrics[0].cellCount).toBe(1);
    });

    it('should handle multiple cell execution performance', async () => {
      const cells: CodeCellType[] = Array.from({ length: 10 }, (_, i) => ({
        id: `perf-cell-${i}`,
        type: 'code',
        language: 'typescript',
        text: `console.log("Cell ${i} execution"); const x${i} = ${i} * 2;`,
        filename: `cell${i}.ts`
      }));

      // Add all cells
      cells.forEach(cell => api.addCell(sessionId, cell));

      monitor.startTimer('multiple-cell-execution');
      
      // Execute all cells sequentially
      const results = [];
      for (const cell of cells) {
        const result = await api.executeCell(sessionId, cell.id);
        results.push(result);
      }

      const benchmark = monitor.endTimer('multiple-cell-execution', 
        results.every(r => r.exitCode === 0));

      // Multiple cells should complete within reasonable time (under 30 seconds)
      expect(benchmark.duration).toBeLessThan(30000);
      expect(benchmark.success).toBe(true);

      monitor.recordMetrics(sessionId, cells.length, benchmark.duration);
    });

    it('should measure memory usage during execution', async () => {
      const memoryCells: CodeCellType[] = [
        {
          id: 'memory-light',
          type: 'code',
          language: 'typescript',
          text: 'const smallArray = new Array(100).fill(0);',
          filename: 'light.ts'
        },
        {
          id: 'memory-heavy',
          type: 'code',
          language: 'typescript',
          text: 'const largeArray = new Array(10000).fill(0).map((_, i) => ({ id: i, data: `item${i}` }));',
          filename: 'heavy.ts'
        }
      ];

      for (const cell of memoryCells) {
        api.addCell(sessionId, cell);
        
        monitor.startTimer(`memory-test-${cell.id}`);
        await api.executeCell(sessionId, cell.id);
        const benchmark = monitor.endTimer(`memory-test-${cell.id}`);
        
        monitor.recordMetrics(sessionId, 1, benchmark.duration);
      }

      const memoryTrend = monitor.getMemoryTrend(sessionId);
      expect(memoryTrend).toHaveLength(2);
      
      // Memory should generally increase with heavier operations
      const lightMemory = memoryTrend[0].heapUsed;
      const heavyMemory = memoryTrend[1].heapUsed;
      
      expect(heavyMemory).toBeGreaterThanOrEqual(lightMemory);
    });
  });

  describe('Scalability Testing', () => {
    it('should handle concurrent session creation', async () => {
      const sessionCount = 5;
      const sessions: string[] = [];

      monitor.startTimer('concurrent-session-creation');

      // Create multiple sessions concurrently
      const sessionPromises = Array.from({ length: sessionCount }, () =>
        new Promise<string>((resolve) => {
          const session = api.createSession({
            language: 'typescript',
            tsconfig: {},
            cells: []
          });
          sessions.push(session.id);
          resolve(session.id);
        })
      );

      await Promise.all(sessionPromises);
      const benchmark = monitor.endTimer('concurrent-session-creation');

      expect(sessions).toHaveLength(sessionCount);
      expect(benchmark.duration).toBeLessThan(1000); // Should be fast
      expect(benchmark.success).toBe(true);
    });

    it('should measure performance degradation with cell count', async () => {
      const cellCounts = [1, 5, 10, 20];
      const results = [];

      for (const count of cellCounts) {
        // Create new session for each test
        const testSession = api.createSession({
          language: 'typescript',
          tsconfig: {},
          cells: []
        });

        // Add cells
        const cells = Array.from({ length: count }, (_, i) => ({
          id: `scale-cell-${i}`,
          type: 'code' as const,
          language: 'typescript',
          text: `const var${i} = ${i}; console.log('Cell ${i}');`,
          filename: `scale${i}.ts`
        }));

        cells.forEach(cell => api.addCell(testSession.id, cell));

        // Measure execution time
        monitor.startTimer(`scale-test-${count}-cells`);
        await api.executeAllCells(testSession.id);
        const benchmark = monitor.endTimer(`scale-test-${count}-cells`);

        results.push({
          cellCount: count,
          duration: benchmark.duration,
          durationPerCell: benchmark.duration / count
        });

        monitor.recordMetrics(testSession.id, count, benchmark.duration);
      }

      // Verify that execution time scales reasonably
      const firstResult = results[0];
      const lastResult = results[results.length - 1];

      // Duration should increase with cell count, but not exponentially
      expect(lastResult.duration).toBeGreaterThan(firstResult.duration);
      
      // Per-cell time shouldn't degrade too much (less than 2x)
      expect(lastResult.durationPerCell).toBeLessThan(firstResult.durationPerCell * 2);
    });
  });

  describe('Performance Reporting', () => {
    it('should generate comprehensive performance report', async () => {
      // Execute some operations to populate metrics
      const testCell: CodeCellType = {
        id: 'report-test',
        type: 'code',
        language: 'typescript',
        text: 'console.log("Report test");',
        filename: 'report.ts'
      };

      api.addCell(sessionId, testCell);

      // Execute multiple times to get meaningful data
      for (let i = 0; i < 3; i++) {
        monitor.startTimer(`report-execution-${i}`);
        await api.executeCell(sessionId, testCell.id);
        const benchmark = monitor.endTimer(`report-execution-${i}`);
        monitor.recordMetrics(sessionId, 1, benchmark.duration);
      }

      const report = monitor.getPerformanceReport();

      expect(report.totalSessions).toBeGreaterThan(0);
      expect(report.totalMetrics).toBeGreaterThan(0);
      expect(report.averageExecutionTime).toBeGreaterThan(0);
      expect(report.memoryStats.current).toBeGreaterThan(0);
      expect(Object.keys(report.benchmarkSummary)).toContain('report-execution-0');
    });

    it('should export metrics in JSON format', async () => {
      // Add some test data
      monitor.recordMetrics(sessionId, 1, 100);
      monitor.startTimer('export-test');
      monitor.endTimer('export-test');

      const exported = monitor.exportMetrics();
      const data = JSON.parse(exported);

      expect(data).toHaveProperty('metrics');
      expect(data).toHaveProperty('benchmarks');
      expect(data).toHaveProperty('report');
      expect(data).toHaveProperty('exportedAt');
      expect(data.metrics[sessionId]).toBeDefined();
    });

    it('should track benchmark success rates', async () => {
      // Create some successful and failed operations
      for (let i = 0; i < 5; i++) {
        monitor.startTimer(`success-test-${i}`);
        monitor.endTimer(`success-test-${i}`, true);
      }

      for (let i = 0; i < 2; i++) {
        monitor.startTimer(`failure-test-${i}`);
        monitor.endTimer(`failure-test-${i}`, false);
      }

      const benchmarks = monitor.getBenchmarks();
      const successfulOps = benchmarks.filter(b => b.success);
      const failedOps = benchmarks.filter(b => !b.success);

      expect(successfulOps).toHaveLength(5);
      expect(failedOps).toHaveLength(2);

      const report = monitor.getPerformanceReport();
      expect(report.benchmarkSummary['success-test-0'].successRate).toBe(1.0);
      expect(report.benchmarkSummary['failure-test-0'].successRate).toBe(0.0);
    });
  });

  describe('Performance Thresholds', () => {
    it('should identify performance regressions', async () => {
      const baselineCell: CodeCellType = {
        id: 'baseline-cell',
        type: 'code',
        language: 'typescript',
        text: 'console.log("Baseline");',
        filename: 'baseline.ts'
      };

      api.addCell(sessionId, baselineCell);

      // Establish baseline
      const baselineRuns = [];
      for (let i = 0; i < 5; i++) {
        monitor.startTimer(`baseline-${i}`);
        await api.executeCell(sessionId, baselineCell.id);
        const benchmark = monitor.endTimer(`baseline-${i}`);
        baselineRuns.push(benchmark.duration);
      }

      const averageBaseline = baselineRuns.reduce((sum, d) => sum + d, 0) / baselineRuns.length;

      // Test current performance
      monitor.startTimer('current-performance');
      await api.executeCell(sessionId, baselineCell.id);
      const currentBenchmark = monitor.endTimer('current-performance');

      // Current performance should be within 2x of baseline
      expect(currentBenchmark.duration).toBeLessThan(averageBaseline * 2);
    });
  });
});