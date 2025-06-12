import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import z from "zod";
import fs from 'fs';
import { ColumnMeta, SchemaState, TableState } from '../state-manager/StateManagerTypes.js';
import { DatabaseSafetyConfig, isSafeSQLQuery } from "../utils/safety.js";

export const SQLiteConfigSchema = z.object({
  file: z.string(),
  readonly: z.boolean().optional(),
  type: z.literal('sqlite'),
});

export interface SQLiteConfig {
  file: string;
  readonly?: boolean;
  type: 'sqlite';
}

export const DEFAULT_SQLITE_SCHEMA_NAME = 'main'

export const checkSqliteConnection = async (config: SQLiteConfig): Promise<boolean> => {

  if (!fs.existsSync(config.file)) {
    // database doesnt exist
    return false;
  }

  const mode = config.readonly
    ? sqlite3.OPEN_READONLY
    : sqlite3.OPEN_READWRITE;
      
  try {
    // 3) Open & ping
    const db = await open({
      filename: config.file,
      driver: sqlite3.Database,
      mode,
    });

    // The cheapest "is-alive?" query you can do:
    await db.get('PRAGMA quick_check;');

    // 4) Clean shutdown
    await db.close();
    return true;
  } catch (err) {
    // Log once, return false so callers can decide how noisy to be
    // console.error(`[${dbName}] SQLite handshake failed:`, err);
    return false;
  }
}

export const getSqliteSchema = async (config: SQLiteConfig): Promise<SchemaState> => {
  const mode = config.readonly
    ? sqlite3.OPEN_READONLY
    : sqlite3.OPEN_READWRITE;

  const db = await open({
    filename: config.file,
    driver: sqlite3.Database,
    mode,
  });

  try {
    // Get all tables
    const tablesResult = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);

    const tables: Record<string, TableState> = {};
    let totalRows = 0;

    for (const tableRow of tablesResult) {
      const tableName = tableRow.name;
      
      // Get table info (columns)
      const columnsResult = await db.all(`PRAGMA table_info(${tableName})`);
      
      // Get foreign key info
      const foreignKeysResult = await db.all(`PRAGMA foreign_key_list(${tableName})`);
      const foreignKeyColumns = new Set(foreignKeysResult.map(fk => fk.from));
      
      // Get row count
      const rowCountResult = await db.get(`SELECT COUNT(*) as count FROM "${tableName}"`);
      const rowCount = rowCountResult?.count || 0;
      totalRows += rowCount;

      // Map columns
      const columns: ColumnMeta[] = columnsResult.map(col => ({
        name: col.name,
        dataType: col.type || 'TEXT',
        nullable: col.notnull === 0,
        default: col.dflt_value || undefined,
        isPrimaryKey: col.pk === 1,
        isForeignKey: foreignKeyColumns.has(col.name)
      }));

      // Get table size (approximate)
      const pageSizeResult = await db.get('PRAGMA page_size');
      const pageCountResult = await db.get(`PRAGMA page_count`);
      const pageSize = pageSizeResult?.page_size || 4096;
      const pageCount = pageCountResult?.page_count || 0;
      const sizeMB = (pageSize * pageCount) / (1024 * 1024);

      tables[tableName] = {
        name: tableName,
        columns,
        stats: {
          rowCount,
          sizeMB: sizeMB > 0 ? Math.round(sizeMB * 100) / 100 : undefined
        }
      };
    }

    return {
      name: DEFAULT_SQLITE_SCHEMA_NAME,
      tables,
      stats: {
        totalTables: tablesResult.length,
        totalRows: totalRows > 0 ? totalRows : undefined
      }
    };

  } finally {
    await db.close();
  }
}

export const sqliteSafetyConfig: DatabaseSafetyConfig = {
  dangerousPatterns: [
    // SQLite-specific functions that could be dangerous
    /\breadfile\b/,
    /\bwritefile\b/,
    
    // PRAGMA statements (could modify database settings)
    /\bpragma\b/,
    
    // SQLite doesn't have traditional stored procedures, but has some functions
    // that could be problematic if extensions are loaded
    /\bload_extension\b/,
    
    // Vacuum and analyze can be resource intensive
    /\bvacuum\b/,
    /\banalyze\b/,
  ],
  dangerousKeywords: [
    'attach',
    'detach',
  ],
  maxNestedDepth: 12, // SQLite can handle more nesting than MySQL
};

export const isSQLiteQuerySafe = (query: string): boolean => {
  return isSafeSQLQuery(query, sqliteSafetyConfig);
};

export interface SQLiteQueryResult {
  success: boolean;
  rows: any[];
  columns: {
    name: string;
    type: string;
  }[];
  rowCount: number;
  error?: string;
}

export const executeSQLiteQuery = async (query: string, config: SQLiteConfig): Promise<SQLiteQueryResult> => {

  const mode = config.readonly
    ? sqlite3.OPEN_READONLY
    : sqlite3.OPEN_READWRITE;

  let db: any = undefined;

  try {
    // Open database connection
    db = await open({
      filename: config.file,
      driver: sqlite3.Database,
      mode,
    });

    // Execute the query with a timeout
    const rows = await Promise.race([
      db.all(query),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout after 30 seconds')), 30_000)
      )
    ]) as any[];

    // SQLite doesn't provide detailed column metadata like MySQL,
    // so we'll extract column names from the first row
    const columns = rows.length > 0 
      ? Object.keys(rows[0]).map(name => ({
          name,
          type: 'TEXT', // SQLite is dynamically typed, so we default to TEXT
        }))
      : [];

    return {
      success: true,
      rows: rows || [],
      columns,
      rowCount: rows?.length || 0,
    };

  } catch (error) {
    // Log the error (but don't expose sensitive details)
    console.error('SQLite query execution failed:', error);
    
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
        await db.close();
      } catch (cleanupError) {
        console.error('Error closing SQLite connection:', cleanupError);
      }
    }
  }
};

export const hasSQLiteTable = async (config: SQLiteConfig, tableName: string): Promise<boolean> => {
  const result = await executeSQLiteQuery(`
    SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name = '${tableName}'
  `, config);
  return result.rows[0]?.count > 0;
}

export const hasSQLiteColumn = async (config: SQLiteConfig, tableName: string, columnName: string): Promise<boolean> => {
  const result = await executeSQLiteQuery(
    `PRAGMA table_info('${tableName}')`, 
    config
  );
  
  return result.rows.some(row => row.name === columnName);
}

export const generateSQLiteProfilingQueries = (tableName: string, columnName?: string): Record<string, string> => {
  const queries: Record<string, string> = {};

  if (columnName) {
    // Column-specific profiling for SQLite
    queries.basic_stats = `
      SELECT 
        COUNT(*) as total_count,
        COUNT("${columnName}") as non_null_count,
        COUNT(*) - COUNT("${columnName}") as null_count,
        COUNT(DISTINCT "${columnName}") as distinct_count,
        CAST(COUNT(DISTINCT "${columnName}") AS REAL) / CAST(COUNT(*) AS REAL) as uniqueness_ratio
      FROM "${tableName}"
    `;

    // Numeric statistics for SQLite (more permissive than MySQL)
    queries.numeric_stats = `
      SELECT 
        MIN("${columnName}") as min_value,
        MAX("${columnName}") as max_value,
        AVG(CAST("${columnName}" AS REAL)) as mean_value
      FROM "${tableName}"
      WHERE "${columnName}" IS NOT NULL 
        AND typeof("${columnName}") IN ('integer', 'real')
        OR (typeof("${columnName}") = 'text' AND "${columnName}" GLOB '*[0-9]*')
    `;

    // Top frequent values for SQLite
    queries.top_values = `
      SELECT 
        "${columnName}" as value,
        COUNT(*) as frequency,
        CAST(COUNT(*) AS REAL) / (SELECT COUNT(*) FROM "${tableName}") as percentage
      FROM "${tableName}"
      WHERE "${columnName}" IS NOT NULL
      GROUP BY "${columnName}"
      ORDER BY frequency DESC
      LIMIT 10
    `;

    // Data quality indicators for SQLite
    queries.data_quality = `
      SELECT 
        CASE 
          WHEN "${columnName}" IS NULL THEN 'NULL'
          WHEN TRIM(CAST("${columnName}" AS TEXT)) = '' THEN 'EMPTY'
          ELSE 'VALID'
        END as data_status,
        COUNT(*) as count
      FROM "${tableName}"
      GROUP BY data_status
    `;

  } else {
    // Table-level profiling for SQLite - focus on DATA not schema
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
        (
          SELECT ROUND((page_count * page_size) / 1024.0 / 1024.0, 2)
          FROM (
            SELECT page_count, 
                   (SELECT page_size FROM pragma_page_size) as page_size
            FROM pragma_page_count
          )
        ) as size_mb
      FROM "${tableName}"
    `;
  }

  return queries;
};