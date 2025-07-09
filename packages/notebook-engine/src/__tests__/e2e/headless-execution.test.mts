import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NotebookAPI } from '../../api.mjs';
import { NotebookCommandHandler } from '../../communication/command-handler.mjs';
import { RestApiAdapter } from '../../communication/rest-adapter.mjs';
import { NotebookLifecycleManager } from '../../lifecycle/manager.mjs';
import { MemoryChannel } from '../../communication/channels.mjs';
import { NotebookProtocol } from '../../communication/protocol.mjs';
import type { SessionType, CodeCellType, NotebookCommand } from '../../types/index.mjs';

describe('End-to-End Headless Execution', () => {
  let api: NotebookAPI;
  let commandHandler: NotebookCommandHandler;
  let restAdapter: RestApiAdapter;
  let lifecycleManager: NotebookLifecycleManager;
  let protocol: NotebookProtocol;
  let memoryChannel: MemoryChannel;

  beforeAll(async () => {
    api = new NotebookAPI();
    commandHandler = new NotebookCommandHandler();
    restAdapter = new RestApiAdapter({
      baseUrl: 'http://localhost:3000',
      timeout: 30000
    });
    lifecycleManager = new NotebookLifecycleManager({
      autoSave: false,
      maxIdleTime: 120000
    });

    // Set up in-memory communication channel for testing
    memoryChannel = new MemoryChannel();
    protocol = new NotebookProtocol(memoryChannel);
  });

  afterAll(async () => {
    protocol.close();
  });

  describe('Complete Notebook Workflow', () => {
    it('should execute a complete notebook workflow headlessly', async () => {
      // Step 1: Create notebook session through lifecycle manager
      const sessionId = await lifecycleManager.createNotebook({
        language: 'typescript',
        tsconfig: {
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            strict: true
          }
        },
        cells: []
      });

      // Step 2: Add cells through REST API adapter
      const cells: CodeCellType[] = [
        {
          id: 'setup-cell',
          type: 'code',
          language: 'typescript',
          text: `
            // Setup phase
            interface User {
              name: string;
              age: number;
            }
            
            const users: User[] = [
              { name: 'Alice', age: 30 },
              { name: 'Bob', age: 25 },
              { name: 'Charlie', age: 35 }
            ];
            
            console.log('Setup complete:', users.length, 'users loaded');
          `,
          filename: 'setup.ts'
        },
        {
          id: 'process-cell',
          type: 'code',
          language: 'typescript',
          text: `
            // Processing phase
            const averageAge = users.reduce((sum, user) => sum + user.age, 0) / users.length;
            const adults = users.filter(user => user.age >= 18);
            
            console.log('Average age:', averageAge);
            console.log('Adult users:', adults.length);
          `,
          filename: 'process.ts'
        },
        {
          id: 'output-cell',
          type: 'code',
          language: 'typescript',
          text: `
            // Output phase
            const report = {
              totalUsers: users.length,
              averageAge: Math.round(averageAge * 100) / 100,
              adultCount: adults.length,
              names: users.map(u => u.name)
            };
            
            console.log('Final Report:', JSON.stringify(report, null, 2));
          `,
          filename: 'output.ts'
        }
      ];

      // Add cells sequentially
      for (const cell of cells) {
        await restAdapter.createCell(sessionId, cell, -1);
      }

      // Step 3: Execute all cells and capture results
      const executionResults = [];
      for (const cell of cells) {
        const result = await restAdapter.executeCell(sessionId, cell.id);
        executionResults.push(result);
      }

      // Step 4: Verify execution results
      expect(executionResults).toHaveLength(3);
      
      // Setup cell should complete successfully
      expect(executionResults[0].exitCode).toBe(0);
      expect(executionResults[0].stdout).toContain('Setup complete: 3 users loaded');

      // Process cell should compute averages
      expect(executionResults[1].exitCode).toBe(0);
      expect(executionResults[1].stdout).toContain('Average age: 30');
      expect(executionResults[1].stdout).toContain('Adult users: 3');

      // Output cell should generate final report
      expect(executionResults[2].exitCode).toBe(0);
      expect(executionResults[2].stdout).toContain('Final Report:');
      expect(executionResults[2].stdout).toContain('"totalUsers": 3');
      expect(executionResults[2].stdout).toContain('"averageAge": 30');

      // Step 5: Test session state consistency
      const session = api.getSession(sessionId);
      expect(session.cells).toHaveLength(3);
      expect(session.language).toBe('typescript');

      // Step 6: Clean up
      await lifecycleManager.terminateNotebook(sessionId);
    });

    it('should handle complex TypeScript features in headless mode', async () => {
      const sessionId = await lifecycleManager.createNotebook({
        language: 'typescript',
        tsconfig: {
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            strict: true,
            experimentalDecorators: true
          }
        },
        cells: []
      });

      const complexCell: CodeCellType = {
        id: 'complex-cell',
        type: 'code',
        language: 'typescript',
        text: `
          // Test generics, async/await, and type inference
          async function fetchData<T>(data: T[]): Promise<T[]> {
            return new Promise(resolve => {
              setTimeout(() => resolve(data), 10);
            });
          }
          
          interface ApiResponse<T> {
            data: T;
            status: 'success' | 'error';
            timestamp: number;
          }
          
          async function processApiData() {
            const numbers = [1, 2, 3, 4, 5];
            const fetchedData = await fetchData(numbers);
            
            const response: ApiResponse<number[]> = {
              data: fetchedData,
              status: 'success',
              timestamp: Date.now()
            };
            
            const doubled = response.data.map(x => x * 2);
            console.log('Processed data:', doubled);
            return doubled;
          }
          
          processApiData().then(result => {
            console.log('Final result:', result);
          });
        `,
        filename: 'complex.ts'
      };

      await restAdapter.createCell(sessionId, complexCell, -1);
      const result = await restAdapter.executeCell(sessionId, complexCell.id);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Processed data: [ 2, 4, 6, 8, 10 ]');
      expect(result.stdout).toContain('Final result: [ 2, 4, 6, 8, 10 ]');

      await lifecycleManager.terminateNotebook(sessionId);
    });
  });

  describe('Protocol Communication Testing', () => {
    it('should handle command/response protocol through memory channel', async () => {
      // Set up command handler to process messages from memory channel
      memoryChannel.onMessage(async (message) => {
        if (message.type === 'command') {
          const command = message.payload as NotebookCommand;
          const response = await commandHandler.handleCommand(command);
          
          memoryChannel.send({
            id: message.id,
            type: 'response',
            payload: response,
            timestamp: Date.now()
          });
        }
      });

      // Create session through API
      const sessionData: Omit<SessionType, 'id'> = {
        language: 'typescript',
        tsconfig: {},
        cells: []
      };
      const session = api.createSession(sessionData);

      // Send execute command through protocol
      const executeCommand: NotebookCommand = {
        type: 'execute',
        sessionId: session.id,
        cellId: 'test-cell',
        payload: {
          timeout: 5000
        }
      };

      // Add test cell first
      api.addCell(session.id, {
        id: 'test-cell',
        type: 'code',
        language: 'typescript',
        text: 'console.log("Protocol test successful");',
        filename: 'protocol-test.ts'
      });

      const response = await protocol.sendCommand(executeCommand);

      expect(response.success).toBe(true);
      expect(response.data.exitCode).toBe(0);
      expect(response.data.stdout).toContain('Protocol test successful');
    });

    it('should handle command timeout scenarios', async () => {
      const longRunningCommand: NotebookCommand = {
        type: 'execute',
        sessionId: 'non-existent',
        cellId: 'timeout-cell',
        payload: {}
      };

      // This should timeout since no handler is set up for non-existent session
      await expect(
        protocol.sendCommand(longRunningCommand, 100) // 100ms timeout
      ).rejects.toThrow('Command timeout after 100ms');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from cell execution failures', async () => {
      const sessionId = await lifecycleManager.createNotebook({
        language: 'typescript',
        tsconfig: {},
        cells: []
      });

      // Add a failing cell
      const failingCell: CodeCellType = {
        id: 'failing-cell',
        type: 'code',
        language: 'typescript',
        text: 'throw new Error("Intentional test error");',
        filename: 'failing.ts'
      };

      // Add a recovery cell
      const recoveryCell: CodeCellType = {
        id: 'recovery-cell',
        type: 'code',
        language: 'typescript',
        text: 'console.log("Recovery successful after error");',
        filename: 'recovery.ts'
      };

      await restAdapter.createCell(sessionId, failingCell, -1);
      await restAdapter.createCell(sessionId, recoveryCell, -1);

      // Execute failing cell
      const failResult = await restAdapter.executeCell(sessionId, failingCell.id);
      expect(failResult.exitCode).not.toBe(0);

      // Execute recovery cell - should still work
      const recoveryResult = await restAdapter.executeCell(sessionId, recoveryCell.id);
      expect(recoveryResult.exitCode).toBe(0);
      expect(recoveryResult.stdout).toContain('Recovery successful after error');

      await lifecycleManager.terminateNotebook(sessionId);
    });

    it('should maintain session state through lifecycle transitions', async () => {
      const sessionId = await lifecycleManager.createNotebook({
        language: 'typescript',
        tsconfig: {},
        cells: []
      });

      // Add some cells
      const testCells = [
        { id: 'cell-1', text: 'const x = 1;' },
        { id: 'cell-2', text: 'const y = 2;' },
        { id: 'cell-3', text: 'console.log(x + y);' }
      ];

      for (const cellData of testCells) {
        const cell: CodeCellType = {
          id: cellData.id,
          type: 'code',
          language: 'typescript',
          text: cellData.text,
          filename: `${cellData.id}.ts`
        };
        await restAdapter.createCell(sessionId, cell, -1);
      }

      // Verify initial state
      let session = api.getSession(sessionId);
      expect(session.cells).toHaveLength(3);

      // Suspend notebook
      await lifecycleManager.suspendNotebook(sessionId);
      
      // Session should still exist
      session = api.getSession(sessionId);
      expect(session.cells).toHaveLength(3);

      // Resume notebook
      await lifecycleManager.resumeNotebook(sessionId);

      // Verify state is preserved
      session = api.getSession(sessionId);
      expect(session.cells).toHaveLength(3);
      expect(session.cells.map(c => c.id)).toEqual(['cell-1', 'cell-2', 'cell-3']);

      await lifecycleManager.terminateNotebook(sessionId);
    });
  });
});