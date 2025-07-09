import type { SessionType, CellType } from '../types/index.mjs';

const sessions: Record<string, SessionType> = {};

export function findSessionByDirname(dirname: string): SessionType | undefined {
  return Object.values(sessions).find((session) => session.dir === dirname);
}

export function findSession(id: string): SessionType {
  if (!sessions[id]) {
    throw new Error(`Session with id ${id} not found`);
  }
  return sessions[id] as SessionType;
}

export function addSession(session: SessionType): SessionType {
  sessions[session.id] = session;
  return session;
}

export function updateSessionInMemory(session: SessionType, updates: Partial<SessionType>): SessionType {
  const id = session.id;
  const updatedSession = { ...session, ...updates };
  sessions[id] = updatedSession;
  return updatedSession;
}

export function removeSession(id: string): void {
  delete sessions[id];
}

export function removeSessionByDirname(dirName: string): void {
  const session = findSessionByDirname(dirName);
  if (session) {
    delete sessions[session.id];
  }
}

export function listAllSessions(): Record<string, SessionType> {
  return { ...sessions };
}

export function findCell(session: SessionType, id: string): CellType | undefined {
  return session.cells.find((cell) => cell.id === id);
}

export function replaceCell(session: SessionType, cell: CellType): CellType[] {
  return session.cells.map((c) => (c.id === cell.id ? cell : c));
}

export function insertCellAt(session: SessionType, cell: CellType, index: number): CellType[] {
  const cells = [...session.cells];
  cells.splice(index, 0, cell);
  return cells;
}

export function removeCell(session: SessionType, id: string): CellType[] {
  return session.cells.filter((cell) => cell.id !== id);
}

export function sessionToResponse(session: SessionType) {
  const result: Pick<SessionType, 'id' | 'cells' | 'language' | 'tsconfig.json' | 'openedAt'> = {
    id: session.id,
    cells: session.cells,
    language: session.language,
    openedAt: session.openedAt,
  };

  if (session.language === 'typescript') {
    result['tsconfig.json'] = session['tsconfig.json'];
  }

  return result;
}