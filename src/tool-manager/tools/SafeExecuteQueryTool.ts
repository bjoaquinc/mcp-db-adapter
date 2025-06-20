import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DatabaseEngine } from "../../state-manager/StateManagerTypes.js";
import { isMySQLQuerySafe, executeMySQLQuery } from "../../engines/mysql.js";
import type { MySQLConfig } from "../../engines/mysql.js";
import { isSQLiteQuerySafe, executeSQLiteQuery } from "../../engines/sqlite.js";
import type { SQLiteConfig } from "../../engines/sqlite.js";
import { executeDuckDBQuery, isDuckDBQuerySafe } from "../../engines/duckdb.js";
import type { DuckDBConfig } from "../../engines/duckdb.js";

const DESCRIPTION = `Execute a safe, read-only SQL query on a configured database connection.

This tool performs secure database queries with built-in safety checks to prevent destructive operations.
Only SELECT statements and other read-only operations are allowed. The tool automatically validates
the query syntax and ensures it doesn't contain dangerous operations like INSERT, UPDATE, DELETE, or DROP.

@param {string} query - The SQL query to execute (must be read-only)
@param {string} databaseName - Name of the configured database connection to query against

Query Safety Features:
- Automatically validates query is read-only (SELECT statements only)
- Prevents destructive operations (INSERT, UPDATE, DELETE, DROP, etc.)
- Automatically adds LIMIT 100 to SELECT queries if no LIMIT is specified
- Engine-specific safety validation for MySQL, SQLite, and DuckDB  

Examples:
- SELECT * FROM users WHERE active = 1
- SELECT COUNT(*) FROM orders WHERE created_at > '2024-01-01'
- SELECT name, email FROM customers ORDER BY created_at DESC

The query results are returned in JSON format with row count information.
Results are limited to 100 rows by default to prevent overwhelming the context window.`;

const SafeExecuteQuerySchema = {
    query: z.string(),
    databaseName: z.string(),
    // TODO: add a query type: sql, javascript, python, etc.
};

type EnginConfigUnion = MySQLConfig | SQLiteConfig | DuckDBConfig;

export function createSafeExecuteQueryTool(stateManager: StateManager) {
  return {
    name: "safe_execute_query",
    description: DESCRIPTION,
    inputSchema: SafeExecuteQuerySchema,
    handler: async (input) => {
        const { query, databaseName } = input;

        // Get the database from the state manager
        const database = stateManager.getDatabase(databaseName);

        if (!database) {
            throw new McpError(32003, `Database ${databaseName} not found`);
        }

        const { config, engine} = database;

        // Check if the query is safe
        const isSafe = isSafeQuery(query, engine);

        if (!isSafe) {
            throw new McpError(32003, `Query is not safe for ${database.engine} database`);
        }

        // Execute the query
        const result = await executeQuery(query, {
            type: engine,
            ...config,
        } as EnginConfigUnion);

        // Format the result for the LLM
        const resultText = result.success 
            ? `Query executed successfully.\nRows returned: ${result.rowCount}\n\nResults:\n${JSON.stringify(result.rows, null, 2)}`
            : `Query failed: ${result.error}`;

        return {
            isError: !result.success,
            content: [{
                type: "text",
                text: resultText,
            }],
        };
    },
  } as ToolDefinition<typeof SafeExecuteQuerySchema>;
}

const isSafeQuery = (query: string, engineType: DatabaseEngine) => {
    if (engineType === 'mysql') {
        return isMySQLQuerySafe(query);
    } else if (engineType === 'sqlite') {
        return isSQLiteQuerySafe(query);
    } else if (engineType === 'duckdb') {
        return isDuckDBQuerySafe(query);
    } else {
        throw new McpError(32003, `Unsupported engine type: ${engineType}`);
    }
}

const executeQuery = async (query: string, engineConfig: EnginConfigUnion) => {
    // Add a limit since the result will be serialized and fed to the LLM
    // 100 rows is more appropriate to avoid overwhelming the context window
    const DEFAULT_LIMIT = 100;
    
    // Automatically add LIMIT clause if not present in query
    const limitedQuery = addLimitToQuery(query, DEFAULT_LIMIT);
    
    if (engineConfig.type === 'mysql') {
        return await executeMySQLQuery(limitedQuery, engineConfig);
    } else if (engineConfig.type === 'sqlite') {
        return await executeSQLiteQuery(limitedQuery, engineConfig);
    } else if (engineConfig.type === 'duckdb') {
        return await executeDuckDBQuery(limitedQuery, engineConfig);
    } else {
        throw new McpError(32003, `Unsupported engine type: ${JSON.stringify(engineConfig, null, 2)}`);
    }
}

const addLimitToQuery = (query: string, limit: number): string => {
    // Simple check to see if LIMIT is already present (case-insensitive)
    const hasLimit = /\bLIMIT\s+\d+/i.test(query);
    
    if (hasLimit) {
        return query; // Don't modify if LIMIT already exists
    }
    
    // Add LIMIT clause to SELECT queries
    const isSelectQuery = /^\s*SELECT\b/i.test(query.trim());
    if (isSelectQuery) {
        return `${query.trim()} LIMIT ${limit}`;
    }
    
    return query; // For non-SELECT queries, return as-is
}
