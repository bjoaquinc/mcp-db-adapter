import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const serverConfig = {
    name: "Database Adapter",
    version: "0.1.0",
}

const serverOptions = {}

export const createMCPServer = async () => {
    // Create a new server instance
    const server = new McpServer(serverConfig, serverOptions);

    return server;
}

export const connectToTransport = async (server: McpServer) => {
    // Start receiving messages on stdin and sending messages on stdout
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

