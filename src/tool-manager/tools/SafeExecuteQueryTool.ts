import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DatabaseEngine } from "../../state-manager/StateManagerTypes.js";
import { isMySQLQuerySafe, executeMySQLQuery } from "../../engines/mysql.js";
import type { MySQLConfig } from "../../engines/mysql.js";
import { isSQLiteQuerySafe, executeSQLiteQuery } from "../../engines/sqlite.js";
import type { SQLiteConfig } from "../../engines/sqlite.js";

// Empty schema since this tool takes no parameters
const SafeExecuteQuerySchema = {
    query: z.string(),
    databaseName: z.string(),
};

type EnginConfigUnion = MySQLConfig | SQLiteConfig;

export function createSafeExecuteQueryTool(stateManager: StateManager) {
  return {
    name: "safe_execute_query",
    description: "Execute a read-only query on the database",
    inputSchema: SafeExecuteQuerySchema,
    handler: async (input) => {
        const { query, databaseName } = input;

        // Get the database from the state manager
        const database = stateManager.getDatabase(databaseName);
        const { config, engine} = database;

        if (!database) {
            throw new McpError(32003, `Database ${databaseName} not found`);
        }

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
