import type { ToolDefinition } from "../ToolManager.js";
import type { StateManager } from "../../state-manager/StateManager.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

const DESCRIPTION = `List all currently configured database connections available for queries.

This tool retrieves the names of all database connections that have been successfully added
and configured in the system. Use this tool to discover which databases are available 
before attempting to execute queries or introspect schemas.

No parameters required - this tool takes no input arguments.

Returns:
- A list of database connection names that can be used with other database tools
- If no databases are configured, returns an error indicating no databases are available

Use Case:
- Check which databases are available before running queries
- Verify that a database connection was successfully added
- Get a list of all configured databases for reference

Example output: "Configured databases: production_db, analytics_db, test_db"`;

// Empty schema since this tool takes no parameters
const ListDatabasesSchema = {};

export function createListDatabasesTool(stateManager: StateManager) {
  return {
    name: "list_databases",
    description: DESCRIPTION,
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