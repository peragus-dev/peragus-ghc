import type { SessionType as BaseSessionType } from '@srcbook/notebook-engine';

// Extended session type for MCP server with additional metadata
export interface MCPSessionType extends BaseSessionType {
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  status?: 'active' | 'suspended';
  tsconfig?: any;
}

// Re-export cell types for convenience
export type { CellType, CodeCellType, MarkdownCellType } from '@srcbook/shared';
export type { CodeLanguageType } from '@srcbook/shared';