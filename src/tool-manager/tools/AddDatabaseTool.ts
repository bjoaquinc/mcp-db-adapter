import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";
import { MySQLConfigSchema, checkMySqlConnection } from "../../engines/mysql.js";
import { SQLiteConfigSchema, checkSqliteConnection } from "../../engines/sqlite.js";
import { DuckDBConfigSchema, checkDuckDBConnection } from "../../engines/duckdb.js";
import type { MySQLConfig } from "../../engines/mysql.js";
import type { SQLiteConfig } from "../../engines/sqlite.js";
import type { DuckDBConfig } from "../../engines/duckdb.js";
import { z } from "zod";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

const DESCRIPTION = `Add and configure a new database connection for SQL queries and data operations.

This tool establishes a secure connection to MySQL or SQLite databases, validates the connection, 
and makes the database available for subsequent query operations.

@param {string} name - Unique identifier for this database connection
@param {object} config - Database configuration object with type-specific connection details

For MySQL databases:
- Requires: host, port, user, password, and database name
- Example: { type: "mysql", host: "localhost", port: 3306, user: "admin", password: "secret", database: "myapp" }

For SQLite databases:
- Requires: file path to the database file
- Optional: readonly mode
- Example: { type: "sqlite", file: "/path/to/database.db", readonly: false }

For DuckDB databases:
- Optional: file path (uses in-memory database if omitted)
- Optional: readonly mode and configuration options
- Example: { type: "duckdb", file: "/path/to/database.db", readonly: false }

The tool will test the connection before adding it to ensure it's accessible and properly configured.
Once successfully added, the database can be referenced by its name in other database operations.`;

const AddDatabaseSchema = {
  name: z.string(),
  config: z.union([
    MySQLConfigSchema,
    SQLiteConfigSchema,
    DuckDBConfigSchema
  ]),
};

type DBConfig = MySQLConfig | SQLiteConfig | DuckDBConfig



export function createAddDatabaseTool(stateManager: StateManager) {
  return {
    name: "add_db_config",
    description: DESCRIPTION,
    inputSchema: AddDatabaseSchema,
    handler: async (configObject) => {
      const { name, config } = configObject;
      
      // Check connection
      const isConnected = await checkDbConnection(config)

      console.error(`is server connected: ${isConnected}`)

      if (!isConnected) {
        // Return an error object
        const errMessage = `Failed to connect to database ${name}`
        throw new McpError(32001, errMessage, config)
      }

      // Add the database to state
      const { type, ...rest } = config;
      stateManager.setDatabase(name, {
          name,
          engine: type,
          config: rest,
          schemas: {}, // Initially empty, will load the schema later lazily
      });

      // Return success message
      return {
        content: [{
          type: "text",
          text: `Added database config for ${configObject.name}`,
        }],
      };
    },
  } as ToolDefinition<typeof AddDatabaseSchema>;
}

const checkDbConnection = async (config: DBConfig): Promise<boolean>  => {
  let response = false // fails by default

  if (config.type === 'mysql') {
    response = await checkMySqlConnection(config)
  }

  if (config.type === 'sqlite') {
    response = await checkSqliteConnection(config)
  }

  if (config.type === 'duckdb') {
    response = await checkDuckDBConnection(config)
  }

  return response
}