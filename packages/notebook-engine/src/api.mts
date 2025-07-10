import type { SessionType, CodeCellType, MarkdownCellType } from './types/index.mjs';
import { 
  findSessionByDirname, 
  findSession,
  addSession, 
  updateSessionInMemory, 
  removeSession 
} from './session/index.mjs';
import { NotebookExecutionEngine } from './execution/index.mjs';
import type { ExecutionResult, ExecutionOptions } from './execution/index.mjs';

export class NotebookAPI {
  private executionEngine: NotebookExecutionEngine;

  constructor() {
    this.executionEngine = new NotebookExecutionEngine();
  }

  // Session Management API
  createSession(sessionData: Omit<SessionType, 'id'>): SessionType {
    const session: SessionType = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...sessionData,
    };
    return addSession(session);
  }

  getSessionByPath(path: string): SessionType | undefined {
    return findSessionByDirname(path);
  }

  updateSession(sessionId: string, updates: Partial<SessionType>): SessionType {
    const existingSession = this.findSessionById(sessionId);
    if (!existingSession) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return updateSessionInMemory(existingSession, updates);
  }

  deleteSession(sessionId: string): void {
    removeSession(sessionId);
  }

  private findSessionById(sessionId: string): SessionType | undefined {
    try {
      return findSession(sessionId);
    } catch {
      return undefined;
    }
  }

  // Execution API
  async executeCell(
    sessionId: string, 
    cellId: string, 
    options?: Partial<ExecutionOptions>
  ): Promise<ExecutionResult> {
    const session = this.findSessionById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const cell = session.cells.find(c => c.id === cellId);
    if (!cell || cell.type !== 'code') {
      throw new Error(`Code cell ${cellId} not found in session ${sessionId}`);
    }

    const execOptions: ExecutionOptions = {
      cwd: session.dir,
      ...options,
    };

    return this.executionEngine.executeCell(cell as CodeCellType, execOptions);
  }

  async executeAllCells(
    sessionId: string, 
    options?: Partial<ExecutionOptions>
  ): Promise<ExecutionResult[]> {
    const session = this.findSessionById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const codeCells = session.cells.filter(c => c.type === 'code') as CodeCellType[];
    
    const execOptions: ExecutionOptions = {
      cwd: session.dir,
      ...options,
    };

    return this.executionEngine.executeCellSequence(codeCells, execOptions);
  }

  // Cell Management API
  addCell(sessionId: string, cell: MarkdownCellType | CodeCellType, index: number): SessionType {
    const session = this.findSessionById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const cells = [...session.cells];
    cells.splice(index, 0, cell);
    
    return this.updateSession(sessionId, { cells });
  }

  removeCell(sessionId: string, cellId: string): SessionType {
    const session = this.findSessionById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const cells = session.cells.filter(c => c.id !== cellId);
    return this.updateSession(sessionId, { cells });
  }

  updateCell(sessionId: string, cellId: string, updates: Partial<CodeCellType | MarkdownCellType>): SessionType {
    const session = this.findSessionById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const cells = session.cells.map(c => 
      c.id === cellId ? { ...c, ...updates } : c
    );
    
    return this.updateSession(sessionId, { cells });
  }
}