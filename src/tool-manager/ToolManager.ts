import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";

export interface ToolDefinition<TSchema extends ZodRawShape = ZodRawShape> {
    name: string;
    description: string;
    inputSchema: TSchema;
    handler: ToolCallback<TSchema>;
    outputSchema?: TSchema;
}

export class ToolManager {
    private readonly server: McpServer
    private registeredTools: Set<string> = new Set();

    constructor(server: McpServer) {
        this.server = server;
    }

    public addTool<T extends ZodRawShape>(toolDef: ToolDefinition<T>): void {
        const {name, description, inputSchema, outputSchema, handler} = toolDef
        this.server.registerTool(name, {
            inputSchema,
            outputSchema,
            description,
        }, handler)
        this.registeredTools.add(toolDef.name);
    }
}