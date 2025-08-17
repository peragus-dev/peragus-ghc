import { SimulationResults } from "./simulation-runner.mjs";

/**
 * Interface for filtering and selecting simulation results
 */
export interface IResultFilter {
  filterVariables(results: SimulationResults, variables: string[]): SimulationResults;
  filterTimeRange(results: SimulationResults, startTime: number, endTime: number): SimulationResults;
  downsample(results: SimulationResults, step: number): SimulationResults;
}

/**
 * Result filtering and selection implementation
 */
export class ResultFilter implements IResultFilter {
  /**
   * Filters simulation results to include only specified variables
   */
  filterVariables(results: SimulationResults, variables: string[]): SimulationResults {
    if (!results.success || !results.data || !results.columns) {
      return results;
    }

    // Validate requested variables exist
    const availableVars = results.columns.filter(col => col !== 'Time');
    const validVars = variables.filter(v => availableVars.includes(v));
    
    if (validVars.length === 0) {
      return {
        ...results,
        success: false,
        error: `None of the requested variables found. Available: ${availableVars.join(', ')}`
      };
    }

    // Filter data to include only Time and requested variables
    const filteredData: any = {};
    const columnsToKeep = ['Time', ...validVars];
    
    for (const col of columnsToKeep) {
      if (results.data[col]) {
        filteredData[col] = results.data[col];
      }
    }

    return {
      ...results,
      data: filteredData,
      columns: columnsToKeep,
      shape: results.shape ? [results.shape[0], columnsToKeep.length] : undefined
    };
  }

  /**
   * Filters results to a specific time range
   */
  filterTimeRange(results: SimulationResults, startTime: number, endTime: number): SimulationResults {
    if (!results.success || !results.data || !results.index) {
      return results;
    }

    // Validate time range
    if (startTime >= endTime) {
      return {
        ...results,
        success: false,
        error: `Invalid time range: startTime (${startTime}) must be less than endTime (${endTime})`
      };
    }

    // Find indices within time range
    const timeArray = results.data['Time'] || results.index;
    const startIdx = timeArray.findIndex((t: number) => t >= startTime);
    const endIdx = timeArray.findIndex((t: number) => t > endTime);
    
    if (startIdx === -1) {
      return {
        ...results,
        success: false,
        error: `No data points found after startTime ${startTime}`
      };
    }

    const actualEndIdx = endIdx === -1 ? timeArray.length : endIdx;
    
    // Slice all data arrays
    const filteredData: any = {};
    for (const [key, values] of Object.entries(results.data)) {
      if (Array.isArray(values)) {
        filteredData[key] = values.slice(startIdx, actualEndIdx);
      }
    }

    const newIndex = results.index.slice(startIdx, actualEndIdx);

    return {
      ...results,
      data: filteredData,
      index: newIndex,
      shape: results.shape ? [newIndex.length, results.shape[1]] : undefined
    };
  }

  /**
   * Downsamples results by selecting every nth timestep
   */
  downsample(results: SimulationResults, step: number): SimulationResults {
    if (!results.success || !results.data) {
      return results;
    }

    if (step <= 0) {
      return {
        ...results,
        success: false,
        error: `Downsample step must be positive, got ${step}`
      };
    }

    if (step === 1) {
      return results; // No downsampling needed
    }

    // Downsample all data arrays
    const downsampledData: any = {};
    for (const [key, values] of Object.entries(results.data)) {
      if (Array.isArray(values)) {
        const downsampled = [];
        for (let i = 0; i < values.length; i += step) {
          downsampled.push(values[i]);
        }
        // Always include last value if not already included
        if ((values.length - 1) % step !== 0) {
          downsampled.push(values[values.length - 1]);
        }
        downsampledData[key] = downsampled;
      }
    }

    // Downsample index
    let newIndex = results.index;
    if (newIndex && Array.isArray(newIndex)) {
      const downsampledIndex = [];
      for (let i = 0; i < newIndex.length; i += step) {
        downsampledIndex.push(newIndex[i]);
      }
      if ((newIndex.length - 1) % step !== 0) {
        downsampledIndex.push(newIndex[newIndex.length - 1]);
      }
      newIndex = downsampledIndex;
    }

    return {
      ...results,
      data: downsampledData,
      index: newIndex,
      shape: results.shape ? [newIndex?.length || 0, results.shape[1]] : undefined
    };
  }
}

export default new ResultFilter();