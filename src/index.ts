#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create MCP server instance
const server = new McpServer({
  name: "light-cloud",
  version: "1.0.0",
});

// Register the 'ping' tool - simple health check
server.tool("ping", "Health check - returns pong", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: "pong",
      },
    ],
  };
});

// Register the 'echo' tool - demonstrates parameters
server.tool(
  "echo",
  "Echo back the provided message",
  {
    message: z.string().describe("The message to echo back"),
  },
  async ({ message }) => {
    return {
      content: [
        {
          type: "text",
          text: `Echo: ${message}`,
        },
      ],
    };
  }
);

// Main function to start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Light Cloud MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
