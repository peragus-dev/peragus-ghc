import type { 
  SessionType, 
  CellType, 
  UpdateResultType, 
  CellErrorType,
  MarkdownCellType,
  CodeCellType
} from '../types/index.mjs';
import { replaceCell, insertCellAt } from './state.mjs';

export async function updateCellWithRollback<T extends CellType>(
  session: SessionType,
  oldCell: T,
  updates: Partial<T>,
  onUpdate: (session: SessionType, cell: CellType) => Promise<CellErrorType[] | void>,
): Promise<UpdateResultType> {
  const updatedCell = { ...oldCell, ...updates };
  const cells = replaceCell(session, updatedCell);
  session.cells = cells;

  const errors = await onUpdate(session, updatedCell);

  if (errors && errors.length > 0) {
    // rollback
    const cells = replaceCell(session, oldCell);
    session.cells = cells;
    return { success: false, errors };
  } else {
    return { success: true, cell: updatedCell };
  }
}

export function addCellToSession(
  session: SessionType,
  cell: MarkdownCellType | CodeCellType,
  index: number,
): CellType[] {
  const cells = insertCellAt(session, cell, index);
  session.cells = cells;
  return cells;
}

export function validateCodeCellFilename(
  _session: SessionType,
  cell: CodeCellType,
  filename: string,
): CellErrorType[] {
  if (filename === cell.filename) {
    console.warn(
      `Attempted to update a cell's filename to its existing filename '${cell.filename}'. This is likely a bug in the code.`,
    );
    return [];
  }

  // Basic filename validation - more specific validation would need external dependencies
  if (!filename || filename.trim() === '') {
    return [{ message: `${filename} is not a valid filename`, attribute: 'filename' }];
  }

  return [];
}

export function exportSrcmdText(session: SessionType): any {
  return {
    cells: session.cells,
    language: session.language,
    'tsconfig.json': session['tsconfig.json'],
  };
}