import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";
import { getMySqlSchema } from "../../engines/mysql.js";
import { DEFAULT_SQLITE_SCHEMA_NAME, getSqliteSchema } from "../../engines/sqlite.js";
import type { MySQLConfig } from "../../engines/mysql.js";
import type { SQLiteConfig } from "../../engines/sqlite.js";
import { z } from "zod";
import { SchemaState } from "../../state-manager/StateManagerTypes.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

const IntrospectSchemaSchema = {
  name: z.string()
};

type DBConfig = MySQLConfig | SQLiteConfig



export function createIntrospectSchemaTool(stateManager: StateManager) {
  return {
    name: "introspect_schema",
    description: "Analyze the schema of a database",
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