import { SimulationResults } from "./simulation-runner.mjs";

/**
 * Schema definition for simulation results
 */
export interface ResultSchema {
  requiredFields: string[];
  variableTypes: { [key: string]: 'number' | 'string' | 'boolean' | 'array' };
  minTimesteps?: number;
  maxTimesteps?: number;
  requiredVariables?: string[];
}

/**
 * Validation result with detailed error information
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Type-safe simulation results with strict typing
 */
export interface TypedSimulationResults extends SimulationResults {
  data: {
    Time: number[];
    [variableName: string]: number[];
  };
  columns: string[];
  index: number[];
  validated: boolean;
}

/**
 * Interface for schema validation
 */
export interface ISchemaValidator {
  validateSchema(results: SimulationResults, schema: ResultSchema): ValidationResult;
  ensureTypeSafety(results: any): TypedSimulationResults;
}

/**
 * Schema validation and type safety implementation
 */
export class SchemaValidator implements ISchemaValidator {
  /**
   * Default schema for PySD simulation results
   */
  private readonly defaultSchema: ResultSchema = {
    requiredFields: ['success', 'data'],
    variableTypes: {
      success: 'boolean',
      data: 'array',
      columns: 'array',
      index: 'array',
      error: 'string',
      executionTime: 'number'
    },
    minTimesteps: 1
  };

  /**
   * Validates simulation results against expected schema
   */
  validateSchema(results: SimulationResults, schema?: ResultSchema): ValidationResult {
    const validation: ValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    };

    const schemaToUse = schema || this.defaultSchema;

    // Check required fields
    for (const field of schemaToUse.requiredFields) {
      if (!(field in results)) {
        validation.errors.push(`Missing required field: ${field}`);
        validation.valid = false;
      }
    }

    // Validate success flag
    if (typeof results.success !== 'boolean') {
      validation.errors.push(`Field 'success' must be boolean, got ${typeof results.success}`);
      validation.valid = false;
    }

    // If not successful, validate error message exists
    if (!results.success && !results.error) {
      validation.warnings.push("Unsuccessful result without error message");
    }

    // Validate data structure if successful
    if (results.success && results.data) {
      // Check if data is an object
      if (typeof results.data !== 'object' || results.data === null) {
        validation.errors.push(`Field 'data' must be an object, got ${typeof results.data}`);
        validation.valid = false;
      } else {
        // Validate Time array exists
        if (!results.data['Time'] && !results.index) {
          validation.errors.push("No time information found (neither 'Time' in data nor 'index')");
          validation.valid = false;
        }

        // Check minimum timesteps
        const timeArray = results.data['Time'] || results.index || [];
        if (schemaToUse.minTimesteps && timeArray.length < schemaToUse.minTimesteps) {
          validation.errors.push(`Insufficient timesteps: ${timeArray.length} < ${schemaToUse.minTimesteps}`);
          validation.valid = false;
        }

        // Check maximum timesteps
        if (schemaToUse.maxTimesteps && timeArray.length > schemaToUse.maxTimesteps) {
          validation.warnings.push(`Too many timesteps: ${timeArray.length} > ${schemaToUse.maxTimesteps}`);
        }

        // Validate required variables
        if (schemaToUse.requiredVariables) {
          for (const varName of schemaToUse.requiredVariables) {
            if (!results.data[varName]) {
              validation.errors.push(`Missing required variable: ${varName}`);
              validation.valid = false;
            }
          }
        }

        // Validate all arrays have same length
        const lengths = new Set<number>();
        for (const [, value] of Object.entries(results.data)) {
          if (Array.isArray(value)) {
            lengths.add(value.length);
          }
        }
        if (lengths.size > 1) {
          validation.errors.push(`Inconsistent array lengths in data: ${Array.from(lengths).join(', ')}`);
          validation.valid = false;
        }
      }
    }

    // Validate columns match data keys
    if (results.columns && results.data) {
      const dataKeys = Object.keys(results.data);
      const missingInColumns = dataKeys.filter(k => !results.columns!.includes(k));
      const missingInData = results.columns.filter(c => !dataKeys.includes(c));
      
      if (missingInColumns.length > 0) {
        validation.warnings.push(`Data keys not in columns: ${missingInColumns.join(', ')}`);
      }
      if (missingInData.length > 0) {
        validation.warnings.push(`Columns not in data: ${missingInData.join(', ')}`);
      }
    }

    return validation;
  }

  /**
   * Ensures type-safe conversion to TypeScript interfaces
   */
  ensureTypeSafety(results: any): TypedSimulationResults {
    // Validate basic structure
    if (!results || typeof results !== 'object') {
      throw new Error("Invalid results object");
    }

    // Ensure success is boolean
    const success = Boolean(results.success);

    // Initialize typed result
    const typed: TypedSimulationResults = {
      success,
      data: { Time: [] },
      columns: [],
      index: [],
      validated: true,
      executionTime: typeof results.executionTime === 'number' ? results.executionTime : undefined,
      format: typeof results.format === 'string' ? results.format : 'json',
      shape: Array.isArray(results.shape) ? results.shape : undefined
    };

    // Handle error case
    if (!success) {
      typed.error = String(results.error || "Unknown error");
      return typed;
    }

    // Process data
    if (results.data && typeof results.data === 'object') {
      // Ensure all values are arrays of numbers
      for (const [key, value] of Object.entries(results.data)) {
        if (Array.isArray(value)) {
          // Convert all values to numbers, filtering out non-numeric
          const numericArray = value.map(v => {
            const num = Number(v);
            return isNaN(num) ? 0 : num;
          });
          typed.data[key] = numericArray;
        } else if (typeof value === 'number') {
          // Single value, wrap in array
          typed.data[key] = [value];
        }
      }
    }

    // Process columns
    if (Array.isArray(results.columns)) {
      typed.columns = results.columns.map((c: any) => String(c));
    } else if (typed.data) {
      typed.columns = Object.keys(typed.data);
    }

    // Process index
    if (Array.isArray(results.index)) {
      typed.index = results.index.map((i: any) => Number(i));
    } else if (typed.data['Time']) {
      typed.index = typed.data['Time'];
    }

    // Validate the typed result
    const validation = this.validateSchema(typed);
    if (!validation.valid) {
      throw new Error(`Type conversion resulted in invalid schema: ${validation.errors.join(', ')}`);
    }

    return typed;
  }

  /**
   * Create a schema from example results
   */
  deriveSchema(results: SimulationResults): ResultSchema {
    const schema: ResultSchema = {
      requiredFields: ['success', 'data'],
      variableTypes: {},
      requiredVariables: []
    };

    if (results.data) {
      const timeArray = results.data['Time'] || results.index || [];
      schema.minTimesteps = timeArray.length;
      
      for (const key of Object.keys(results.data)) {
        if (key !== 'Time') {
          schema.requiredVariables!.push(key);
        }
      }
    }

    return schema;
  }
}

export default new SchemaValidator();