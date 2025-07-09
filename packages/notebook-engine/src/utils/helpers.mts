import type { CellType, CodeCellType, MarkdownCellType } from '../types/index.mjs';

export function generateCellId(): string {
  return `cell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createCodeCell(source: string, filename: string): CodeCellType {
  return {
    id: generateCellId(),
    type: 'code',
    source,
    filename
  };
}

export function createMarkdownCell(text: string): MarkdownCellType {
  return {
    id: generateCellId(),
    type: 'markdown',
    text
  };
}

export function createTitleCell(text: string): CellType {
  return {
    id: generateCellId(),
    type: 'title',
    text
  } as any; // Type assertion needed due to the union type
}

export function createPackageJsonCell(source: string): CellType {
  return {
    id: generateCellId(),
    type: 'package.json',
    source
  } as any; // Type assertion needed due to the union type
}

export function filterCellsByType<T extends CellType['type']>(
  cells: CellType[], 
  type: T
): Extract<CellType, { type: T }>[] {
  return cells.filter(cell => cell.type === type) as Extract<CellType, { type: T }>[];
}

export function findCellIndex(cells: CellType[], cellId: string): number {
  return cells.findIndex(cell => cell.id === cellId);
}

export function reorderCells(cells: CellType[], fromIndex: number, toIndex: number): CellType[] {
  const newCells = [...cells];
  const [removed] = newCells.splice(fromIndex, 1);
  if (removed) {
    newCells.splice(toIndex, 0, removed);
  }
  return newCells;
}

export function getCellsByLanguage(cells: CellType[], language: 'javascript' | 'typescript'): CodeCellType[] {
  const codeCells = filterCellsByType(cells, 'code');
  const extensions = language === 'typescript' 
    ? ['.ts', '.tsx', '.mts'] 
    : ['.js', '.jsx', '.mjs'];
  
  return codeCells.filter(cell => 
    extensions.some(ext => (cell as any).filename.endsWith(ext))
  );
}

export function getCellExecutionOrder(cells: CellType[]): CodeCellType[] {
  // Return code cells in the order they appear in the notebook
  return filterCellsByType(cells, 'code');
}

export function estimateExecutionTime(cells: CodeCellType[]): number {
  // Simple heuristic: estimate based on source code length
  return cells.reduce((total, cell) => {
    const lines = cell.source.split('\n').length;
    return total + Math.max(1, Math.floor(lines / 10)); // ~100ms per 10 lines
  }, 0) * 100;
}