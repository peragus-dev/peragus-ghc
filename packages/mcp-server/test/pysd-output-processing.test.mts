import { describe, it, expect, beforeEach } from "vitest";
import { ResultFilter } from "../src/tools/pysd/result-filter.mjs";
import { DataAggregator } from "../src/tools/pysd/data-aggregator.mjs";
import { SchemaValidator } from "../src/tools/pysd/schema-validator.mjs";
import { ResultStorage } from "../src/tools/pysd/result-storage.mjs";
import { OutputTransformer } from "../src/tools/pysd/output-transformer.mjs";
import { SimulationResults } from "../src/tools/pysd/simulation-runner.mjs";

// Helper function to create test data
function createTestResults(): SimulationResults {
  return {
    success: true,
    data: {
      Time: [0, 1, 2, 3, 4, 5],
      Stock: [100, 110, 121, 133, 146, 161],
      Flow: [10, 11, 12, 13, 14, 15],
      Rate: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
    },
    columns: ['Time', 'Stock', 'Flow', 'Rate'],
    index: [0, 1, 2, 3, 4, 5],
    executionTime: 150,
    format: 'json'
  };
}

describe("Result Filtering & Selection", () => {
  let filter: ResultFilter;
  let testData: SimulationResults;

  beforeEach(() => {
    filter = new ResultFilter();
    testData = createTestResults();
  });

  describe("filterVariables", () => {
    it("should filter to specified variables", () => {
      const result = filter.filterVariables(testData, ['Stock', 'Flow']);
      
      expect(result.success).toBe(true);
      expect(result.columns).toEqual(['Time', 'Stock', 'Flow']);
      expect(result.data).toHaveProperty('Stock');
      expect(result.data).toHaveProperty('Flow');
      expect(result.data).not.toHaveProperty('Rate');
    });

    it("should handle non-existent variables gracefully", () => {
      const result = filter.filterVariables(testData, ['NonExistent']);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("None of the requested variables found");
    });

    it("should preserve time index when filtering", () => {
      const result = filter.filterVariables(testData, ['Stock']);
      
      expect(result.data).toHaveProperty('Time');
      expect(result.data!['Time']).toEqual(testData.data!['Time']);
    });
  });

  describe("filterTimeRange", () => {
    it("should extract data within time bounds", () => {
      const result = filter.filterTimeRange(testData, 1, 4);
      
      expect(result.success).toBe(true);
      expect(result.index).toEqual([1, 2, 3, 4]);
      expect(result.data!['Stock']).toEqual([110, 121, 133, 146]);
    });

    it("should handle out-of-bounds ranges gracefully", () => {
      const result = filter.filterTimeRange(testData, 10, 20);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("No data points found");
    });

    it("should validate time range", () => {
      const result = filter.filterTimeRange(testData, 4, 2);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be less than");
    });
  });

  describe("downsample", () => {
    it("should reduce data by sampling interval", () => {
      const result = filter.downsample(testData, 2);
      
      expect(result.success).toBe(true);
      expect(result.index).toEqual([0, 2, 4, 5]); // Every 2nd + last
      expect(result.data!['Stock']).toEqual([100, 121, 146, 161]);
    });

    it("should preserve first and last timesteps", () => {
      const result = filter.downsample(testData, 3);
      
      expect(result.success).toBe(true);
      expect(result.index![0]).toBe(0);
      expect(result.index![result.index!.length - 1]).toBe(5);
    });

    it("should handle invalid step values", () => {
      const result = filter.downsample(testData, -1);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be positive");
    });
  });
});

describe("Data Aggregation Utilities", () => {
  let aggregator: DataAggregator;
  let testData: SimulationResults;

  beforeEach(() => {
    aggregator = new DataAggregator();
    testData = createTestResults();
  });

  describe("computeStatistics", () => {
    it("should return correct mean and std for each variable", () => {
      const stats = aggregator.computeStatistics(testData);
      
      expect(stats.variables).toHaveProperty('Stock');
      expect(stats.variables['Stock'].mean).toBeCloseTo(120.167, 2);
      expect(stats.variables['Stock'].min).toBe(100);
      expect(stats.variables['Stock'].max).toBe(161);
    });

    it("should handle empty datasets", () => {
      const emptyData: SimulationResults = {
        success: true,
        data: { Time: [] },
        columns: ['Time'],
        index: []
      };
      
      const stats = aggregator.computeStatistics(emptyData);
      expect(stats.sampleCount).toBe(0);
    });

    it("should compute accurate percentiles", () => {
      const stats = aggregator.computeStatistics(testData);
      
      expect(stats.variables['Flow'].median).toBeCloseTo(12.5, 1);
      expect(stats.variables['Flow'].q25).toBeLessThanOrEqual(stats.variables['Flow'].median);
      expect(stats.variables['Flow'].q75).toBeGreaterThanOrEqual(stats.variables['Flow'].median);
    });
  });

  describe("movingAverage", () => {
    it("should smooth time series data", () => {
      const result = aggregator.movingAverage(testData, 3);
      
      expect(result.success).toBe(true);
      // First value should be average of [100, 110]
      expect(result.data!['Stock'][0]).toBeCloseTo(105, 1);
      // Middle values should be 3-point averages
      expect(result.data!['Stock'][2]).toBeCloseTo(121, 1);
    });

    it("should handle edge cases at boundaries", () => {
      const result = aggregator.movingAverage(testData, 3);
      
      expect(result.data!['Stock'].length).toBe(testData.data!['Stock'].length);
    });
  });

  describe("cumulativeSum", () => {
    it("should accumulate values over time", () => {
      const result = aggregator.cumulativeSum(testData);
      
      expect(result.success).toBe(true);
      expect(result.data!['Flow']).toEqual([10, 21, 33, 46, 60, 75]);
    });

    it("should handle negative values", () => {
      testData.data!['Flow'] = [10, -5, 3, -2, 8, -1];
      const result = aggregator.cumulativeSum(testData);
      
      expect(result.data!['Flow']).toEqual([10, 5, 8, 6, 14, 13]);
    });
  });

  describe("correlations", () => {
    it("should return symmetric correlation matrix", () => {
      const corr = aggregator.correlations(testData);
      
      expect(corr.matrix.length).toBe(3); // Stock, Flow, Rate
      expect(corr.matrix[0]?.[1] ?? 0).toBeCloseTo(corr.matrix[1]?.[0] ?? 0, 10);
    });

    it("should handle single variable", () => {
      const singleVar: SimulationResults = {
        ...testData,
        data: { Time: testData.data!['Time'], Stock: testData.data!['Stock'] },
        columns: ['Time', 'Stock']
      };
      
      const corr = aggregator.correlations(singleVar);
      expect(corr.matrix).toEqual([[1]]);
    });
  });
});

describe("Schema Validation & Type Safety", () => {
  let validator: SchemaValidator;
  let testData: SimulationResults;

  beforeEach(() => {
    validator = new SchemaValidator();
    testData = createTestResults();
  });

  describe("validateSchema", () => {
    it("should detect missing required fields", () => {
      const invalid = { success: true };
      const result = validator.validateSchema(invalid as any);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field: data");
    });

    it("should identify type mismatches", () => {
      const invalid = { ...testData, success: "true" as any };
      const result = validator.validateSchema(invalid);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Field 'success' must be boolean");
    });

    it("should validate nested structures", () => {
      const result = validator.validateSchema(testData);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("ensureTypeSafety", () => {
    it("should convert to correct TypeScript types", () => {
      const raw = {
        success: "true",
        data: {
          Time: ["0", "1", "2"],
          Value: [100, "200", 300]
        },
        columns: ["Time", "Value"]
      };
      
      const typed = validator.ensureTypeSafety(raw);
      
      expect(typed.success).toBe(true);
      expect(typed.data['Time']).toEqual([0, 1, 2]);
      expect(typed.data['Value']).toEqual([100, 200, 300]);
    });

    it("should handle null/undefined values", () => {
      const raw = {
        success: true,
        data: { Time: [0, null, 2], Value: [undefined, 100, null] }
      };
      
      const typed = validator.ensureTypeSafety(raw);
      expect(typed.data['Time']).toEqual([0, 0, 2]);
      expect(typed.data['Value']).toEqual([0, 100, 0]);
    });
  });
});

describe("Result Caching & Storage", () => {
  let storage: ResultStorage;
  let testData: SimulationResults;

  beforeEach(async () => {
    storage = new ResultStorage(10, 100); // Small cache for testing
    await storage.clearCache();
    testData = createTestResults();
  });

  describe("cacheResults", () => {
    it("should store results with correct key", async () => {
      const key = "test-key-1";
      const metadata = {
        modelPath: "/path/to/model.py",
        timestamp: Date.now()
      };
      
      await storage.cacheResults(key, testData, metadata);
      const cached = await storage.getCachedResults(key);
      
      expect(cached).not.toBeNull();
      expect(cached?.success).toBe(true);
    });

    it("should handle cache size limits", async () => {
      // Fill cache beyond limit
      for (let i = 0; i < 15; i++) {
        await storage.cacheResults(`key-${i}`, testData, {
          modelPath: `/model-${i}.py`,
          timestamp: Date.now()
        });
      }
      
      const stats = storage.getCacheStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(10);
    });
  });

  describe("queryHistory", () => {
    it("should find simulations matching criteria", async () => {
      // Add test data
      await storage.cacheResults("test1", testData, {
        modelPath: "/model1.py",
        timestamp: Date.now(),
        tags: ["test", "phase3"]
      });
      
      await storage.cacheResults("test2", testData, {
        modelPath: "/model2.py",
        timestamp: Date.now(),
        tags: ["production"]
      });
      
      const results = await storage.queryHistory({
        tags: ["test"]
      });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.metadata.tags).toContain("test");
    });

    it("should return results sorted by timestamp", async () => {
      const now = Date.now();
      
      await storage.cacheResults("old", testData, {
        modelPath: "/model.py",
        timestamp: now - 1000
      });
      
      await storage.cacheResults("new", testData, {
        modelPath: "/model.py",
        timestamp: now
      });
      
      const results = await storage.queryHistory({});
      if (results.length > 0) {
        expect(results[0]?.metadata.timestamp).toBeGreaterThanOrEqual(
          results[results.length - 1]?.metadata.timestamp ?? 0
        );
      }
    });
  });
});

describe("Output Transformation & Export", () => {
  let transformer: OutputTransformer;
  let testData: SimulationResults;

  beforeEach(() => {
    transformer = new OutputTransformer();
    testData = createTestResults();
  });

  describe("pivot", () => {
    it("should restructure data by specified dimensions", () => {
      const pivoted = transformer.pivot(testData, {
        index: 'Time',
        values: ['Stock', 'Flow']
      });
      
      expect(pivoted.index).toEqual(testData.data!['Time']);
      expect(pivoted.columns).toEqual(['Stock', 'Flow']);
      expect(pivoted.data[0]).toEqual([100, 10]);
    });

    it("should handle missing data", () => {
      delete testData.data!['Flow'];
      
      const pivoted = transformer.pivot(testData, {
        values: ['Stock', 'Flow']
      });
      
      expect(pivoted.data[0]?.[1]).toBeNull();
    });
  });

  describe("exportToCSV", () => {
    it("should create valid CSV with correct data", () => {
      const csv = transformer.exportToCSV(testData);
      const lines = csv.split('\n');
      
      expect(lines[0]).toBe('Time,Stock,Flow,Rate');
      expect(lines[1]).toBe('0,100,10,0.1');
    });

    it("should handle custom delimiters", () => {
      const csv = transformer.exportToCSV(testData, ';');
      
      expect(csv).toContain('Time;Stock;Flow;Rate');
    });

    it("should escape special characters", () => {
      testData.data!['Text'] = ['hello', 'world,test', 'quote"test'];
      testData.columns!.push('Text');
      
      const csv = transformer.exportToCSV(testData);
      expect(csv).toContain('"world,test"');
      expect(csv).toContain('"quote""test"');
    });
  });

  describe("exportToJSON", () => {
    it("should include metadata in JSON export", () => {
      const json = transformer.exportToJSON(testData, true);
      const parsed = JSON.parse(json);
      
      expect(parsed.metadata.success).toBe(true);
      expect(parsed.metadata.executionTime).toBe(150);
      expect(parsed.data).toBeDefined();
    });
  });

  describe("createStream", () => {
    it("should efficiently handle streaming", async () => {
      const stream = transformer.createStream(testData);
      let data = '';
      
      return new Promise<void>((resolve) => {
        stream.on('data', (chunk) => {
          data += chunk;
        });
        
        stream.on('end', () => {
          const lines = data.split('\n');
          expect(lines[0]).toBe('Time,Stock,Flow,Rate');
          expect(lines.length).toBeGreaterThan(testData.index!.length);
          resolve();
        });
      });
    });
  });
});

describe("Performance Tests", () => {
  it("should filter 10,000 timesteps in < 10ms", () => {
    const largeData: SimulationResults = {
      success: true,
      data: {
        Time: Array.from({ length: 10000 }, (_, i) => i),
        Value1: Array.from({ length: 10000 }, () => Math.random()),
        Value2: Array.from({ length: 10000 }, () => Math.random())
      },
      columns: ['Time', 'Value1', 'Value2'],
      index: Array.from({ length: 10000 }, (_, i) => i)
    };
    
    const filter = new ResultFilter();
    const start = Date.now();
    filter.filterVariables(largeData, ['Value1']);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(10);
  });

  it("should compute statistics for 100 variables in < 50ms", () => {
    const data: any = { Time: Array.from({ length: 100 }, (_, i) => i) };
    const columns = ['Time'];
    
    for (let i = 0; i < 100; i++) {
      const varName = `Var${i}`;
      data[varName] = Array.from({ length: 100 }, () => Math.random());
      columns.push(varName);
    }
    
    const largeData: SimulationResults = {
      success: true,
      data,
      columns,
      index: data.Time
    };
    
    const aggregator = new DataAggregator();
    const start = Date.now();
    aggregator.computeStatistics(largeData);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(50);
  });
});