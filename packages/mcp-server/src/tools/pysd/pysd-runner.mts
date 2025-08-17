import { Tool } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { PythonEnvironmentManager } from "./environment-manager.mjs";

// Re-export new model loading and simulation tools
export { 
  pysdLoadModelTool,
  pysdRunSimulationTool,
  pysdBatchSimulationTool,
  handlePysdLoadModel,
  handlePysdRunSimulation,
  handlePysdBatchSimulation
} from "./pysd-service.mjs";

/**
 * MCP Tool for PySD environment setup
 */
export const pysdEnvironmentSetupTool: Tool = {
  name: "pysd_environment_setup",
  description: "Initialize Python environment with PySD for system dynamics modeling",
  inputSchema: {
    type: "object",
    properties: {
      environment_id: {
        type: "string",
        description: "Unique identifier for the environment"
      },
      python_version: {
        type: "string",
        description: "Python version to use (default: 3.8+)",
        default: "3.8"
      }
    },
    required: ["environment_id"]
  }
};

/**
 * MCP Tool for running PySD models
 */
export const pysdRunModelTool: Tool = {
  name: "pysd_run_model",
  description: "Execute a PySD system dynamics model in the container environment",
  inputSchema: {
    type: "object",
    properties: {
      environment_id: {
        type: "string",
        description: "Environment identifier where PySD is installed"
      },
      model_path: {
        type: "string",
        description: "Path to the model file (.mdl, .xmile, or .py)"
      },
      parameters: {
        type: "object",
        description: "Model parameters to override",
        additionalProperties: true
      },
      return_timestamps: {
        type: "array",
        items: { type: "number" },
        description: "Specific timestamps to return results for"
      }
    },
    required: ["environment_id", "model_path"]
  }
};

/**
 * MCP Tool for PySD model validation
 */
export const pysdValidateModelTool: Tool = {
  name: "pysd_validate_model",
  description: "Validate a PySD model structure and equations",
  inputSchema: {
    type: "object",
    properties: {
      environment_id: {
        type: "string",
        description: "Environment identifier"
      },
      model_path: {
        type: "string",
        description: "Path to the model file"
      }
    },
    required: ["environment_id", "model_path"]
  }
};

/**
 * Handle PySD environment setup
 */
export async function handlePysdEnvironmentSetup(args: any) {
  const { environment_id } = args;
  const envPath = path.join("/workdir", ".venv", environment_id);
  
  const manager = new PythonEnvironmentManager();
  
  try {
    // Initialize environment
    await manager.initializeEnvironment(envPath);
    
    // Install PySD dependencies
    await manager.installPySDDependencies(envPath);
    
    // Verify installation
    const isValid = await manager.verifyPySDInstallation(envPath);
    
    if (!isValid) {
      throw new Error("PySD installation verification failed");
    }
    
    return {
      success: true,
      environment_id,
      path: envPath,
      message: "PySD environment successfully initialized"
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Handle PySD model execution
 */
export async function handlePysdRunModel(args: any) {
  const { environment_id, model_path, parameters, return_timestamps } = args;
  const envPath = path.join("/workdir", ".venv", environment_id);
  
  const manager = new PythonEnvironmentManager();
  
  // Python script to run the model
  const runScript = `
import json
import sys
import pysd
import pandas as pd

# Load model
try:
    if '${model_path}'.endswith('.mdl'):
        model = pysd.read_vensim('${model_path}')
    elif '${model_path}'.endswith('.xmile'):
        model = pysd.read_xmile('${model_path}')
    else:
        # Assume it's a Python model
        import importlib.util
        spec = importlib.util.spec_from_file_location("model", '${model_path}')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model = module.model
except Exception as e:
    print(json.dumps({"error": f"Failed to load model: {str(e)}"}))
    sys.exit(1)

# Set parameters if provided
params = ${JSON.stringify(parameters || {})}
if params:
    for key, value in params.items():
        if hasattr(model, 'set_components'):
            model.set_components({key: value})

# Run model
try:
    return_timestamps = ${JSON.stringify(return_timestamps || [])}
    if return_timestamps:
        results = model.run(return_timestamps=return_timestamps)
    else:
        results = model.run()
    
    # Convert results to JSON-serializable format
    output = {
        "success": True,
        "results": results.to_dict('list'),
        "columns": list(results.columns),
        "index": results.index.tolist()
    }
    print(json.dumps(output))
except Exception as e:
    print(json.dumps({"error": f"Failed to run model: {str(e)}"}))
    sys.exit(1)
`;

  try {
    const output = await manager.executePythonScriptInEnv(envPath, runScript);
    return JSON.parse(output);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Handle PySD model validation
 */
export async function handlePysdValidateModel(args: any) {
  const { environment_id, model_path } = args;
  const envPath = path.join("/workdir", ".venv", environment_id);
  
  const manager = new PythonEnvironmentManager();
  
  const validateScript = `
import json
import sys
import pysd

try:
    # Try to load the model
    if '${model_path}'.endswith('.mdl'):
        model = pysd.read_vensim('${model_path}')
    elif '${model_path}'.endswith('.xmile'):
        model = pysd.read_xmile('${model_path}')
    else:
        # Python model
        import importlib.util
        spec = importlib.util.spec_from_file_location("model", '${model_path}')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model = module.model
    
    # Get model information
    info = {
        "success": True,
        "model_path": '${model_path}',
        "components": list(model.components._namespace.keys()) if hasattr(model, 'components') else [],
        "doc": model.doc() if hasattr(model, 'doc') else {}
    }
    
    print(json.dumps(info))
except Exception as e:
    print(json.dumps({
        "success": False,
        "error": str(e)
    }))
    sys.exit(1)
`;

  try {
    const output = await manager.executePythonScriptInEnv(envPath, validateScript);
    return JSON.parse(output);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}