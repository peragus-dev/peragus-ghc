import type { SessionType, CellType } from '../types/index.mjs';

export interface NotebookFormat {
  version: string;
  language: 'javascript' | 'typescript';
  cells: CellType[];
  metadata?: Record<string, any>;
}

export class NotebookSerializer {
  
  static serialize(session: SessionType): NotebookFormat {
    return {
      version: '1.0',
      language: session.language,
      cells: session.cells,
      metadata: {
        id: session.id,
        openedAt: session.openedAt,
        ...(session.language === 'typescript' && { 'tsconfig.json': session['tsconfig.json'] })
      }
    };
  }

  static deserialize(format: NotebookFormat, dir: string): Omit<SessionType, 'id'> {
    return {
      dir,
      cells: format.cells,
      language: format.language,
      openedAt: Date.now(),
      ...(format.language === 'typescript' && format.metadata?.['tsconfig.json'] && {
        'tsconfig.json': format.metadata['tsconfig.json']
      })
    };
  }

  static toJSON(session: SessionType): string {
    return JSON.stringify(this.serialize(session), null, 2);
  }

  static fromJSON(json: string, dir: string): Omit<SessionType, 'id'> {
    const format = JSON.parse(json) as NotebookFormat;
    return this.deserialize(format, dir);
  }

  static toMarkdown(session: SessionType): string {
    let markdown = `# ${session.id}\n\n`;
    
    if (session.language === 'typescript') {
      markdown += `Language: TypeScript\n\n`;
    } else {
      markdown += `Language: JavaScript\n\n`;
    }

    for (const cell of session.cells) {
      switch (cell.type) {
        case 'title':
          markdown += `# ${(cell as any).text}\n\n`;
          break;
        case 'markdown':
          markdown += `${(cell as any).text}\n\n`;
          break;
        case 'code':
          const lang = session.language === 'typescript' ? 'typescript' : 'javascript';
          markdown += `\`\`\`${lang}\n${(cell as any).source}\n\`\`\`\n\n`;
          break;
        case 'package.json':
          markdown += `\`\`\`json\n${(cell as any).source}\n\`\`\`\n\n`;
          break;
      }
    }

    return markdown;
  }
}