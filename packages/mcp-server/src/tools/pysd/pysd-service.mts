import { Tool } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { PySDModelLoader, ModelInfo } from "./model-loader.mjs";
import { PySDSimulationRunner, SimulationParameters, SimulationResults } from "./simulation-runner.mjs";
import { PythonEnvironmentManager } from "./environment-manager.mjs";

/**
 * Node.js PySD Simulation Service
 */
export interface INodePySDSimulationService {
  initiateSimulation(
    modelPath: string,
    simulationRequest: SimulationParameters,
    environmentId: string
  ): Promise<SimulationResults>;
  
  loadModel(
    modelPath: string,
    environmentId: string
  ): Promise<ModelInfo>;
}

/**
 * PySD Service implementation
 */
export class NodePySDSimulationService implements INodePySDSimulationService {
  private modelLoader: PySDModelLoader;
  private simulationRunner: PySDSimulationRunner;
  private envManager: PythonEnvironmentManager;
  
  constructor() {
    this.modelLoader = new PySDModelLoader();
    this.simulationRunner = new PySDSimulationRunner();
    this.envManager = new PythonEnvironmentManager();
  }
  
  /**
   * Load a PySD model
   */
  async loadModel(modelPath: string, environmentId: string): Promise<ModelInfo> {
    const envPath = this.getEnvironmentPath(environmentId);
    
    // Ensure environment is ready
    const isReady = await this.envManager.verifyPySDInstallation(envPath);
    if (!isReady) {
      throw new Error(`PySD environment ${environmentId} is not properly initialized`);
    }
    
    return this.modelLoader.loadModel(modelPath, envPath);
  }
  
  /**
   * Initiate a PySD simulation
   */
  async initiateSimulation(
    modelPath: string,
    simulationRequest: SimulationParameters,
    environmentId: string
  ): Promise<SimulationResults> {
    const envPath = this.getEnvironmentPath(environmentId);
    
    // Ensure environment is ready
    const isReady = await this.envManager.verifyPySDInstallation(envPath);
    if (!isReady) {
      throw new Error(`PySD environment ${environmentId} is not properly initialized`);
    }
    
    // Run simulation
    return this.simulationRunner.runSimulation(modelPath, simulationRequest, envPath);
  }
  
  /**
   * Get environment path from ID
   */
  private getEnvironmentPath(environmentId: string): string {
    return path.join("/tmp", ".venv", environmentId);
  }
}

// MCP Tool Definitions

/**
 * Tool for loading PySD models
 */
export const pysdLoadModelTool: Tool = {
  name: "pysd_load_model",
  description: "Load a PySD model file (Vensim .mdl, XMILE .xmile, or Python .py)",
  inputSchema: {
    type: "object",
    properties: {
      model_path: {
        type: "string",
        description: "Path to the model file"
      },
      environment_id: {
        type: "string",
        description: "PySD environment identifier"
      }
    },
    required: ["model_path", "environment_id"]
  }
};

/**
 * Tool for running PySD simulations
 */
export const pysdRunSimulationTool: Tool = {
  name: "pysd_run_simulation",
  description: "Execute a PySD model simulation with parameters",
  inputSchema: {
    type: "object",
    properties: {
      model_path: {
        type: "string",
        description: "Path to the model file"
      },
      environment_id: {
        type: "string",
        description: "PySD environment identifier"
      },
      start_time: {
        type: "number",
        description: "Simulation start time"
      },
      end_time: {
        type: "number",
        description: "Simulation end time"
      },
      time_step: {
        type: "number",
        description: "Simulation time step"
      },
      overrides: {
        type: "object",
        description: "Parameter overrides",
        additionalProperties: true
      },
      return_timestamps: {
        type: "array",
        items: { type: "number" },
        description: "Specific timestamps to return"
      },
      output_format: {
        type: "string",
        enum: ["json", "csv"],
        description: "Output format (default: json)"
      }
    },
    required: ["model_path", "environment_id"]
  }
};

/**
 * Tool for batch simulations
 */
export const pysdBatchSimulationTool: Tool = {
  name: "pysd_batch_simulation",
  description: "Run multiple PySD simulations with different parameters",
  inputSchema: {
    type: "object",
    properties: {
      model_path: {
        type: "string",
        description: "Path to the model file"
      },
      environment_id: {
        type: "string",
        description: "PySD environment identifier"
      },
      scenarios: {
        type: "array",
        description: "Array of simulation scenarios",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            parameters: { type: "object" }
          }
        }
      },
      base_parameters: {
        type: "object",
        description: "Base parameters for all scenarios"
      }
    },
    required: ["model_path", "environment_id", "scenarios"]
  }
};

// Handler functions for MCP tools

/**
 * Handle PySD model loading
 */
export async function handlePysdLoadModel(args: any) {
  const { model_path, environment_id } = args;
  const service = new NodePySDSimulationService();
  
  try {
    const modelInfo = await service.loadModel(model_path, environment_id);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(modelInfo, null, 2)
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

/**
 * Handle PySD simulation execution
 */
export async function handlePysdRunSimulation(args: any) {
  const {
    model_path,
    environment_id,
    start_time,
    end_time,
    time_step,
    overrides,
    return_timestamps,
    output_format
  } = args;
  
  const service = new NodePySDSimulationService();
  
  const params: SimulationParameters = {
    startTime: start_time,
    endTime: end_time,
    timeStep: time_step,
    overrides,
    returnTimestamps: return_timestamps,
    outputFormat: output_format || 'json'
  };
  
  try {
    const results = await service.initiateSimulation(model_path, params, environment_id);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results, null, 2)
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

/**
 * Handle batch simulations
 */
export async function handlePysdBatchSimulation(args: any) {
  const {
    model_path,
    environment_id,
    scenarios,
    base_parameters
  } = args;
  
  const service = new NodePySDSimulationService();
  const results: any[] = [];
  
  for (const scenario of scenarios) {
    const params: SimulationParameters = {
      ...base_parameters,
      ...scenario.parameters
    };
    
    try {
      const result = await service.initiateSimulation(model_path, params, environment_id);
      results.push({
        scenario: scenario.name,
        success: result.success,
        data: result.data,
        executionTime: result.executionTime
      });
    } catch (error) {
      results.push({
        scenario: scenario.name,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          results,
          totalScenarios: scenarios.length
        }, null, 2)
      }
    ]
  };
}

// Export default service instance
export default new NodePySDSimulationService();