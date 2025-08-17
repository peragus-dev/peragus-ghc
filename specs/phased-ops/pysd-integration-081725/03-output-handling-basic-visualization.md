# Phase 3: Advanced Output Processing & Data Aggregation

## Overview
This phase builds upon the existing JSON/CSV output infrastructure from Phase 2 to provide advanced data processing, aggregation, and transformation capabilities. Rather than duplicating the basic data transfer already implemented, this phase focuses on value-added features that enhance the backend's ability to process, analyze, and prepare simulation results for various consumption patterns.

## Prerequisites
- Successful completion of Phase 2: Core Model Loading & Execution, which already provides:
  - JSON conversion from Pandas DataFrame to structured format
  - Basic SimulationResults interface with data, columns, and index
  - CSV output format support
  - Error handling and execution time tracking

## Objectives
1. Implement result filtering and selection mechanisms for extracting specific variables and time ranges from simulation outputs.
2. Develop data aggregation utilities for statistical analysis and time-series transformations.
3. Create advanced output transformation capabilities for multiple export formats and streaming support.
4. Establish result caching and storage infrastructure for efficient reuse and historical analysis.
5. Implement schema validation and type-safe interfaces for data integrity.

## Technical Architecture

### 1. Result Filtering & Selection
Provides mechanisms to extract specific subsets of simulation data based on variables, time ranges, and sampling requirements.

```typescript
// Interface for filtering and selecting simulation results
interface IResultFilter {
  /**
   * Filters simulation results to include only specified variables
   * @param results Full simulation results
   * @param variables Array of variable names to include
   * @returns Filtered results containing only specified variables
   * // TEST: filterVariables correctly extracts specified variables from results
   * // TEST: filterVariables handles non-existent variable names gracefully
   * // TEST: filterVariables preserves time index when filtering variables
   */
  filterVariables(results: SimulationResults, variables: string[]): SimulationResults;

  /**
   * Filters results to a specific time range
   * @param results Full simulation results
   * @param startTime Beginning of time range
   * @param endTime End of time range
   * @returns Results within specified time range
   * // TEST: filterTimeRange correctly extracts data within time bounds
   * // TEST: filterTimeRange handles out-of-bounds time ranges gracefully
   */
  filterTimeRange(results: SimulationResults, startTime: number, endTime: number): SimulationResults;

  /**
   * Downsamples results by selecting every nth timestep
   * @param results Full simulation results
   * @param step Sample every nth timestep
   * @returns Downsampled results
   * // TEST: downsample correctly reduces data by sampling interval
   * // TEST: downsample preserves first and last timesteps
   */
  downsample(results: SimulationResults, step: number): SimulationResults;
}
```

### 2. Data Aggregation Utilities
Provides statistical and time-series aggregation capabilities for analyzing simulation results.

```typescript
// Interface for data aggregation operations
interface IDataAggregator {
  /**
   * Computes statistical summaries for each variable
   * @param results Simulation results to analyze
   * @returns Statistical summaries (mean, std, min, max, percentiles)
   * // TEST: computeStatistics returns correct mean and std for each variable
   * // TEST: computeStatistics handles empty or single-value datasets
   * // TEST: computeStatistics computes accurate percentiles
   */
  computeStatistics(results: SimulationResults): StatisticalSummary;

  /**
   * Calculates moving averages for smoothing time series
   * @param results Simulation results
   * @param window Window size for moving average
   * @returns Results with smoothed values
   * // TEST: movingAverage correctly smooths time series data
   * // TEST: movingAverage handles edge cases at series boundaries
   */
  movingAverage(results: SimulationResults, window: number): SimulationResults;

  /**
   * Computes cumulative sums for each variable
   * @param results Simulation results
   * @returns Results with cumulative values
   * // TEST: cumulativeSum correctly accumulates values over time
   * // TEST: cumulativeSum handles negative values correctly
   */
  cumulativeSum(results: SimulationResults): SimulationResults;

  /**
   * Calculates correlations between variables
   * @param results Simulation results
   * @returns Correlation matrix between all variables
   * // TEST: correlations returns symmetric correlation matrix
   * // TEST: correlations handles single variable case
   */
  correlations(results: SimulationResults): CorrelationMatrix;
}
```

### 3. Output Transformation & Export
Provides advanced transformation and export capabilities for different consumption patterns.

```typescript
// Interface for output transformation and export
interface IOutputTransformer {
  /**
   * Pivots data for different consumption patterns
   * @param results Simulation results
   * @param pivotConfig Configuration for pivot operation
   * @returns Pivoted data structure
   * // TEST: pivot correctly restructures data by specified dimensions
   * // TEST: pivot handles missing data appropriately
   */
  pivot(results: SimulationResults, pivotConfig: PivotConfig): PivotedResults;

  /**
   * Exports results to Excel format
   * @param results Simulation results
   * @param options Export options (sheets, formatting, etc.)
   * @returns Buffer containing Excel file
   * // TEST: exportToExcel creates valid Excel file with correct data
   * // TEST: exportToExcel handles multiple sheets for different variables
   */
  exportToExcel(results: SimulationResults, options?: ExcelExportOptions): Buffer;

  /**
   * Exports results to Parquet format for efficient storage
   * @param results Simulation results
   * @returns Buffer containing Parquet file
   * // TEST: exportToParquet creates valid Parquet file
   * // TEST: exportToParquet preserves data types correctly
   */
  exportToParquet(results: SimulationResults): Buffer;

  /**
   * Creates a streaming interface for large result sets
   * @param results Simulation results
   * @returns Readable stream of results
   * // TEST: createStream efficiently handles large datasets
   * // TEST: createStream supports backpressure handling
   */
  createStream(results: SimulationResults): ReadableStream;
}
```

### 4. Result Caching & Storage
Provides infrastructure for caching and storing simulation results for reuse and historical analysis.

```typescript
// Interface for result caching and storage
interface IResultStorage {
  /**
   * Caches simulation results with metadata
   * @param key Unique identifier for the simulation
   * @param results Simulation results to cache
   * @param metadata Additional metadata (model, parameters, timestamp)
   * @returns Promise resolving when cached
   * // TEST: cacheResults stores results with correct key
   * // TEST: cacheResults includes metadata for retrieval
   * // TEST: cacheResults handles cache size limits appropriately
   */
  cacheResults(key: string, results: SimulationResults, metadata: SimulationMetadata): Promise<void>;

  /**
   * Retrieves cached results
   * @param key Unique identifier for the simulation
   * @returns Cached results or null if not found
   * // TEST: getCachedResults retrieves previously cached data
   * // TEST: getCachedResults returns null for non-existent keys
   * // TEST: getCachedResults validates cache expiry
   */
  getCachedResults(key: string): Promise<SimulationResults | null>;

  /**
   * Queries historical simulation runs
   * @param query Query parameters (model, time range, parameters)
   * @returns Array of matching simulation results with metadata
   * // TEST: queryHistory finds simulations matching criteria
   * // TEST: queryHistory supports complex query combinations
   * // TEST: queryHistory returns results sorted by timestamp
   */
  queryHistory(query: HistoryQuery): Promise<SimulationRecord[]>;
}
```

### 5. Schema Validation & Type Safety
Ensures data integrity and type safety throughout the processing pipeline.

```typescript
// Interface for schema validation
interface ISchemaValidator {
  /**
   * Validates simulation results against expected schema
   * @param results Results to validate
   * @param schema Expected schema definition
   * @returns Validation result with any errors
   * // TEST: validateSchema detects missing required fields
   * // TEST: validateSchema identifies type mismatches
   * // TEST: validateSchema validates nested structures
   */
  validateSchema(results: SimulationResults, schema: ResultSchema): ValidationResult;

  /**
   * Ensures type-safe conversion to TypeScript interfaces
   * @param results Raw results from Python
   * @returns Type-safe simulation data
   * // TEST: ensureTypeSafety converts to correct TypeScript types
   * // TEST: ensureTypeSafety handles null/undefined values
   * // TEST: ensureTypeSafety preserves numeric precision
   */
  ensureTypeSafety(results: any): TypedSimulationResults;
}
```

## Implementation Steps (TDD Approach)

1. **Implement Result Filtering & Selection**
   - **TDD Anchor:** // TEST: ResultFilter implementation correctly filters variables, time ranges, and downsamples data
   - Create `result-filter.mts` with filtering, time range selection, and downsampling capabilities
   - Ensure efficient handling of large datasets

2. **Implement Data Aggregation Utilities**
   - **TDD Anchor:** // TEST: DataAggregator computes accurate statistics, moving averages, and correlations
   - Create `data-aggregator.mts` with statistical and time-series analysis functions
   - Optimize for performance with large datasets

3. **Implement Output Transformation & Export**
   - **TDD Anchor:** // TEST: OutputTransformer correctly exports to Excel, Parquet, and provides streaming
   - Create `output-transformer.mts` with multi-format export capabilities
   - Implement streaming for large result sets

4. **Implement Result Caching & Storage**
   - **TDD Anchor:** // TEST: ResultStorage efficiently caches and retrieves simulation results with metadata
   - Create `result-storage.mts` with caching and query capabilities
   - Implement LRU cache with configurable size limits

5. **Implement Schema Validation**
   - **TDD Anchor:** // TEST: SchemaValidator ensures data integrity and type safety
   - Create `schema-validator.mts` with validation and type conversion
   - Define standard schemas for simulation results

## Integration Points
- **Existing Phase 2 Infrastructure**: Builds on SimulationResults interface and JSON/CSV support
- **Python Backend**: Leverages existing DataFrame to JSON conversion
- **Node.js Services**: Integrates with pysd-service.mts for enhanced processing
- **Storage Systems**: Can integrate with Redis for caching, S3 for long-term storage
- **Export Libraries**: xlsx for Excel, parquet-wasm for Parquet format

## Security Considerations
- **Data Validation**: Strict schema validation prevents injection attacks
- **Cache Security**: Implement access controls for cached results
- **File Export**: Sanitize filenames and validate export paths
- **Stream Security**: Implement rate limiting for streaming endpoints

## Performance Targets
- Result filtering: < 10ms for 10,000 timesteps
- Statistical computation: < 50ms for standard statistics on 100 variables
- Excel export: < 500ms for typical simulation (1000 timesteps, 20 variables)
- Parquet export: < 200ms for same dataset
- Cache retrieval: < 5ms for cached results
- Stream initialization: < 10ms for streaming setup

## Testing Strategy
- **Unit Tests**:
  - Each interface implementation with comprehensive test coverage
  - Edge cases for empty, single-value, and large datasets
  - Performance benchmarks for each operation

- **Integration Tests**:
  - End-to-end pipeline from simulation to filtered/aggregated results
  - Cache persistence and retrieval across sessions
  - Multi-format export validation

- **Performance Tests**:
  - Benchmark with large datasets (100k+ timesteps)
  - Memory usage profiling for streaming operations
  - Cache performance under load

## Value Proposition
This phase adds significant value beyond basic data transfer by providing:
1. **Efficiency**: Reduce data transfer by filtering/downsampling
2. **Analysis**: Built-in statistical and time-series analysis
3. **Flexibility**: Multiple export formats for different use cases
4. **Performance**: Caching for repeated analyses
5. **Reliability**: Schema validation ensures data integrity

## Next Phase Dependencies
- Phase 4: Node.js-Python Communication Layer optimization could benefit from streaming capabilities
- Phase 5: Advanced Simulation Control could leverage caching for parameter sweeps
- Future visualization phases will consume the processed and aggregated data

## Conclusion
Phase 3 transforms the basic output handling from Phase 2 into a comprehensive data processing pipeline. By focusing on value-added features rather than duplicating existing functionality, this phase provides the advanced capabilities needed for production-ready system dynamics analysis while maintaining compatibility with the Krishna platform architecture.