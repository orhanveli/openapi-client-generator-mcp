#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { generate } from "openapi-typescript-codegen";
import fs from "fs/promises";

interface GenerateClientArgs {
  input: string;
  output: string;
  httpClient: "fetch" | "axios";
}

class OpenApiClientGenerator {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "openapi-client-generator",
        version: "0.1.1",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "generate_client",
          description:
            "Generate TypeScript API client from OpenAPI specification",
          inputSchema: {
            type: "object",
            properties: {
              input: {
                type: "string",
                description: "URL or file path to OpenAPI specification",
              },
              output: {
                type: "string",
                description: "Output directory for generated client",
              },
              httpClient: {
                type: "string",
                enum: ["fetch", "axios"],
                description: "HTTP client to use (fetch or axios)",
              },
            },
            required: ["input", "output", "httpClient"],
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== "generate_client") {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      const args = request.params.arguments as unknown as GenerateClientArgs;

      try {
        // Ensure output directory exists
        await fs.mkdir(args.output, { recursive: true });

        // Generate client
        await generate({
          input: args.input,
          output: args.output,
          httpClient: args.httpClient,
          useOptions: true,
          useUnionTypes: true,
          exportSchemas: true,
          exportServices: true,
          exportCore: true,
          indent: "2",
        });

        // Get list of generated files
        const files = await fs.readdir(args.output);

        return {
          content: [
            {
              type: "text",
              text: `Successfully generated TypeScript API client in ${
                args.output
              }\n\nGenerated files:\n${files.join("\n")}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating client: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenAPI Client Generator MCP server running on stdio");
  }
}

const server = new OpenApiClientGenerator();
server.run().catch(console.error);
