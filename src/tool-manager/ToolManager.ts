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
        
        // Wrap to properly handle errors
        const safeHandler = this.errorHandler(handler)

        this.server.registerTool(name, {
            inputSchema,
            outputSchema,
            description,
        }, safeHandler)
        this.registeredTools.add(toolDef.name);
    }

    private errorHandler<T extends ZodRawShape | undefined>(handler: ToolCallback<T>): ToolCallback<T> {
        // biome-ignore lint/suspicious/noExplicitAny: This properly handles both overloads
        return (async (...params: any[]) => {
            try {
                // biome-ignore lint/suspicious/noExplicitAny: This properly handles both overloads
                return await (handler as any)(...params);
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
                    }],
                    isError: true
                };
            }
        }) as ToolCallback<T>;
    }
}