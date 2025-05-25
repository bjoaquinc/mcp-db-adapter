import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

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

