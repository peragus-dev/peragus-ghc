import { SimulationResults } from "./simulation-runner.mjs";

/**
 * Statistical summary for a variable
 */
export interface VariableStatistics {
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  q25: number;
  q75: number;
}

/**
 * Statistical summary for all variables
 */
export interface StatisticalSummary {
  variables: { [variableName: string]: VariableStatistics };
  timeRange: { start: number; end: number };
  sampleCount: number;
}

/**
 * Correlation matrix between variables
 */
export interface CorrelationMatrix {
  variables: string[];
  matrix: number[][];
}

/**
 * Interface for data aggregation operations
 */
export interface IDataAggregator {
  computeStatistics(results: SimulationResults): StatisticalSummary;
  movingAverage(results: SimulationResults, window: number): SimulationResults;
  cumulativeSum(results: SimulationResults): SimulationResults;
  correlations(results: SimulationResults): CorrelationMatrix;
}

/**
 * Data aggregation utilities implementation
 */
export class DataAggregator implements IDataAggregator {
  /**
   * Computes statistical summaries for each variable
   */
  computeStatistics(results: SimulationResults): StatisticalSummary {
    if (!results.success || !results.data || !results.columns) {
      throw new Error("Invalid simulation results for statistics computation");
    }

    const summary: StatisticalSummary = {
      variables: {},
      timeRange: { start: 0, end: 0 },
      sampleCount: 0
    };

    // Get time range
    const timeData = results.data['Time'] || results.index || [];
    if (timeData.length > 0) {
      summary.timeRange.start = timeData[0];
      summary.timeRange.end = timeData[timeData.length - 1];
      summary.sampleCount = timeData.length;
    }

    // Compute statistics for each variable (excluding Time)
    const variables = results.columns.filter(col => col !== 'Time');
    
    for (const varName of variables) {
      const data = results.data[varName];
      if (!Array.isArray(data) || data.length === 0) {
        continue;
      }

      const sorted = [...data].sort((a, b) => a - b);
      const n = sorted.length;
      
      // Calculate mean
      const mean = data.reduce((sum, val) => sum + val, 0) / n;
      
      // Calculate standard deviation
      const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
      const std = Math.sqrt(variance);
      
      // Calculate percentiles
      const getPercentile = (p: number) => {
        const idx = Math.floor(n * p);
        return sorted[Math.min(idx, n - 1)];
      };

      summary.variables[varName] = {
        mean,
        std,
        min: sorted[0],
        max: sorted[n - 1],
        median: getPercentile(0.5),
        q25: getPercentile(0.25),
        q75: getPercentile(0.75)
      };
    }

    return summary;
  }

  /**
   * Calculates moving averages for smoothing time series
   */
  movingAverage(results: SimulationResults, window: number): SimulationResults {
    if (!results.success || !results.data) {
      return results;
    }

    if (window <= 0) {
      return {
        ...results,
        success: false,
        error: `Window size must be positive, got ${window}`
      };
    }

    const smoothedData: any = {};
    
    for (const [key, values] of Object.entries(results.data)) {
      if (key === 'Time' || !Array.isArray(values)) {
        smoothedData[key] = values;
        continue;
      }

      const smoothed = [];
      for (let i = 0; i < values.length; i++) {
        const start = Math.max(0, i - Math.floor(window / 2));
        const end = Math.min(values.length, i + Math.ceil(window / 2));
        const windowValues = values.slice(start, end);
        const avg = windowValues.reduce((sum, val) => sum + val, 0) / windowValues.length;
        smoothed.push(avg);
      }
      smoothedData[key] = smoothed;
    }

    return {
      ...results,
      data: smoothedData
    };
  }

  /**
   * Computes cumulative sums for each variable
   */
  cumulativeSum(results: SimulationResults): SimulationResults {
    if (!results.success || !results.data) {
      return results;
    }

    const cumulativeData: any = {};
    
    for (const [key, values] of Object.entries(results.data)) {
      if (key === 'Time' || !Array.isArray(values)) {
        cumulativeData[key] = values;
        continue;
      }

      const cumulative = [];
      let sum = 0;
      for (const val of values) {
        sum += val;
        cumulative.push(sum);
      }
      cumulativeData[key] = cumulative;
    }

    return {
      ...results,
      data: cumulativeData
    };
  }

  /**
   * Calculates correlations between variables
   */
  correlations(results: SimulationResults): CorrelationMatrix {
    if (!results.success || !results.data || !results.columns) {
      throw new Error("Invalid simulation results for correlation computation");
    }

    const variables = results.columns.filter(col => col !== 'Time');
    const n = variables.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

    // Calculate correlation for each pair of variables
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1.0; // Self-correlation is always 1
          continue;
        }

        const x = results.data[variables[i]];
        const y = results.data[variables[j]];
        
        if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) {
          matrix[i][j] = 0;
          continue;
        }

        // Calculate Pearson correlation coefficient
        const correlation = this.calculatePearsonCorrelation(x, y);
        matrix[i][j] = correlation;
      }
    }

    return {
      variables,
      matrix
    };
  }

  /**
   * Helper: Calculate Pearson correlation coefficient
   */
  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    if (denominator === 0) return 0;

    return numerator / denominator;
  }
}

export default new DataAggregator();