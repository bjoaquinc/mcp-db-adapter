import type { ToolDefinition } from "./ToolManager.js";
import type { StateManager } from "../state-manager/StateManager.js";
import { MySQLConfigSchema } from "../engines/mysql.js";
import { SQLiteConfigSchema } from "../engines/sqlite.js";
import { z } from "zod";

const AddDatabaseSchema = {
  name: z.string(),
  config: z.union([
    MySQLConfigSchema,
    SQLiteConfigSchema
  ]),
};

export function createAddDatabaseTool(stateManager: StateManager) {
    return {
      name: "add_db_config",
      description: "Add a database config",
      inputSchema: AddDatabaseSchema,
      handler: async (configObject) => {
        const { name, config } = configObject;
        const { type, ...rest } = config;
        // TODO:!!! Test if database is accessible
        stateManager.setDatabase(name, {
            name,
            engine: type,
            config: rest,
            schemas: {}, // Initially empty, will load the schema later lazily
        });
        return {
          content: [{
            type: "text",
            text: `Added database config for ${configObject.name}`,
          }],
        };
      },
    } as ToolDefinition<typeof AddDatabaseSchema>;
  }