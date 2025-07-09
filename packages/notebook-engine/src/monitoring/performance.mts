import type { NotebookEvent } from '../communication/types.mjs';

export interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cellCount: number;
  sessionId: string;
  timestamp: number;
}

export interface BenchmarkResult {
  operation: string;
  duration: number;
  success: boolean;
  metadata?: Record<string, any>;
}

export class NotebookPerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics[]> = new Map();
  private benchmarks: BenchmarkResult[] = [];
  private timers: Map<string, number> = new Map();

  startTimer(operation: string): void {
    this.timers.set(operation, performance.now());
  }

  endTimer(operation: string, success: boolean = true, metadata?: Record<string, any>): BenchmarkResult {
    const startTime = this.timers.get(operation);
    if (!startTime) {
      throw new Error(`No timer found for operation: ${operation}`);
    }

    const duration = performance.now() - startTime;
    this.timers.delete(operation);

    const result: BenchmarkResult = {
      operation,
      duration,
      success,
      metadata
    };

    this.benchmarks.push(result);
    return result;
  }

  recordMetrics(sessionId: string, cellCount: number, executionTime: number): void {
    const metrics: PerformanceMetrics = {
      executionTime,
      memoryUsage: process.memoryUsage(),
      cellCount,
      sessionId,
      timestamp: Date.now()
    };

    if (!this.metrics.has(sessionId)) {
      this.metrics.set(sessionId, []);
    }
    
    this.metrics.get(sessionId)!.push(metrics);
  }

  getMetrics(sessionId?: string): PerformanceMetrics[] {
    if (sessionId) {
      return this.metrics.get(sessionId) || [];
    }
    
    const allMetrics: PerformanceMetrics[] = [];
    this.metrics.forEach(sessionMetrics => {
      allMetrics.push(...sessionMetrics);
    });
    return allMetrics;
  }

  getBenchmarks(operation?: string): BenchmarkResult[] {
    if (operation) {
      return this.benchmarks.filter(b => b.operation === operation);
    }
    return [...this.benchmarks];
  }

  getAverageExecutionTime(sessionId?: string): number {
    const metrics = this.getMetrics(sessionId);
    if (metrics.length === 0) return 0;
    
    const total = metrics.reduce((sum, m) => sum + m.executionTime, 0);
    return total / metrics.length;
  }

  getMemoryTrend(sessionId: string): { timestamp: number; heapUsed: number }[] {
    const metrics = this.getMetrics(sessionId);
    return metrics.map(m => ({
      timestamp: m.timestamp,
      heapUsed: m.memoryUsage.heapUsed
    }));
  }

  getPerformanceReport(): PerformanceReport {
    const allMetrics = this.getMetrics();
    const allBenchmarks = this.getBenchmarks();

    return {
      totalSessions: this.metrics.size,
      totalMetrics: allMetrics.length,
      averageExecutionTime: this.getAverageExecutionTime(),
      memoryStats: this.calculateMemoryStats(allMetrics),
      benchmarkSummary: this.summarizeBenchmarks(allBenchmarks),
      topSlowOperations: this.getTopSlowOperations(5)
    };
  }

  private calculateMemoryStats(metrics: PerformanceMetrics[]): MemoryStats {
    if (metrics.length === 0) {
      return { min: 0, max: 0, average: 0, current: process.memoryUsage().heapUsed };
    }

    const heapUsages = metrics.map(m => m.memoryUsage.heapUsed);
    return {
      min: Math.min(...heapUsages),
      max: Math.max(...heapUsages),
      average: heapUsages.reduce((sum, usage) => sum + usage, 0) / heapUsages.length,
      current: process.memoryUsage().heapUsed
    };
  }

  private summarizeBenchmarks(benchmarks: BenchmarkResult[]): BenchmarkSummary {
    const operations = new Map<string, BenchmarkResult[]>();
    
    benchmarks.forEach(benchmark => {
      if (!operations.has(benchmark.operation)) {
        operations.set(benchmark.operation, []);
      }
      operations.get(benchmark.operation)!.push(benchmark);
    });

    const summary: BenchmarkSummary = {};
    
    operations.forEach((results, operation) => {
      const durations = results.map(r => r.duration);
      const successCount = results.filter(r => r.success).length;
      
      summary[operation] = {
        count: results.length,
        successRate: successCount / results.length,
        averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations)
      };
    });

    return summary;
  }

  private getTopSlowOperations(limit: number): Array<{ operation: string; duration: number }> {
    return this.benchmarks
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
      .map(b => ({ operation: b.operation, duration: b.duration }));
  }

  createEventMiddleware() {
    return (event: NotebookEvent, next: () => void) => {
      const operationId = `${event.type}_${event.sessionId}_${Date.now()}`;
      this.startTimer(operationId);
      
      try {
        next();
        this.endTimer(operationId, true, { eventType: event.type, sessionId: event.sessionId });
      } catch (error) {
        this.endTimer(operationId, false, { 
          eventType: event.type, 
          sessionId: event.sessionId, 
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    };
  }

  clearMetrics(sessionId?: string): void {
    if (sessionId) {
      this.metrics.delete(sessionId);
    } else {
      this.metrics.clear();
    }
  }

  clearBenchmarks(): void {
    this.benchmarks.length = 0;
  }

  exportMetrics(): string {
    return JSON.stringify({
      metrics: Object.fromEntries(this.metrics),
      benchmarks: this.benchmarks,
      report: this.getPerformanceReport(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }
}

export interface PerformanceReport {
  totalSessions: number;
  totalMetrics: number;
  averageExecutionTime: number;
  memoryStats: MemoryStats;
  benchmarkSummary: BenchmarkSummary;
  topSlowOperations: Array<{ operation: string; duration: number }>;
}

export interface MemoryStats {
  min: number;
  max: number;
  average: number;
  current: number;
}

export interface BenchmarkSummary {
  [operation: string]: {
    count: number;
    successRate: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
  };
}

// Singleton instance for global use
export const performanceMonitor = new NotebookPerformanceMonitor();