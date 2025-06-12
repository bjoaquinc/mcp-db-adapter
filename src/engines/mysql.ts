import mysql from "mysql2/promise"
import z from "zod";
import { ColumnMeta, SchemaState, TableState } from "../state-manager/StateManagerTypes.js";
import { DatabaseSafetyConfig, isSafeSQLQuery } from "../utils/safety.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

export const MySQLConfigSchema = z.object({
  type: z.literal('mysql'),
  host: z.string(),
  port: z.number(),
  user: z.string(),
  password: z.string(),
  database: z.string()
});

export interface MySQLConfig {
  type: 'mysql';
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface MySQLQueryResult {
  success: boolean;
  rows: any[];
  columns: {
    name: string;
    type: number;
    table: string;
  }[];
  rowCount: number;
  error?: string;
}

export const checkMySqlConnection = async (
  config: MySQLConfig,
): Promise<boolean> => {
  let conn: mysql.Connection | undefined;

  try {
    // 1) Open
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      // keep it snappy — tweak if you expect slow networks
      connectTimeout: 5_000,
    });

    // 2) Ping with the lightest-weight query possible
    await conn.query('SELECT 1');

    // 3) Clean shutdown
    await conn.end();
    return true;
  } catch (err) {
    // console.error(`[${dbName}] MySQL handshake failed:`, err);
    if (conn) await conn.end().catch(() => void 0);
    return false;
  }
};

export const getMySqlSchema = async (config: MySQLConfig): Promise<SchemaState> => {
  let conn: mysql.Connection | undefined;

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 10_000,
    });

    // Get all tables in the database
    const [tablesResult] = await conn.query(`
      SELECT TABLE_NAME, TABLE_ROWS, 
             ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) AS SIZE_MB
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `, [config.database]);

    const tables: Record<string, TableState> = {};
    let totalRows = 0;

    for (const tableRow of tablesResult as any[]) {
      const tableName = tableRow.TABLE_NAME;
      const sizeMB = tableRow.SIZE_MB || 0;

      // Get column information
      const [columnsResult] = await conn.query(`
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          COLUMN_KEY,
          EXTRA
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [config.database, tableName]);

      // Get foreign key information
      const [foreignKeysResult] = await conn.query(`
        SELECT COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `, [config.database, tableName]);

      const foreignKeyColumns = new Set(
        (foreignKeysResult as any[]).map(fk => fk.COLUMN_NAME)
      );

      // Get actual row count for more accurate statistics
      const [rowCountResult] = await conn.query(
        `SELECT COUNT(*) as count FROM \`${tableName}\``
      );
      const actualRowCount = (rowCountResult as any[])[0]?.count || 0;
      totalRows += actualRowCount;

      // Map columns
      const columns: ColumnMeta[] = (columnsResult as any[]).map(col => ({
        name: col.COLUMN_NAME,
        dataType: col.DATA_TYPE.toUpperCase(),
        nullable: col.IS_NULLABLE === 'YES',
        default: col.COLUMN_DEFAULT,
        isPrimaryKey: col.COLUMN_KEY === 'PRI',
        isForeignKey: foreignKeyColumns.has(col.COLUMN_NAME)
      }));

      tables[tableName] = {
        name: tableName,
        columns,
        stats: {
          rowCount: actualRowCount,
          sizeMB: sizeMB > 0 ? sizeMB : undefined
        }
      };
    }

    return {
      name: config.database,
      tables,
      stats: {
        totalTables: (tablesResult as any[]).length,
        totalRows: totalRows > 0 ? totalRows : undefined
      }
    };

  } finally {
    if (conn) {
      await conn.end().catch(() => void 0);
    }
  }
};

export const mysqlSafetyConfig: DatabaseSafetyConfig = {
  dangerousPatterns: [
    // File operations
    /\binto\s+outfile\b/,
    /\binto\s+dumpfile\b/,
    /\bload_file\b/,
    
    // Locking operations
    /\bfor\s+update\b/,
    /\block\s+in\s+share\s+mode\b/,
    
    // Variable assignments
    /\binto\s+@/,
    
    // Stored procedures
    /\bcall\b/,
    /\bexec\b/,
    /\bexecute\b/,
  ],
  dangerousKeywords: [
    'benchmark',
    'sleep',
  ],
  maxNestedDepth: 8, // MySQL-specific limit
};

export const isMySQLQuerySafe = (query: string): boolean => {
  return isSafeSQLQuery(query, mysqlSafetyConfig);
};

export const executeMySQLQuery = async (query: string, config: MySQLConfig): Promise<MySQLQueryResult> => {

  let conn: mysql.Connection | undefined;

  try {
    // Create connection
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 10_000,
      // Set additional safety options
      multipleStatements: false, // Prevent multiple statement execution
    });

    // Execute the query with a timeout
    const [rows, fields] = await Promise.race([
      conn.query(query),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout after 30 seconds')), 30_000)
      )
    ]) as [any[], mysql.FieldPacket[]];

    // Format the results
    return {
      success: true,
      rows: rows || [],
      columns: fields?.map(field => ({
        name: field.name,
        type: field.type ?? 0, // Default to 0 if type is undefined
        table: field.table,
      })) || [],
      rowCount: Array.isArray(rows) ? rows.length : 0,
    };

  } catch (error) {
    // Log the error (but don't expose sensitive details)
    console.error('MySQL query execution failed:', error);
    
    throw new McpError(32003, `MySQL query execution failed: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
  } finally {
    // Always clean up the connection
    if (conn) {
      try {
        await conn.end();
      } catch (cleanupError) {
        console.error('Error closing MySQL connection:', cleanupError);
      }
    }
  }
}

export const hasMySQLTable = async (config: MySQLConfig, tableName: string): Promise<boolean> => {
  const result = await executeMySQLQuery(`
    SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${tableName}'
  `, config);
  return result.rows[0]?.count > 0;
}

export const hasMySQLColumn = async (config: MySQLConfig, tableName: string, columnName: string): Promise<boolean> => {
  const result = await executeMySQLQuery(`
    SELECT COUNT(*) as count FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name = '${columnName}'
  `, config);
  return result.rows[0]?.count > 0;
}

export const generateMySQLProfilingQueries = (tableName: string, columnName?: string): Record<string, string> => {
  const queries: Record<string, string> = {};

  if (columnName) {
    // Column-specific profiling for MySQL
    queries.basic_stats = `
      SELECT 
        COUNT(*) as total_count,
        COUNT(${columnName}) as non_null_count,
        COUNT(*) - COUNT(${columnName}) as null_count,
        COUNT(DISTINCT ${columnName}) as distinct_count,
        CAST(COUNT(DISTINCT ${columnName}) AS DECIMAL(10,4)) / CAST(COUNT(*) AS DECIMAL(10,4)) as uniqueness_ratio
      FROM ${tableName}
    `;

    // Numeric statistics for MySQL
    queries.numeric_stats = `
      SELECT 
        MIN(${columnName}) as min_value,
        MAX(${columnName}) as max_value,
        AVG(CAST(${columnName} AS DECIMAL(10,4))) as mean_value,
        STDDEV(CAST(${columnName} AS DECIMAL(10,4))) as std_dev
      FROM ${tableName}
      WHERE ${columnName} IS NOT NULL 
        AND ${columnName} REGEXP '^[+-]?[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?$'
    `;

    // Top frequent values for MySQL
    queries.top_values = `
      SELECT 
        ${columnName} as value,
        COUNT(*) as frequency,
        CAST(COUNT(*) AS DECIMAL(10,4)) / (SELECT COUNT(*) FROM ${tableName}) as percentage
      FROM ${tableName}
      WHERE ${columnName} IS NOT NULL
      GROUP BY ${columnName}
      ORDER BY frequency DESC
      LIMIT 10
    `;

    // Data quality indicators for MySQL
    queries.data_quality = `
      SELECT 
        CASE 
          WHEN ${columnName} IS NULL THEN 'NULL'
          WHEN TRIM(CAST(${columnName} AS CHAR)) = '' THEN 'EMPTY'
          ELSE 'VALID'
        END as data_status,
        COUNT(*) as count
      FROM ${tableName}
      GROUP BY data_status
    `;

  } else {
    // Table-level profiling for MySQL - focus on DATA not schema
    queries.table_overview = `
      SELECT COUNT(*) as total_rows
      FROM ${tableName}
    `;

    queries.sample_data = `
      SELECT *
      FROM ${tableName}
      LIMIT 5
    `;

    // Data-focused table analysis
    queries.table_data_summary = `
      SELECT 
        COUNT(*) as total_rows,
        ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as size_mb
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = '${tableName}' 
        AND TABLE_SCHEMA = DATABASE()
    `;
  }

  return queries;
};