import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { promises as fs } from "fs";
import { PySDModelLoader } from "../src/tools/pysd/model-loader.mjs";
import { PySDSimulationRunner } from "../src/tools/pysd/simulation-runner.mjs";
import { NodePySDSimulationService } from "../src/tools/pysd/pysd-service.mjs";
import { PythonEnvironmentManager } from "../src/tools/pysd/environment-manager.mjs";

describe("PySD Model Loading & Execution Tests", () => {
  const testEnvId = "test-pysd-exec";
  const testEnvPath = path.join("/tmp", ".venv", testEnvId);
  const modelLoader = new PySDModelLoader();
  const simulationRunner = new PySDSimulationRunner();
  const service = new NodePySDSimulationService();
  const envManager = new PythonEnvironmentManager();
  
  // Test model paths
  const testModelDir = path.join("/tmp", "test-models");
  const pythonModelPath = path.join(testModelDir, "test_model.py");
  
  beforeAll(async () => {
    // Create test environment
    await fs.rm(testEnvPath, { recursive: true, force: true }).catch(() => {});
    await envManager.initializeEnvironment(testEnvPath);
    await envManager.installPySDDependencies(testEnvPath);
    
    // Create test model directory
    await fs.mkdir(testModelDir, { recursive: true });
    
    // Create a simple Python test model
    const pythonModelCode = `
import numpy as np
import pandas as pd

class TestModel:
    def __init__(self):
        self.components = type('Components', (), {
            '_namespace': {
                'stock': 100,
                'flow_rate': 10,
                'time_step': 1
            }
        })()
    
    def doc(self):
        return {
            "description": "Test model for PySD integration",
            "units": {
                "stock": "items",
                "flow_rate": "items/time"
            }
        }
    
    def run(self, initial_condition=None, final_time=10, time_step=1, 
            saveper=None, return_timestamps=None):
        # Simple stock and flow model
        if initial_condition and isinstance(initial_condition, tuple):
            start_time, initial_values = initial_condition
        else:
            start_time = 0
            initial_values = {}
        
        stock = initial_values.get('stock', 100)
        flow_rate = initial_values.get('flow_rate', 10)
        
        times = np.arange(start_time, final_time + time_step, time_step)
        if return_timestamps:
            times = np.array(return_timestamps)
        
        stocks = []
        flows = []
        
        for t in times:
            stocks.append(stock)
            flows.append(flow_rate)
            stock = stock + flow_rate * time_step
        
        return pd.DataFrame({
            'Time': times,
            'Stock': stocks,
            'Flow': flows
        }).set_index('Time')

model = TestModel()
`;
    
    await fs.writeFile(pythonModelPath, pythonModelCode);
  }, 60000);
  
  afterAll(async () => {
    // Cleanup
    await fs.rm(testEnvPath, { recursive: true, force: true }).catch(() => {});
    await fs.rm(testModelDir, { recursive: true, force: true }).catch(() => {});
  });
  
  describe("Model Loading", () => {
    it("should load a Python model successfully", async () => {
      const modelInfo = await modelLoader.loadModel(pythonModelPath, testEnvPath);
      
      expect(modelInfo.success).toBe(true);
      expect(modelInfo.modelPath).toBe(pythonModelPath);
      expect(modelInfo.modelType).toBe('python');
      expect(modelInfo.components).toContain('stock');
      expect(modelInfo.components).toContain('flow_rate');
    }, 30000);
    
    it("should handle non-existent model paths", async () => {
      const fakePath = "/tmp/non-existent-model.py";
      const modelInfo = await modelLoader.loadModel(fakePath, testEnvPath);
      
      expect(modelInfo.success).toBe(false);
      expect(modelInfo.error).toContain("not found");
    });
    
    it("should validate model path existence", async () => {
      const exists = await modelLoader.validateModelPath(pythonModelPath);
      expect(exists).toBe(true);
      
      const notExists = await modelLoader.validateModelPath("/tmp/fake.mdl");
      expect(notExists).toBe(false);
    });
    
    it("should reject unsupported model formats", async () => {
      const unsupportedPath = path.join(testModelDir, "test.txt");
      await fs.writeFile(unsupportedPath, "not a model");
      
      const modelInfo = await modelLoader.loadModel(unsupportedPath, testEnvPath);
      
      expect(modelInfo.success).toBe(false);
      expect(modelInfo.error).toContain("Unsupported model format");
    });
  });
  
  describe("Simulation Execution", () => {
    it("should run a simulation with default parameters", async () => {
      const params = {
        endTime: 5,
        timeStep: 1
      };
      
      const results = await simulationRunner.runSimulation(
        pythonModelPath,
        params,
        testEnvPath
      );
      
      expect(results.success).toBe(true);
      expect(results.data).toBeDefined();
      expect(results.columns).toContain('Stock');
      expect(results.columns).toContain('Flow');
      expect(results.index).toHaveLength(6); // 0 to 5
    }, 30000);
    
    it("should apply parameter overrides", async () => {
      const params = {
        endTime: 3,
        timeStep: 1,
        overrides: {
          stock: 50,
          flow_rate: 5
        }
      };
      
      const results = await simulationRunner.runSimulation(
        pythonModelPath,
        params,
        testEnvPath
      );
      
      expect(results.success).toBe(true);
      expect(results.data).toBeDefined();
      expect(results.data['Stock'][0]).toBe(50); // Initial stock
    }, 30000);
    
    it("should validate negative time steps", () => {
      const params = {
        timeStep: -1
      };
      
      const error = simulationRunner.validateParameters(params);
      expect(error).toContain("Time step must be positive");
    });
    
    it("should validate start/end time relationship", () => {
      const params = {
        startTime: 10,
        endTime: 5
      };
      
      const error = simulationRunner.validateParameters(params);
      expect(error).toContain("Start time must be less than end time");
    });
    
    it("should return results at specific timestamps", async () => {
      const params = {
        returnTimestamps: [0, 2, 4]
      };
      
      const results = await simulationRunner.runSimulation(
        pythonModelPath,
        params,
        testEnvPath
      );
      
      expect(results.success).toBe(true);
      expect(results.index).toEqual([0, 2, 4]);
    }, 30000);
    
    it("should handle CSV output format", async () => {
      const params = {
        endTime: 2,
        outputFormat: 'csv' as const
      };
      
      const results = await simulationRunner.runSimulation(
        pythonModelPath,
        params,
        testEnvPath
      );
      
      expect(results.success).toBe(true);
      expect(results.data).toContain("Time,Stock,Flow");
      expect(results.format).toBe("csv");
    }, 30000);
  });
  
  describe("Node.js Integration Service", () => {
    it("should load model through service", async () => {
      const modelInfo = await service.loadModel(pythonModelPath, testEnvId);
      
      expect(modelInfo.success).toBe(true);
      expect(modelInfo.modelType).toBe('python');
    }, 30000);
    
    it("should run simulation through service", async () => {
      const params = {
        endTime: 5,
        timeStep: 0.5
      };
      
      const results = await service.initiateSimulation(
        pythonModelPath,
        params,
        testEnvId
      );
      
      expect(results.success).toBe(true);
      expect(results.executionTime).toBeDefined();
      expect(results.executionTime).toBeGreaterThan(0);
    }, 30000);
    
    it("should handle missing environment gracefully", async () => {
      await expect(
        service.loadModel(pythonModelPath, "non-existent-env")
      ).rejects.toThrow("not properly initialized");
    });
  });
  
  describe("Performance Tests", () => {
    it("should load model within performance target", async () => {
      const startTime = Date.now();
      await modelLoader.loadModel(pythonModelPath, testEnvPath);
      const loadTime = Date.now() - startTime;
      
      expect(loadTime).toBeLessThan(2000); // < 2 seconds
    }, 30000);
    
    it("should execute small simulation within performance target", async () => {
      const params = {
        endTime: 10,
        timeStep: 1
      };
      
      const results = await simulationRunner.runSimulation(
        pythonModelPath,
        params,
        testEnvPath
      );
      
      expect(results.executionTime).toBeDefined();
      expect(results.executionTime).toBeLessThan(1000); // < 1 second
    }, 30000);
  });
  
  describe("Error Handling", () => {
    it("should handle corrupted model files", async () => {
      const corruptedPath = path.join(testModelDir, "corrupted.py");
      await fs.writeFile(corruptedPath, "this is not valid python code {[}");
      
      const modelInfo = await modelLoader.loadModel(corruptedPath, testEnvPath);
      
      expect(modelInfo.success).toBe(false);
      expect(modelInfo.error).toBeDefined();
    });
    
    it("should propagate Python errors correctly", async () => {
      const badModelPath = path.join(testModelDir, "bad_model.py");
      await fs.writeFile(badModelPath, `
model = None  # Model is None, will cause error
`);
      
      const results = await simulationRunner.runSimulation(
        badModelPath,
        { endTime: 10 },
        testEnvPath
      );
      
      expect(results.success).toBe(false);
      expect(results.error).toBeDefined();
    }, 30000);
  });
});