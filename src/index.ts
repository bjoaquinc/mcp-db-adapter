import { connectToTransport, createMCPServer } from "./server/server.js";
import { ToolManager } from "./tool-manager/ToolManager.js";
import { createAddDatabaseTool } from "./tool-manager/AddDatabaseTool.js";
import { StateManager } from "./state-manager/StateManager.js";

const initalize = async () => {

  // Create a new server instance
  const server = await createMCPServer()

  // Set state
  const stateManager = new StateManager();

  // Set tools
  const toolManager = new ToolManager(server);
  toolManager.addTool(createAddDatabaseTool(stateManager))

  // Connect to Stdio transport
  await connectToTransport(server);
}

await initalize()
