import type { SessionType, CellType } from '../types/index.mjs';

export function validateSessionStructure(session: SessionType): string[] {
  const errors: string[] = [];

  if (!session.id || typeof session.id !== 'string') {
    errors.push('Session must have a valid string id');
  }

  if (!session.dir || typeof session.dir !== 'string') {
    errors.push('Session must have a valid directory path');
  }

  if (!Array.isArray(session.cells)) {
    errors.push('Session must have a cells array');
  }

  if (!['javascript', 'typescript'].includes(session.language)) {
    errors.push('Session language must be either javascript or typescript');
  }

  if (typeof session.openedAt !== 'number') {
    errors.push('Session must have a valid openedAt timestamp');
  }

  return errors;
}

export function validateCell(cell: CellType): string[] {
  const errors: string[] = [];

  if (!cell.id || typeof cell.id !== 'string') {
    errors.push('Cell must have a valid string id');
  }

  if (!['title', 'markdown', 'code', 'package.json'].includes(cell.type)) {
    errors.push('Cell must have a valid type');
  }

  switch (cell.type) {
    case 'title':
    case 'markdown':
      if (!('text' in cell) || typeof cell.text !== 'string') {
        errors.push(`${cell.type} cell must have text property`);
      }
      break;
    case 'code':
    case 'package.json':
      if (!('source' in cell) || typeof cell.source !== 'string') {
        errors.push(`${cell.type} cell must have source property`);
      }
      if (cell.type === 'code' && (!('filename' in cell) || typeof cell.filename !== 'string')) {
        errors.push('Code cell must have filename property');
      }
      break;
  }

  return errors;
}

export function validateCodeCellFilename(filename: string, language: 'javascript' | 'typescript'): string[] {
  const errors: string[] = [];

  if (!filename) {
    errors.push('Filename cannot be empty');
    return errors;
  }

  const validExtensions = language === 'typescript' 
    ? ['.ts', '.tsx', '.mts'] 
    : ['.js', '.jsx', '.mjs'];

  const hasValidExtension = validExtensions.some(ext => filename.endsWith(ext));
  
  if (!hasValidExtension) {
    errors.push(`Filename must have one of these extensions: ${validExtensions.join(', ')}`);
  }

  // Basic filename validation
  if (filename.includes('/') || filename.includes('\\')) {
    errors.push('Filename cannot contain path separators');
  }

  if (filename.startsWith('.') && filename !== filename.replace(/^\.+/, '')) {
    errors.push('Filename cannot start with dots');
  }

  return errors;
}