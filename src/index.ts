import { connectToTransport, createMCPServer } from "./server/server.js";
import { ToolManager } from "./tool-manager/ToolManager.js";
import { createAddDatabaseTool } from "./tool-manager/tools/AddDatabaseTool.js";
import { StateManager } from "./state-manager/StateManager.js";

const initalize = async () => {

  // create a new server instance
  const server = await createMCPServer()

  // create new state manager
  const stateManager = new StateManager();

  // create new tool manager and add tools
  const toolManager = new ToolManager(server);
  toolManager.addTool(createAddDatabaseTool(stateManager))

  // connect to transport
  await connectToTransport(server);
}

await initalize()
