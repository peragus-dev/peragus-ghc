import { spawn } from "child_process";
import path from "path";

/**
 * Simulation parameters interface
 */
export interface SimulationParameters {
  startTime?: number;
  endTime?: number;
  timeStep?: number;
  returnTimestamps?: number[];
  overrides?: { [key: string]: any };
  saveper?: number;
  outputFormat?: 'json' | 'csv';
}

/**
 * Simulation results interface
 */
export interface SimulationResults {
  success: boolean;
  data?: any;
  columns?: string[];
  index?: number[];
  error?: string;
  executionTime?: number;
  format?: string;
  shape?: number[];
}

/**
 * Interface for PySD Simulation Runner
 */
export interface IPySDSimulationRunner {
  runSimulation(
    modelPath: string,
    params: SimulationParameters,
    envPath: string
  ): Promise<SimulationResults>;
  validateParameters(params: SimulationParameters): string | null;
}

/**
 * PySD Simulation Runner implementation
 */
export class PySDSimulationRunner implements IPySDSimulationRunner {
  /**
   * Run a PySD simulation with given parameters
   */
  async runSimulation(
    modelPath: string,
    params: SimulationParameters,
    envPath: string
  ): Promise<SimulationResults> {
    const startTime = Date.now();
    
    try {
      // Validate parameters
      const validationError = this.validateParameters(params);
      if (validationError) {
        return {
          success: false,
          error: validationError
        };
      }

      // Build Python script for simulation
      const simulationScript = this.buildSimulationScript(modelPath, params);
      
      // Execute simulation
      const pythonPath = path.join(envPath, "bin", "python");
      const result = await this.executePythonScript(pythonPath, simulationScript);
      
      // Parse results
      const simulationResults = JSON.parse(result) as SimulationResults;
      simulationResults.executionTime = Date.now() - startTime;
      
      return simulationResults;
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Validate simulation parameters
   */
  validateParameters(params: SimulationParameters): string | null {
    if (params.timeStep !== undefined && params.timeStep <= 0) {
      return "Time step must be positive";
    }
    
    if (params.startTime !== undefined && params.endTime !== undefined) {
      if (params.startTime >= params.endTime) {
        return "Start time must be less than end time";
      }
    }
    
    if (params.saveper !== undefined && params.saveper <= 0) {
      return "Saveper must be positive";
    }
    
    return null;
  }

  /**
   * Build Python script for simulation
   */
  private buildSimulationScript(modelPath: string, params: SimulationParameters): string {
    const ext = path.extname(modelPath).toLowerCase();
    
    return `
import json
import sys
import time
import numpy as np
import pandas as pd

model_path = "${modelPath}"
model_ext = "${ext}"

try:
    import pysd
    
    # Load model based on type
    if model_ext == '.mdl':
        model = pysd.read_vensim(model_path)
    elif model_ext in ['.xmile', '.xml']:
        model = pysd.read_xmile(model_path)
    else:
        # Python model
        import importlib.util
        spec = importlib.util.spec_from_file_location("model", model_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model = module.model
    
    # Build run parameters
    run_params = {}
    
    # Time parameters
    ${params.startTime !== undefined ? `run_params['initial_condition'] = 'o'` : ''}
    ${params.startTime !== undefined ? `run_params['initial_condition'] = (${params.startTime}, {})` : ''}
    ${params.endTime !== undefined ? `run_params['final_time'] = ${params.endTime}` : ''}
    ${params.timeStep !== undefined ? `run_params['time_step'] = ${params.timeStep}` : ''}
    ${params.saveper !== undefined ? `run_params['saveper'] = ${params.saveper}` : ''}
    ${params.returnTimestamps ? `run_params['return_timestamps'] = ${JSON.stringify(params.returnTimestamps)}` : ''}
    
    # Apply parameter overrides
    overrides = ${JSON.stringify(params.overrides || {})}
    if overrides:
        # Set initial values for overrides
        initial_values = {}
        for key, value in overrides.items():
            # Try to set as component
            if hasattr(model.components, key):
                initial_values[key] = value
        
        if initial_values:
            if 'initial_condition' in run_params:
                # Merge with existing initial condition
                time, existing_values = run_params['initial_condition']
                existing_values.update(initial_values)
                run_params['initial_condition'] = (time, existing_values)
            else:
                run_params['initial_condition'] = (0, initial_values)
    
    # Run simulation
    start_time = time.time()
    results = model.run(**run_params)
    execution_time = time.time() - start_time
    
    # Format output
    output_format = "${params.outputFormat || 'json'}"
    
    if output_format == 'csv':
        # Return as CSV string
        csv_string = results.to_csv()
        output = {
            "success": True,
            "data": csv_string,
            "format": "csv",
            "shape": list(results.shape),
            "executionTime": execution_time
        }
    else:
        # Return as JSON with separate components
        output = {
            "success": True,
            "data": results.to_dict('list'),
            "columns": list(results.columns),
            "index": results.index.tolist(),
            "format": "json",
            "shape": list(results.shape),
            "executionTime": execution_time
        }
    
    print(json.dumps(output))
    
except FileNotFoundError as e:
    print(json.dumps({
        "success": False,
        "error": f"Model file not found: {str(e)}"
    }))
    sys.exit(1)
    
except ValueError as e:
    print(json.dumps({
        "success": False,
        "error": f"Invalid parameter value: {str(e)}"
    }))
    sys.exit(1)
    
except Exception as e:
    print(json.dumps({
        "success": False,
        "error": f"Simulation failed: {str(e)}"
    }))
    sys.exit(1)
`;
  }

  /**
   * Execute Python script and return output
   */
  private executePythonScript(pythonPath: string, script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(pythonPath, ["-c", script]);
      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Simulation failed: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      process.on("error", (error) => {
        reject(error);
      });
    });
  }
}

export default new PySDSimulationRunner();