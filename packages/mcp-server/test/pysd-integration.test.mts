import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { promises as fs } from "fs";
import { PythonEnvironmentManager } from "../src/tools/pysd/environment-manager.mts";
import {
  handlePysdEnvironmentSetup,
  handlePysdRunModel,
  handlePysdValidateModel
} from "../src/tools/pysd/pysd-runner.mts";

describe("PySD Integration Tests", () => {
  const testEnvId = "test-pysd-env";
  const testEnvPath = path.join("/tmp", ".venv", testEnvId);
  const manager = new PythonEnvironmentManager();

  beforeAll(async () => {
    // Clean up any existing test environment
    await fs.rm(testEnvPath, { recursive: true, force: true }).catch(() => {});
  }, 60000);

  afterAll(async () => {
    // Clean up test environment
    await fs.rm(testEnvPath, { recursive: true, force: true }).catch(() => {});
  });

  describe("PythonEnvironmentManager", () => {
    it("should initialize a Python virtual environment", async () => {
      await manager.initializeEnvironment(testEnvPath);
      
      // Check that venv directory was created
      const stats = await fs.stat(testEnvPath);
      expect(stats.isDirectory()).toBe(true);
      
      // Check for Python executable
      const pythonPath = path.join(testEnvPath, "bin", "python");
      const pythonStats = await fs.stat(pythonPath);
      expect(pythonStats.isFile()).toBe(true);
    }, 30000);

    it("should install PySD dependencies", async () => {
      await manager.installPySDDependencies(testEnvPath);
      
      // Verify PySD is installed
      const isInstalled = await manager.verifyPySDInstallation(testEnvPath);
      expect(isInstalled).toBe(true);
    }, 120000);

    it("should execute Python scripts in the environment", async () => {
      const script = `
print("Hello from Python")
import sys
print(f"Python version: {sys.version}")
`;
      
      const output = await manager.executePythonScriptInEnv(testEnvPath, script);
      expect(output).toContain("Hello from Python");
      expect(output).toContain("Python version:");
    });

    it("should verify PySD installation correctly", async () => {
      const isInstalled = await manager.verifyPySDInstallation(testEnvPath);
      expect(isInstalled).toBe(true);
    });
  });

  describe("MCP Tool Handlers", () => {
    it("should handle PySD environment setup", async () => {
      const result = await handlePysdEnvironmentSetup({
        environment_id: "mcp-test-env",
        python_version: "3.8"
      });
      
      expect(result.success).toBe(true);
      expect(result.environment_id).toBe("mcp-test-env");
      expect(result.message).toContain("successfully initialized");
    }, 120000);

    it("should validate model structure", async () => {
      // Create a simple test model
      const modelPath = path.join(testEnvPath, "test_model.py");
      const modelContent = `
class TestModel:
    def run(self):
        return {"time": [0, 1, 2], "value": [1, 2, 3]}
    
    def doc(self):
        return {"description": "Test model"}

model = TestModel()
`;
      await fs.writeFile(modelPath, modelContent);
      
      const result = await handlePysdValidateModel({
        environment_id: testEnvId,
        model_path: modelPath
      });
      
      expect(result.success).toBe(true);
      expect(result.model_path).toBe(modelPath);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing environment gracefully", async () => {
      const nonExistentPath = "/tmp/non-existent-env";
      const result = await manager.verifyPySDInstallation(nonExistentPath);
      expect(result).toBe(false);
    });

    it("should handle invalid Python scripts", async () => {
      const invalidScript = "import non_existent_module";
      
      await expect(
        manager.executePythonScriptInEnv(testEnvPath, invalidScript)
      ).rejects.toThrow();
    });
  });
});

describe("PySD Model Execution", () => {
  it("should create and run a simple SIR model", async () => {
    const envId = "sir-test-env";
    
    // Setup environment
    const setupResult = await handlePysdEnvironmentSetup({
      environment_id: envId
    });
    expect(setupResult.success).toBe(true);
    
    // Create SIR model
    const modelPath = path.join("/tmp", ".venv", envId, "sir_model.py");
    const modelCode = `
import numpy as np

class SIRModel:
    def __init__(self):
        self.params = {
            'contact_rate': 10,
            'infectivity': 0.015,
            'recovery_time': 5,
            'total_population': 1000
        }
    
    def set_components(self, params):
        self.params.update(params)
    
    def run(self, return_timestamps=None):
        import pandas as pd
        
        # Simple SIR implementation
        dt = 0.125
        times = return_timestamps if return_timestamps else np.arange(0, 10, dt)
        
        S = [999]
        I = [1]
        R = [0]
        
        for t in times[1:]:
            s_prev = S[-1]
            i_prev = I[-1]
            r_prev = R[-1]
            
            infection_rate = (self.params['contact_rate'] * 
                             self.params['infectivity'] * 
                             s_prev * i_prev / 
                             self.params['total_population'])
            recovery_rate = i_prev / self.params['recovery_time']
            
            S.append(max(0, s_prev - infection_rate * dt))
            I.append(max(0, i_prev + (infection_rate - recovery_rate) * dt))
            R.append(max(0, r_prev + recovery_rate * dt))
        
        return pd.DataFrame({
            'Susceptible': S[:len(times)],
            'Infected': I[:len(times)],
            'Recovered': R[:len(times)]
        }, index=times)

model = SIRModel()
`;
    
    await fs.mkdir(path.dirname(modelPath), { recursive: true });
    await fs.writeFile(modelPath, modelCode);
    
    // Run model
    const runResult = await handlePysdRunModel({
      environment_id: envId,
      model_path: modelPath,
      parameters: { contact_rate: 15 },
      return_timestamps: [0, 1, 2, 3, 4, 5]
    });
    
    expect(runResult.success).toBe(true);
    expect(runResult.results).toBeDefined();
    expect(runResult.columns).toContain('Susceptible');
    expect(runResult.columns).toContain('Infected');
    expect(runResult.columns).toContain('Recovered');
  }, 120000);
});