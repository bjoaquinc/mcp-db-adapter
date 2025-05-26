import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";
import { MySQLConfigSchema, checkMySqlConnection } from "../../engines/mysql.js";
import { SQLiteConfigSchema, checkSqliteConnection } from "../../engines/sqlite.js";
import type { MySQLConfig } from "../../engines/mysql.js";
import type { SQLiteConfig } from "../../engines/sqlite.js";
import { z } from "zod";

const AddDatabaseSchema = {
  name: z.string(),
  config: z.union([
    MySQLConfigSchema,
    SQLiteConfigSchema
  ]),
};

type DBConfig = MySQLConfig | SQLiteConfig



export function createAddDatabaseTool(stateManager: StateManager) {
  return {
    name: "add_db_config",
    description: "Add a database config",
    inputSchema: AddDatabaseSchema,
    handler: async (configObject) => {
      const { name, config } = configObject;
      const { type, ...rest } = config;
      
      // Check connection
      const isConnected = await checkDbConnection(name, config)

      if (!isConnected) {
        // Return an error object
        return {
          content: [{
            type: 'text',
            text: `Failed to connect to database ${name} with the following config: ${JSON.stringify(config, null, 2)}`
          }],
          isError: true,
        }
      }

      // Add the database to state
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

const checkDbConnection = async (dbName: string, config: DBConfig): Promise<boolean>  => {
  let response = false // fails by default

  if (config.type === 'mysql') {
    response = await checkMySqlConnection(dbName, config)
  }

  if (config.type === 'sqlite') {
    response = await checkSqliteConnection(dbName, config)
  }

  return response
}