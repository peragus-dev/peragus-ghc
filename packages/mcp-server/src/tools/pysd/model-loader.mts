import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

/**
 * Interface for PySD Model Loading
 */
export interface IPySDModelLoader {
  loadModel(modelPath: string, envPath: string): Promise<ModelInfo>;
  validateModelPath(modelPath: string): Promise<boolean>;
}

/**
 * Model information returned after loading
 */
export interface ModelInfo {
  modelPath: string;
  modelType: 'vensim' | 'xmile' | 'python';
  components?: string[];
  documentation?: any;
  success: boolean;
  error?: string;
}

/**
 * PySD Model Loader implementation
 */
export class PySDModelLoader implements IPySDModelLoader {
  /**
   * Load a PySD model from file
   */
  async loadModel(modelPath: string, envPath: string): Promise<ModelInfo> {
    try {
      // Validate model path exists
      const exists = await this.validateModelPath(modelPath);
      if (!exists) {
        return {
          modelPath,
          modelType: 'vensim',
          success: false,
          error: `Model file not found: ${modelPath}`
        };
      }

      // Determine model type from extension
      const ext = path.extname(modelPath).toLowerCase();
      let modelType: 'vensim' | 'xmile' | 'python';
      
      if (ext === '.mdl') {
        modelType = 'vensim';
      } else if (ext === '.xmile' || ext === '.xml') {
        modelType = 'xmile';
      } else if (ext === '.py') {
        modelType = 'python';
      } else {
        return {
          modelPath,
          modelType: 'vensim',
          success: false,
          error: `Unsupported model format: ${ext}`
        };
      }

      // Python script to load and validate model
      const loadScript = `
import json
import sys
import os

model_path = "${modelPath}"
model_type = "${modelType}"

try:
    import pysd
    
    # Load model based on type
    if model_type == 'vensim':
        model = pysd.read_vensim(model_path)
    elif model_type == 'xmile':
        model = pysd.read_xmile(model_path)
    else:
        # Python model - import as module
        import importlib.util
        spec = importlib.util.spec_from_file_location("model", model_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model = module.model if hasattr(module, 'model') else None
        
        if model is None:
            raise Exception("Python model file must export a 'model' object")
    
    # Get model information
    info = {
        "success": True,
        "modelPath": model_path,
        "modelType": model_type,
        "components": list(model.components._namespace.keys()) if hasattr(model, 'components') else [],
        "documentation": model.doc() if hasattr(model, 'doc') else {}
    }
    
    print(json.dumps(info))
    
except FileNotFoundError as e:
    print(json.dumps({
        "success": False,
        "error": f"Model file not found: {str(e)}"
    }))
    sys.exit(1)
    
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Import error: {str(e)}"
    }))
    sys.exit(1)
    
except Exception as e:
    print(json.dumps({
        "success": False,
        "error": f"Failed to load model: {str(e)}"
    }))
    sys.exit(1)
`;

      // Execute Python script
      const pythonPath = path.join(envPath, "bin", "python");
      const result = await this.executePythonScript(pythonPath, loadScript);
      
      const modelInfo = JSON.parse(result) as ModelInfo;
      return modelInfo;
      
    } catch (error) {
      return {
        modelPath,
        modelType: 'vensim',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate that a model file exists
   */
  async validateModelPath(modelPath: string): Promise<boolean> {
    try {
      await fs.access(modelPath);
      return true;
    } catch {
      return false;
    }
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
          reject(new Error(`Python script failed: ${stderr}`));
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

export default new PySDModelLoader();