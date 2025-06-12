import duckdb from 'duckdb';
import z from "zod";
import { ColumnMeta, SchemaState, TableState } from '../state-manager/StateManagerTypes.js';
import { DatabaseSafetyConfig, isSafeSQLQuery } from "../utils/safety.js";

export const DuckDBConfigSchema = z.object({
  file: z.string().optional(),
  readonly: z.boolean().optional(),
  type: z.literal('duckdb'),
  config: z.record(z.any()).optional(), // DuckDB config options
});

export interface DuckDBConfig {
  file?: string; // If not provided, uses in-memory database
  readonly?: boolean;
  type: 'duckdb';
  config?: Record<string, any>; // DuckDB configuration options
}

export const DEFAULT_DUCKDB_SCHEMA_NAME = 'main'

export const checkDuckDBConnection = async (config: DuckDBConfig): Promise<boolean> => {
  let db: duckdb.Database | undefined;

  try {
    // Create database instance (in-memory if no file specified)
    const dbPath = config.file || ':memory:';
    
    db = new duckdb.Database(dbPath);

    // Test connection with a simple query
    return new Promise((resolve) => {
      db!.all('SELECT 1 as test', (err: Error | null, rows: any[]) => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });

  } catch (err) {
    return false;
  } finally {
    if (db) {
      try {
        db.close(() => {});
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  }
}

export const getDuckDBSchema = async (config: DuckDBConfig): Promise<SchemaState> => {
  const dbPath = config.file || ':memory:';
  
  const db = new duckdb.Database(dbPath);

  try {
    // Get all tables
    const tablesResult = await new Promise<any[]>((resolve, reject) => {
      db.all(`
        SELECT 
          table_name as name,
          estimated_size
        FROM information_schema.tables 
        WHERE table_schema = 'main'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `, (err: Error | null, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const tables: Record<string, TableState> = {};
    let totalRows = 0;

    for (const tableRow of tablesResult) {
      const tableName = tableRow.name;
      
      // Get table info (columns)
      const columnsResult = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_name = ? AND table_schema = 'main'
          ORDER BY ordinal_position
        `, [tableName], (err: Error | null, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
      // Get primary key info
      const primaryKeysResult = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT column_name
          FROM information_schema.key_column_usage
          WHERE table_name = ? AND constraint_name LIKE '%_pkey'
        `, [tableName], (err: Error | null, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
      // Get foreign key info
      const foreignKeysResult = await new Promise<any[]>((resolve, reject) => {
        db.all(`
          SELECT column_name
          FROM information_schema.key_column_usage
          WHERE table_name = ? AND referenced_table_name IS NOT NULL
        `, [tableName], (err: Error | null, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      const primaryKeyColumns = new Set(primaryKeysResult.map(pk => pk.column_name));
      const foreignKeyColumns = new Set(foreignKeysResult.map(fk => fk.column_name));
      
      // Get row count
      const rowCountResult = await new Promise<any>((resolve, reject) => {
        db.get(`SELECT COUNT(*) as count FROM "${tableName}"`, (err: Error | null, row: any) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      const rowCount = rowCountResult?.count || 0;
      totalRows += rowCount;

      // Map columns
      const columns: ColumnMeta[] = columnsResult.map(col => ({
        name: col.column_name,
        dataType: col.data_type,
        nullable: col.is_nullable === 'YES',
        default: col.column_default || undefined,
        isPrimaryKey: primaryKeyColumns.has(col.column_name),
        isForeignKey: foreignKeyColumns.has(col.column_name)
      }));

      // Get table size (DuckDB specific)
      const sizeResult = await new Promise<any>((resolve, reject) => {
        db.get(`
          SELECT 
            (SELECT SUM(estimated_size) FROM information_schema.tables WHERE table_name = '${tableName}') / (1024.0 * 1024.0) as size_mb
        `, (err: Error | null, row: any) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      tables[tableName] = {
        name: tableName,
        columns,
        stats: {
          rowCount,
          sizeMB: sizeResult?.size_mb > 0 ? Math.round(sizeResult.size_mb * 100) / 100 : undefined
        }
      };
    }

    return {
      name: DEFAULT_DUCKDB_SCHEMA_NAME,
      tables,
      stats: {
        totalTables: tablesResult.length,
        totalRows: totalRows > 0 ? totalRows : undefined
      }
    };

  } finally {
    db.close();
  }
}

export const duckdbSafetyConfig: DatabaseSafetyConfig = {
  dangerousPatterns: [
    // DuckDB file operations
    /\bcopy\b.*\bto\b/,
    /\bexport\b/,
    /\binstall\b/,
    /\bload\b/,
    
    // Extension loading
    /\bload\s+extension\b/,
    
    // Python/R integration (if extensions loaded)
    /\bpython\b/,
    /\br\b\s*\(/,
    
    // Attach/detach databases
    /\battach\b/,
    /\bdetach\b/,
    
    // Pragma statements that could be dangerous
    /\bpragma\b.*\benabled?\b/,
    /\bpragma\b.*\bthroughput_threads\b/,
    /\bpragma\b.*\bmemory_limit\b/,
  ],
  dangerousKeywords: [
    'set',
    'reset',
    'create_secret',
    'drop_secret',
  ],
  maxNestedDepth: 15, // DuckDB can handle deep nesting
};

export const isDuckDBQuerySafe = (query: string): boolean => {
  return isSafeSQLQuery(query, duckdbSafetyConfig);
};

export interface DuckDBQueryResult {
  success: boolean;
  rows: any[];
  columns: {
    name: string;
    type: string;
  }[];
  rowCount: number;
  error?: string;
}

export const executeDuckDBQuery = async (query: string, config: DuckDBConfig): Promise<DuckDBQueryResult> => {
  const dbPath = config.file || ':memory:';
  
  let db: duckdb.Database | undefined;

  try {
    // Open database connection
    db = new duckdb.Database(dbPath);

    // Execute the query with a timeout
    const result = await Promise.race([
      new Promise<{ rows: any[], columns: any[] }>((resolve, reject) => {
        // Get column info first
        db!.all(query, (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }

          // Extract column information from the first row if available
          const columns = rows.length > 0 
            ? Object.keys(rows[0]).map(name => ({
                name,
                type: 'VARCHAR', // DuckDB is flexible with types, default to VARCHAR
              }))
            : [];

          resolve({ rows: rows || [], columns });
        });
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout after 30 seconds')), 30_000)
      )
    ]);

    return {
      success: true,
      rows: result.rows,
      columns: result.columns,
      rowCount: result.rows.length,
    };

  } catch (error) {
    // Log the error (but don't expose sensitive details)
    console.error('DuckDB query execution failed:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      rows: [],
      columns: [],
      rowCount: 0,
    };
  } finally {
    // Always clean up the connection
    if (db) {
      try {
        db.close();
      } catch (cleanupError) {
        console.error('Error closing DuckDB connection:', cleanupError);
      }
    }
  }
};

export const hasDuckDBTable = async (config: DuckDBConfig, tableName: string): Promise<boolean> => {
  const result = await executeDuckDBQuery(`
    SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${tableName}' AND table_schema = 'main'
  `, config);
  return result.rows[0]?.count > 0;
}

export const hasDuckDBColumn = async (config: DuckDBConfig, tableName: string, columnName: string): Promise<boolean> => {
  const result = await executeDuckDBQuery(`
    SELECT COUNT(*) as count FROM information_schema.columns 
    WHERE table_name = '${tableName}' AND column_name = '${columnName}' AND table_schema = 'main'
  `, config);
  
  return result.rows[0]?.count > 0;
}

export const generateDuckDBProfilingQueries = (tableName: string, columnName?: string): Record<string, string> => {
  const queries: Record<string, string> = {};

  if (columnName) {
    // Column-specific profiling for DuckDB
    queries.basic_stats = `
      SELECT 
        COUNT(*) as total_count,
        COUNT("${columnName}") as non_null_count,
        COUNT(*) - COUNT("${columnName}") as null_count,
        COUNT(DISTINCT "${columnName}") as distinct_count,
        CAST(COUNT(DISTINCT "${columnName}") AS DOUBLE) / CAST(COUNT(*) AS DOUBLE) as uniqueness_ratio
      FROM "${tableName}"
    `;

    // Numeric statistics for DuckDB
    queries.numeric_stats = `
      SELECT 
        MIN("${columnName}") as min_value,
        MAX("${columnName}") as max_value,
        AVG(CAST("${columnName}" AS DOUBLE)) as mean_value,
        STDDEV(CAST("${columnName}" AS DOUBLE)) as std_dev,
        MEDIAN("${columnName}") as median_value
      FROM "${tableName}"
      WHERE "${columnName}" IS NOT NULL 
        AND TRY_CAST("${columnName}" AS DOUBLE) IS NOT NULL
    `;

    // Top frequent values for DuckDB
    queries.top_values = `
      SELECT 
        "${columnName}" as value,
        COUNT(*) as frequency,
        CAST(COUNT(*) AS DOUBLE) / (SELECT COUNT(*) FROM "${tableName}") as percentage
      FROM "${tableName}"
      WHERE "${columnName}" IS NOT NULL
      GROUP BY "${columnName}"
      ORDER BY frequency DESC
      LIMIT 10
    `;

    // Data quality indicators for DuckDB
    queries.data_quality = `
      SELECT 
        CASE 
          WHEN "${columnName}" IS NULL THEN 'NULL'
          WHEN TRIM(CAST("${columnName}" AS VARCHAR)) = '' THEN 'EMPTY'
          ELSE 'VALID'
        END as data_status,
        COUNT(*) as count
      FROM "${tableName}"
      GROUP BY data_status
    `;

    // DuckDB-specific string analysis
    queries.string_analysis = `
      SELECT 
        MIN(LENGTH(CAST("${columnName}" AS VARCHAR))) as min_length,
        MAX(LENGTH(CAST("${columnName}" AS VARCHAR))) as max_length,
        AVG(LENGTH(CAST("${columnName}" AS VARCHAR))) as avg_length
      FROM "${tableName}"
      WHERE "${columnName}" IS NOT NULL
    `;

  } else {
    // Table-level profiling for DuckDB - focus on DATA not schema
    queries.table_overview = `
      SELECT COUNT(*) as total_rows
      FROM "${tableName}"
    `;

    queries.sample_data = `
      SELECT *
      FROM "${tableName}"
      LIMIT 5
    `;

    // Data-focused table analysis
    queries.table_data_summary = `
      SELECT 
        COUNT(*) as total_rows,
        (SELECT estimated_size / (1024.0 * 1024.0) FROM information_schema.tables WHERE table_name = '${tableName}') as estimated_size_mb
      FROM "${tableName}"
    `;

    // DuckDB specific table statistics
    queries.table_statistics = `
      SELECT 
        table_name,
        estimated_size,
        column_count,
        (SELECT COUNT(*) FROM "${tableName}") as actual_row_count
      FROM information_schema.tables 
      WHERE table_name = '${tableName}' AND table_schema = 'main'
    `;
  }

  return queries;
}; 