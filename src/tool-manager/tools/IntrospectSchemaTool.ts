import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";
import { getMySqlSchema } from "../../engines/mysql.js";
import { DEFAULT_SQLITE_SCHEMA_NAME, getSqliteSchema } from "../../engines/sqlite.js";
import type { MySQLConfig } from "../../engines/mysql.js";
import type { SQLiteConfig } from "../../engines/sqlite.js";
import { z } from "zod";
import { SchemaState } from "../../state-manager/StateManagerTypes.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

const DESCRIPTION = `Analyze and retrieve the complete schema structure of a configured database.

This tool performs database introspection to extract detailed schema information including
tables, columns, data types, constraints, indexes, and relationships. The schema information
is essential for understanding the database structure before writing queries.

@param {string} name - Name of the configured database connection to introspect

Schema Information Retrieved:
- Table names and structures
- Column names, data types, and constraints
- Primary keys and foreign key relationships
- Indexes and their configurations
- Table metadata and statistics

Database Support:
- MySQL: Retrieves schema from the specified database name
- SQLite: Analyzes the main database schema structure

Returns:
- Complete schema structure in JSON format
- Organized by schema/database name for easy navigation
- Detailed table and column information for query planning

Use Cases:
- Understand database structure before writing queries
- Discover available tables and their relationships
- Verify column names and data types
- Plan complex queries involving multiple tables

Example usage: Use this tool with name "my_database" to get the full schema structure
before executing queries against that database.`;

const IntrospectSchemaSchema = {
  name: z.string()
};

type DBConfig = MySQLConfig | SQLiteConfig



export function createIntrospectSchemaTool(stateManager: StateManager) {
  return {
    name: "introspect_schema",
    description: DESCRIPTION,
    inputSchema: IntrospectSchemaSchema,
    handler: async (request) => {
      const { name } = request;

      // Check if the database exists
      const database = stateManager.getDatabase(name)
      if (!database) {
        const errMessage = `Database ${name} does not exist`
        throw new McpError(32002, errMessage)
      }

      // Get the schemas
      const configWithType = {
        type: database.engine,
        ...database.config
      } as DBConfig
      const schemas = await fetchSchemasFromDb(configWithType)

      return {
        content: [{
          type: "text",
          text: JSON.stringify(schemas, null, 2),
        }],
      };
    },
  } as ToolDefinition<typeof IntrospectSchemaSchema>;
}

const fetchSchemasFromDb = async (config: DBConfig): Promise<Record<string, (SchemaState | null)>> => {
    let schemaNames: string[] = []

    if (config.type === 'sqlite') {
        schemaNames.push(
            DEFAULT_SQLITE_SCHEMA_NAME
        )
    }

    if (config.type === 'mysql') {
        // in mysql dbName = schemaName
        const schemaName = config.database
        schemaNames.push(schemaName)
    }

    const entries = await Promise.all(
        schemaNames.map(async schemaName => {
            const schema = await fetchSchemaFromDb(schemaName, config);
            return [schemaName, schema] as const;
        })
    );

    // Turn that into a lookup map
    return Object.fromEntries(entries);
}

const fetchSchemaFromDb = async (schemaName: string, config: DBConfig): Promise<null | SchemaState>  => {
  let response = null

  if (config.type === 'mysql') {
    response = await getMySqlSchema(config)
  }

  if (config.type === 'sqlite') {
    response = await getSqliteSchema(config)
  }

  return response
}