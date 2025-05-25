import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";


export class ToolManager {
    private readonly server: McpServer
    // private tools: Map<string, any> = new Map();

    constructor(server: McpServer) {
        this.server = server;
    }

    // registerTool(name: string, tool: any) {
    //     this.tools.set(name, tool);
    // }

    // getTool(name: string) {
    //     return this.tools.get(name);
    // }

    // listTools() {
    //     return Array.from(this.tools.keys());
    // }

    // unregisterTool(name: string) {
    //     this.tools.delete(name);
    // }
}