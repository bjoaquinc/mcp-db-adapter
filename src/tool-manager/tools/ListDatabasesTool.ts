import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

// Empty schema since this tool takes no parameters
const ListDatabasesSchema = {};

export function createListDatabasesTool(stateManager: StateManager) {
  return {
    name: "list_databases",
    description: "List all configured database names",
    inputSchema: ListDatabasesSchema,
    handler: async () => {
      const databaseNames = stateManager.getDatabaseNames();

      if (databaseNames.length === 0) {
        throw new McpError(32003, "No databases configured")
      }

      return {
        content: [{
          type: "text",
          text: `Configured databases: ${databaseNames.join(", ")}`,
        }],
      };
    },
  } as ToolDefinition<typeof ListDatabasesSchema>;
}