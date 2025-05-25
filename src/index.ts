import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DatabaseStateJsonSchema } from "./state-manager/StateManagerSchemas.js";
import { createMCPServer } from "./server/server.js";
import { z } from "zod";

const initalize = async () => {
  const serverConfig = {
      name: "Database Adapter",
      version: "0.1.0",
  }

  const serverOptions = {}

  // Create a new server instance
  const server = await createMCPServer()

  // Add an addition tool
  server.tool("add_db_config",
    DatabaseStateJsonSchema,
    async (configObject) => {
      console.log("Received config object:", configObject);
      return {
          content: [{
            type: "text",
            text: `Added database config for ${configObject.name} with engine ${configObject.engine}`,
          }],
      }
    }
  );

  server.tool("add",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }]
      })
  );

  // Add a dynamic greeting resource
  // server.resource(
  //   "greeting",
  //   new ResourceTemplate("greeting://{name}", { list: undefined }),
  //   async (uri, { name }) => ({
  //     contents: [{
  //       uri: uri.href,
  //       text: `Hello, ${name}!`
  //     }]
  //   })
  // );

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}

const server = await initalize()

export default server;
