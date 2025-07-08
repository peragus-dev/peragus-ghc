import type { CodeCellType } from '../types/index.mjs';
import type { ExecutionResult, ExecutionOptions } from './types.mjs';
import { node, tsx } from './spawner.mjs';
import { promises as fs } from 'node:fs';
import Path from 'node:path';

export class NotebookExecutionEngine {
  
  async executeCell(
    cell: CodeCellType, 
    options: ExecutionOptions
  ): Promise<ExecutionResult> {
    const { cwd, env = {}, timeout = 30000 } = options;
    
    // Write cell content to temporary file
    const tempFile = Path.join(cwd, 'src', cell.filename);
    await fs.writeFile(tempFile, cell.source, 'utf8');
    
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | null = null;
      
      const executor = cell.filename.endsWith('.ts') ? tsx : node;
      
      const child = executor({
        cwd,
        env,
        entry: tempFile,
        stdout: (data) => { stdout += data.toString(); },
        stderr: (data) => { stderr += data.toString(); },
        onExit: (code, signal) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          resolve({ exitCode: code, signal, stdout, stderr });
        },
        onError: (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          resolve({ 
            exitCode: -1, 
            signal: null, 
            stdout, 
            stderr: stderr + err.message 
          });
        }
      });
      
      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          child.kill('SIGTERM');
          resolve({
            exitCode: -1,
            signal: 'SIGTERM',
            stdout,
            stderr: stderr + 'Execution timed out'
          });
        }, timeout);
      }
    });
  }
  
  async executeCellSequence(
    cells: CodeCellType[], 
    options: ExecutionOptions
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    
    for (const cell of cells) {
      const result = await this.executeCell(cell, options);
      results.push(result);
      
      // Stop execution on error if desired
      if (result.exitCode !== 0) {
        break;
      }
    }
    
    return results;
  }
}