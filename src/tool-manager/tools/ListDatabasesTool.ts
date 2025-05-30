import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";

// Empty schema since this tool takes no parameters
const ListDatabasesSchema = {};

export function createListDatabasesTool(stateManager: StateManager) {
  return {
    name: "list_databases",
    description: "List all configured database names",
    inputSchema: ListDatabasesSchema,
    handler: async () => {
      const databaseNames = stateManager.getDatabaseNames();
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(databaseNames, null, 2),
        }],
      };
    },
  } as ToolDefinition<typeof ListDatabasesSchema>;
}