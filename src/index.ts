import { connectToTransport, createMCPServer } from "./server/server.js";
import { ToolManager } from "./tool-manager/ToolManager.js";
import { createAddDatabaseTool } from "./tool-manager/tools/AddDatabaseTool.js";
import { StateManager } from "./state-manager/StateManager.js";
import { createIntrospectSchemaTool } from "./tool-manager/tools/IntrospectSchemaTool.js";
import { createListDatabasesTool } from "./tool-manager/tools/ListDatabasesTool.js";
import { createSafeExecuteQueryTool } from "./tool-manager/tools/SafeExecuteQueryTool.js";
import { createProfileTableOrColumnTool } from "./tool-manager/tools/ProfileTableOrColumnTool.js";

const initalize = async () => {

  try {
    // create a new server instance
    const server = await createMCPServer()

    // create new state manager
    const stateManager = new StateManager();

    // create new tool manager and add tools
    const toolManager = new ToolManager(server);
    toolManager.addTool(createAddDatabaseTool(stateManager))
    toolManager.addTool(createIntrospectSchemaTool(stateManager))
    toolManager.addTool(createListDatabasesTool(stateManager))
    toolManager.addTool(createSafeExecuteQueryTool(stateManager))
    toolManager.addTool(createProfileTableOrColumnTool(stateManager))

    // connect to transport
    await connectToTransport(server);

    // Log to stderr (not stdout, which is used for MCP protocol)
    console.error("Successfuly started mcp-db-adapter!")
  } catch (err) {
    const typedErr = err as Error
    console.error("Failed to initialize MCP server:", typedErr.message);
    console.error("Stack trace:", typedErr.stack);
    
    // Exit with error code
    process.exit(1);
  }
}

await initalize()
