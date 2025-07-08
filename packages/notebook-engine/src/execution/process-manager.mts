import { ChildProcess } from 'node:child_process';

export class ProcessManager {
  private processes: Record<string, ChildProcess> = {};

  add(sessionId: string, cellId: string, process: ChildProcess): void {
    const key = this.toKey(sessionId, cellId);

    if (typeof process.pid !== 'number') {
      throw new Error('Cannot add a process with no pid');
    }

    if (process.killed) {
      throw new Error('Cannot add a process that has been killed');
    }

    this.processes[key] = process;

    process.on('exit', () => {
      delete this.processes[key];
    });
  }

  kill(sessionId: string, cellId: string): boolean {
    const key = this.toKey(sessionId, cellId);
    const process = this.processes[key];

    if (!process) {
      throw new Error(
        `Cannot kill process: no process for session ${sessionId} and cell ${cellId} exists`,
      );
    }

    if (process.killed) {
      throw new Error(
        `Cannot kill process for session ${sessionId} and cell ${cellId}: process has already been killed`,
      );
    }

    return process.kill('SIGTERM');
  }

  killAll(sessionId: string): void {
    const sessionPrefix = sessionId + ':';
    const keysToKill = Object.keys(this.processes).filter(key => 
      key.startsWith(sessionPrefix)
    );

    for (const key of keysToKill) {
      const process = this.processes[key];
      if (process && !process.killed) {
        process.kill('SIGTERM');
      }
    }
  }

  getRunningProcesses(sessionId?: string): string[] {
    if (sessionId) {
      const sessionPrefix = sessionId + ':';
      return Object.keys(this.processes).filter(key => 
        key.startsWith(sessionPrefix)
      );
    }
    return Object.keys(this.processes);
  }

  isRunning(sessionId: string, cellId: string): boolean {
    const key = this.toKey(sessionId, cellId);
    const process = this.processes[key];
    return process && !process.killed || false;
  }

  private toKey(sessionId: string, cellId: string): string {
    return sessionId + ':' + cellId;
  }
}