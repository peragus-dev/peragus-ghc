import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SimulationResults } from "./simulation-runner.mjs";
import resultFilter from "./result-filter.mjs";
import dataAggregator from "./data-aggregator.mjs";
import schemaValidator from "./schema-validator.mjs";
import resultStorage from "./result-storage.mjs";
import outputTransformer from "./output-transformer.mjs";

/**
 * Advanced output processing service that integrates all components
 */
export class AdvancedOutputService {
  constructor(
    private filter = resultFilter,
    private aggregator = dataAggregator,
    private validator = schemaValidator,
    private storage = resultStorage,
    private transformer = outputTransformer
  ) {}

  /**
   * Process simulation results with filtering and aggregation
   */
  async processResults(
    results: SimulationResults,
    options: {
      filterVariables?: string[];
      timeRange?: { start: number; end: number };
      downsample?: number;
      computeStats?: boolean;
      movingAverage?: number;
      cache?: boolean;
      cacheKey?: string;
    }
  ): Promise<{
    processed: SimulationResults;
    statistics?: any;
    cached?: boolean;
  }> {
    // Validate input
    const validation = this.validator.validateSchema(results);
    if (!validation.valid) {
      throw new Error(`Invalid results: ${validation.errors.join(', ')}`);
    }

    let processed = results;

    // Apply filtering
    if (options.filterVariables) {
      processed = this.filter.filterVariables(processed, options.filterVariables);
    }

    if (options.timeRange) {
      processed = this.filter.filterTimeRange(
        processed,
        options.timeRange.start,
        options.timeRange.end
      );
    }

    if (options.downsample) {
      processed = this.filter.downsample(processed, options.downsample);
    }

    // Apply aggregations
    if (options.movingAverage) {
      processed = this.aggregator.movingAverage(processed, options.movingAverage);
    }

    // Compute statistics if requested
    let statistics;
    if (options.computeStats && processed.success) {
      statistics = this.aggregator.computeStatistics(processed);
    }

    // Cache if requested
    let cached = false;
    if (options.cache && options.cacheKey) {
      await this.storage.cacheResults(options.cacheKey, processed, {
        modelPath: 'processed',
        timestamp: Date.now(),
        parameters: options
      });
      cached = true;
    }

    return {
      processed,
      statistics,
      cached
    };
  }

  /**
   * Export results in various formats
   */
  async exportResults(
    results: SimulationResults,
    format: 'json' | 'csv' | 'excel' | 'parquet' | 'html',
    options?: any
  ): Promise<string | Buffer> {
    // Validate results
    const typed = this.validator.ensureTypeSafety(results);

    switch (format) {
      case 'json':
        return this.transformer.exportToJSON(typed, options?.pretty);
      case 'csv':
        return this.transformer.exportToCSV(typed, options?.delimiter);
      case 'excel':
        return this.transformer.exportToExcel(typed, options);
      case 'parquet':
        return this.transformer.exportToParquet(typed);
      case 'html':
        return this.transformer.exportToHTML(typed, options?.maxRows);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
}

// MCP Tool Definitions

/**
 * Tool for filtering PySD results
 */
export const pysdFilterResultsTool: Tool = {
  name: "pysd_filter_results",
  description: "Filter simulation results by variables, time range, or downsample",
  inputSchema: {
    type: "object",
    properties: {
      results: {
        type: "object",
        description: "Simulation results to filter"
      },
      variables: {
        type: "array",
        items: { type: "string" },
        description: "Variables to include"
      },
      start_time: {
        type: "number",
        description: "Start of time range"
      },
      end_time: {
        type: "number",
        description: "End of time range"
      },
      downsample_step: {
        type: "number",
        description: "Downsample by taking every nth step"
      }
    },
    required: ["results"]
  }
};

/**
 * Tool for aggregating PySD data
 */
export const pysdAggregateDataTool: Tool = {
  name: "pysd_aggregate_data",
  description: "Compute statistics and aggregations on simulation results",
  inputSchema: {
    type: "object",
    properties: {
      results: {
        type: "object",
        description: "Simulation results to aggregate"
      },
      compute_statistics: {
        type: "boolean",
        description: "Compute statistical summary"
      },
      moving_average_window: {
        type: "number",
        description: "Window size for moving average"
      },
      cumulative_sum: {
        type: "boolean",
        description: "Compute cumulative sums"
      },
      correlations: {
        type: "boolean",
        description: "Compute correlation matrix"
      }
    },
    required: ["results"]
  }
};

/**
 * Tool for exporting PySD results
 */
export const pysdExportResultsTool: Tool = {
  name: "pysd_export_results",
  description: "Export simulation results to various formats",
  inputSchema: {
    type: "object",
    properties: {
      results: {
        type: "object",
        description: "Simulation results to export"
      },
      format: {
        type: "string",
        enum: ["json", "csv", "excel", "parquet", "html"],
        description: "Export format"
      },
      options: {
        type: "object",
        description: "Format-specific options"
      }
    },
    required: ["results", "format"]
  }
};

/**
 * Tool for caching PySD results
 */
export const pysdCacheResultsTool: Tool = {
  name: "pysd_cache_results",
  description: "Cache or retrieve simulation results",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["store", "retrieve", "query"],
        description: "Cache operation"
      },
      key: {
        type: "string",
        description: "Cache key"
      },
      results: {
        type: "object",
        description: "Results to cache (for store operation)"
      },
      metadata: {
        type: "object",
        description: "Metadata for cached results"
      },
      query: {
        type: "object",
        description: "Query parameters (for query operation)"
      }
    },
    required: ["operation"]
  }
};

// Handler functions

export async function handlePysdFilterResults(args: any) {
  
  try {
    let filtered = args.results;
    
    if (args.variables) {
      filtered = resultFilter.filterVariables(filtered, args.variables);
    }
    
    if (args.start_time !== undefined && args.end_time !== undefined) {
      filtered = resultFilter.filterTimeRange(filtered, args.start_time, args.end_time);
    }
    
    if (args.downsample_step) {
      filtered = resultFilter.downsample(filtered, args.downsample_step);
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(filtered, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ]
    };
  }
}

export async function handlePysdAggregateData(args: any) {
  try {
    const response: any = {
      success: true
    };
    
    if (args.compute_statistics) {
      response.statistics = dataAggregator.computeStatistics(args.results);
    }
    
    if (args.moving_average_window) {
      response.smoothed = dataAggregator.movingAverage(args.results, args.moving_average_window);
    }
    
    if (args.cumulative_sum) {
      response.cumulative = dataAggregator.cumulativeSum(args.results);
    }
    
    if (args.correlations) {
      response.correlations = dataAggregator.correlations(args.results);
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ]
    };
  }
}

export async function handlePysdExportResults(args: any) {
  const service = new AdvancedOutputService();
  
  try {
    const exported = await service.exportResults(
      args.results,
      args.format,
      args.options
    );
    
    return {
      content: [
        {
          type: "text",
          text: typeof exported === 'string' ? exported : exported.toString('base64')
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ]
    };
  }
}

export async function handlePysdCacheResults(args: any) {
  try {
    let response: any = { success: true };
    
    switch (args.operation) {
      case 'store':
        await resultStorage.cacheResults(
          args.key,
          args.results,
          args.metadata || {
            modelPath: 'unknown',
            timestamp: Date.now()
          }
        );
        response.message = `Results cached with key: ${args.key}`;
        break;
        
      case 'retrieve':
        const cached = await resultStorage.getCachedResults(args.key);
        response.results = cached;
        response.found = cached !== null;
        break;
        
      case 'query':
        const records = await resultStorage.queryHistory(args.query || {});
        response.records = records;
        response.count = records.length;
        break;
        
      default:
        throw new Error(`Unknown operation: ${args.operation}`);
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ]
    };
  }
}

// Export service instance
export default new AdvancedOutputService();