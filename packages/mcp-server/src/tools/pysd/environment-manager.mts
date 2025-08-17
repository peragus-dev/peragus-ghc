import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

/**
 * Interface for managing Python environments from Node.js
 */
export interface IPythonEnvironmentManager {
  initializeEnvironment(envPath: string): Promise<void>;
  installPySDDependencies(envPath: string): Promise<void>;
  verifyPySDInstallation(envPath: string): Promise<boolean>;
  executePythonScriptInEnv(envPath: string, scriptContent: string): Promise<string>;
}

/**
 * Python Environment Manager for PySD integration
 */
export class PythonEnvironmentManager implements IPythonEnvironmentManager {
  private readonly pythonExecutable = "python3";
  private readonly venvModule = "venv";

  /**
   * Execute a command and return the result
   */
  private executeCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, { shell: true });
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
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        } else {
          resolve({ stdout, stderr });
        }
      });

      process.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Initialize a Python virtual environment at the specified path
   */
  async initializeEnvironment(envPath: string): Promise<void> {
    try {
      // Check if directory exists
      const exists = await fs.access(envPath).then(() => true).catch(() => false);
      if (exists) {
        console.log(`Environment already exists at ${envPath}`);
        return;
      }

      // Create virtual environment
      await this.executeCommand(this.pythonExecutable, ["-m", this.venvModule, envPath]);
      console.log(`✅ Python virtual environment created at ${envPath}`);

      // Verify Python version
      const pythonPath = path.join(envPath, "bin", "python");
      const { stdout } = await this.executeCommand(pythonPath, ["--version"]);
      
      const versionMatch = stdout.match(/Python (\d+\.\d+\.\d+)/);
      if (versionMatch) {
        const [major, minor] = versionMatch[1].split(".").map(Number);
        if (major < 3 || (major === 3 && minor < 8)) {
          throw new Error(`Python version ${versionMatch[1]} is below required 3.8+`);
        }
        console.log(`✅ Python version: ${versionMatch[1]}`);
      }
    } catch (error) {
      throw new Error(`Failed to initialize environment: ${error}`);
    }
  }

  /**
   * Install PySD and its dependencies in the virtual environment
   */
  async installPySDDependencies(envPath: string): Promise<void> {
    try {
      const pipPath = path.join(envPath, "bin", "pip");
      
      // Upgrade pip first
      await this.executeCommand(pipPath, ["install", "--upgrade", "pip"]);
      
      // Create requirements content
      const requirements = `pysd==3.14.0
pandas==2.2.2
numpy==1.26.4
xarray==2024.6.0
scipy==1.13.1
matplotlib==3.9.0`;

      // Write requirements file
      const reqPath = path.join(envPath, "requirements.txt");
      await fs.writeFile(reqPath, requirements);
      
      // Install dependencies
      const { stdout } = await this.executeCommand(pipPath, ["install", "-r", reqPath]);
      console.log(`✅ PySD dependencies installed successfully`);
      
      // Clean up requirements file
      await fs.unlink(reqPath).catch(() => {});
    } catch (error) {
      throw new Error(`Failed to install PySD dependencies: ${error}`);
    }
  }

  /**
   * Verify if PySD is importable within the environment
   */
  async verifyPySDInstallation(envPath: string): Promise<boolean> {
    try {
      const pythonPath = path.join(envPath, "bin", "python");
      const verificationScript = `
import sys
try:
    import pysd
    import pandas
    import numpy
    import xarray
    print("SUCCESS")
    sys.exit(0)
except ImportError as e:
    print(f"FAILED: {e}")
    sys.exit(1)
`;
      
      const { stdout } = await this.executeCommand(pythonPath, ["-c", verificationScript]);
      return stdout.includes("SUCCESS");
    } catch (error) {
      console.error(`PySD verification failed: ${error}`);
      return false;
    }
  }

  /**
   * Execute a Python script in the virtual environment
   */
  async executePythonScriptInEnv(envPath: string, scriptContent: string): Promise<string> {
    try {
      const pythonPath = path.join(envPath, "bin", "python");
      
      // Create temporary script file
      const tempScriptPath = path.join(envPath, `temp_script_${Date.now()}.py`);
      await fs.writeFile(tempScriptPath, scriptContent);
      
      try {
        const { stdout } = await this.executeCommand(pythonPath, [tempScriptPath]);
        return stdout;
      } finally {
        // Clean up temp file
        await fs.unlink(tempScriptPath).catch(() => {});
      }
    } catch (error) {
      throw new Error(`Failed to execute Python script: ${error}`);
    }
  }
}

// Export default instance
export default new PythonEnvironmentManager();