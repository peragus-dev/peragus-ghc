export interface SessionType {
  id: string;
  dir: string;
  cells: CellType[];
  language: 'javascript' | 'typescript';
  openedAt: number;
  'tsconfig.json'?: any;
}

export interface CellType {
  id: string;
  type: 'title' | 'markdown' | 'code' | 'package.json';
}

export interface TitleCellType extends CellType {
  type: 'title';
  text: string;
}

export interface MarkdownCellType extends CellType {
  type: 'markdown';
  text: string;
}

export interface CodeCellType extends CellType {
  type: 'code';
  source: string;
  filename: string;
}

export interface PackageJsonCellType extends CellType {
  type: 'package.json';
  source: string;
}

export interface CellErrorType {
  message: string;
  attribute?: string;
}

export type UpdateResultType =
  | { success: true; cell: CellType }
  | { success: false; errors: CellErrorType[] };

// Re-export communication types for convenience
export type { NotebookCommand, NotebookResponse, NotebookEvent } from '../communication/types.mjs';