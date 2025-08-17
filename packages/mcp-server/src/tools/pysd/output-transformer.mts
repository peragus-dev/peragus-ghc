import { SimulationResults } from "./simulation-runner.mjs";
import { Readable } from "stream";

/**
 * Configuration for pivot operations
 */
export interface PivotConfig {
  index?: string;
  columns?: string[];
  values?: string[];
  aggFunc?: 'mean' | 'sum' | 'min' | 'max' | 'count';
}

/**
 * Pivoted results structure
 */
export interface PivotedResults {
  data: any[][];
  index: string[];
  columns: string[];
}

/**
 * Excel export options
 */
export interface ExcelExportOptions {
  sheetName?: string;
  includeMetadata?: boolean;
  splitVariables?: boolean; // Each variable in separate sheet
  formatting?: boolean;
}

/**
 * Interface for output transformation and export
 */
export interface IOutputTransformer {
  pivot(results: SimulationResults, pivotConfig: PivotConfig): PivotedResults;
  exportToExcel(results: SimulationResults, options?: ExcelExportOptions): Buffer;
  exportToParquet(results: SimulationResults): Buffer;
  createStream(results: SimulationResults): Readable;
  exportToJSON(results: SimulationResults, pretty?: boolean): string;
  exportToCSV(results: SimulationResults, delimiter?: string): string;
}

/**
 * Output transformation and export implementation
 */
export class OutputTransformer implements IOutputTransformer {
  /**
   * Pivots data for different consumption patterns
   */
  pivot(results: SimulationResults, config: PivotConfig): PivotedResults {
    if (!results.success || !results.data) {
      throw new Error("Invalid simulation results for pivoting");
    }

    const indexCol = config.index || 'Time';
    const valueCols = config.values || Object.keys(results.data).filter(k => k !== indexCol);
    
    // Create pivot structure
    const pivoted: PivotedResults = {
      data: [],
      index: results.data[indexCol] || [],
      columns: valueCols
    };

    // Build data matrix
    const numRows = pivoted.index.length;
    for (let i = 0; i < numRows; i++) {
      const row = [];
      for (const col of valueCols) {
        const value = results.data[col]?.[i] ?? null;
        row.push(value);
      }
      pivoted.data.push(row);
    }

    return pivoted;
  }

  /**
   * Exports results to Excel format
   * Note: This is a simplified implementation. In production, use a library like xlsx
   */
  exportToExcel(results: SimulationResults, _options?: ExcelExportOptions): Buffer {
    if (!results.success || !results.data) {
      throw new Error("Invalid simulation results for Excel export");
    }

    // For now, create a CSV representation that Excel can open
    // In production, use xlsx library for proper Excel format
    const csv = this.exportToCSV(results);
    return Buffer.from(csv, 'utf-8');
  }

  /**
   * Exports results to Parquet format
   * Note: This is a placeholder. In production, use parquet-wasm or similar
   */
  exportToParquet(results: SimulationResults): Buffer {
    if (!results.success || !results.data) {
      throw new Error("Invalid simulation results for Parquet export");
    }

    // For now, create a JSON representation
    // In production, use parquet-wasm for proper Parquet format
    const json = this.exportToJSON(results);
    return Buffer.from(json, 'utf-8');
  }

  /**
   * Creates a streaming interface for large result sets
   */
  createStream(results: SimulationResults): Readable {
    if (!results.success || !results.data) {
      throw new Error("Invalid simulation results for streaming");
    }

    const timeArray = results.data['Time'] || results.index || [];
    const variables = Object.keys(results.data).filter(k => k !== 'Time');
    let currentIndex = 0;

    const stream = new Readable({
      read() {
        if (currentIndex === 0) {
          // Send header
          const header = ['Time', ...variables].join(',') + '\n';
          this.push(header);
        }

        // Stream data in chunks
        const chunkSize = 100;
        let chunk = '';
        
        for (let i = 0; i < chunkSize && currentIndex < timeArray.length; i++, currentIndex++) {
          const row = [timeArray[currentIndex]];
          for (const varName of variables) {
            row.push(results.data[varName]?.[currentIndex] ?? '');
          }
          chunk += row.join(',') + '\n';
        }

        if (chunk) {
          this.push(chunk);
        } else {
          this.push(null); // End of stream
        }
      }
    });

    return stream;
  }

  /**
   * Exports results to formatted JSON
   */
  exportToJSON(results: SimulationResults, pretty = false): string {
    if (!results.success) {
      return JSON.stringify({ error: results.error }, null, pretty ? 2 : 0);
    }

    const output = {
      metadata: {
        success: results.success,
        executionTime: results.executionTime,
        format: results.format,
        shape: results.shape
      },
      data: results.data,
      columns: results.columns,
      index: results.index
    };

    return JSON.stringify(output, null, pretty ? 2 : 0);
  }

  /**
   * Exports results to CSV format
   */
  exportToCSV(results: SimulationResults, delimiter = ','): string {
    if (!results.success || !results.data) {
      throw new Error("Invalid simulation results for CSV export");
    }

    const lines: string[] = [];
    
    // Get columns
    const columns = results.columns || Object.keys(results.data);
    lines.push(columns.join(delimiter));

    // Get number of rows
    const numRows = results.index?.length || 
                    results.data['Time']?.length || 
                    Math.max(...Object.values(results.data).map(v => Array.isArray(v) ? v.length : 0));

    // Build rows
    for (let i = 0; i < numRows; i++) {
      const row = columns.map(col => {
        const value = results.data[col]?.[i];
        // Handle special values
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(delimiter)) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      });
      lines.push(row.join(delimiter));
    }

    return lines.join('\n');
  }

  /**
   * Convert results to HTML table (for reporting)
   */
  exportToHTML(results: SimulationResults, maxRows = 100): string {
    if (!results.success || !results.data) {
      return '<p>No data available</p>';
    }

    const columns = results.columns || Object.keys(results.data);
    const numRows = Math.min(
      maxRows,
      results.index?.length || results.data['Time']?.length || 0
    );

    let html = '<table border="1">\n';
    
    // Header
    html += '<thead><tr>';
    for (const col of columns) {
      html += `<th>${col}</th>`;
    }
    html += '</tr></thead>\n';

    // Body
    html += '<tbody>\n';
    for (let i = 0; i < numRows; i++) {
      html += '<tr>';
      for (const col of columns) {
        const value = results.data[col]?.[i] ?? '';
        html += `<td>${value}</td>`;
      }
      html += '</tr>\n';
    }
    html += '</tbody>\n</table>';

    if (numRows < (results.index?.length || 0)) {
      html += `<p>Showing ${numRows} of ${results.index?.length} rows</p>`;
    }

    return html;
  }
}

export default new OutputTransformer();