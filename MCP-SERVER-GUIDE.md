# MCP Server for Light Cloud Platform - Technical Guide

## Overview

This document covers the implementation, distribution, and integration of an MCP (Model Context Protocol) server for the Light Cloud Platform.

## What is MCP?

MCP (Model Context Protocol) is a protocol that allows AI assistants like Claude to communicate with external tools and services. An MCP server exposes "tools" that Claude can invoke to perform actions.

---

## Project Structure

```
mcp-server/
├── package.json          # Package config with npm publishing setup
├── tsconfig.json         # TypeScript configuration
├── src/
│   └── index.ts          # MCP server implementation
└── dist/
    └── index.js          # Compiled server (generated)
```

---

## Implementation

### Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | Official MCP SDK |
| `zod` | Schema validation for tool parameters |
| `typescript` | TypeScript compiler |
| `tsx` | Development runner |

### Basic Server (`src/index.ts`)

```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "light-cloud",
  version: "1.0.0",
});

// Simple tool (no parameters)
server.tool("ping", "Health check - returns pong", {}, async () => {
  return {
    content: [{ type: "text", text: "pong" }],
  };
});

// Tool with parameters
server.tool(
  "echo",
  "Echo back the provided message",
  {
    message: z.string().describe("The message to echo back"),
  },
  async ({ message }) => {
    return {
      content: [{ type: "text", text: `Echo: ${message}` }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Light Cloud MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

---

## Distribution Methods

### 1. npm Package (Recommended)

**Advantages:**
- Easy installation via `npx`
- Version management
- No manual setup for users

**package.json for npm:**
```json
{
  "name": "light-cloud-mcp-server",
  "version": "1.0.0",
  "bin": {
    "light-cloud-mcp-server": "dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

**Publishing:**
```bash
npm login
npm publish
```

**User installation:**
```bash
# Claude Code
claude mcp add light-cloud -- npx light-cloud-mcp-server

# Claude Desktop (claude_desktop_config.json)
{
  "mcpServers": {
    "light-cloud": {
      "command": "npx",
      "args": ["light-cloud-mcp-server"]
    }
  }
}
```

### 2. Remote HTTP Server

**Advantages:**
- Zero setup for users
- Centralized control
- Access to backend resources

**User installation:**
```bash
claude mcp add --transport http light-cloud https://your-server.com/mcp
```

### 3. Git Repository

**Advantages:**
- Full source access
- Custom modifications

**User installation:**
```bash
git clone <repo-url>
cd mcp-server
npm install && npm run build
claude mcp add light-cloud -- node /path/to/dist/index.js
```

---

## MCP Registry

### Official Registry

- URL: https://registry.modelcontextprotocol.io/
- GitHub: https://github.com/modelcontextprotocol/registry

**Publishing to registry:**
```bash
# Install CLI
brew install mcp-publisher

# Initialize
mcp-publisher init

# Create server.json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json",
  "name": "io.github.USERNAME/light-cloud",
  "description": "MCP server for Light Cloud Platform",
  "version": "1.0.0",
  "packages": [{
    "registry": "npm",
    "name": "light-cloud-mcp-server"
  }]
}

# Authenticate & publish
mcp-publisher login github
mcp-publisher publish
```

### Claude Code Registry

Claude Code uses Anthropic's own registry at `https://api.anthropic.com/mcp-registry/` as a reference, but does **not** auto-install servers. Users must manually add servers.

---

## Integrating with Light Cloud API

### Architecture

```
User (Claude) → MCP Server → Light Cloud API
     ↑              ↓              ↓
     └──── response ←──── response ←┘
```

### Example: API Integration

```typescript
const LIGHT_CLOUD_API = "https://api.lightcloud.com";

server.tool(
  "list-instances",
  "List all compute instances",
  {},
  async () => {
    const response = await fetch(`${LIGHT_CLOUD_API}/instances`, {
      headers: {
        "Authorization": `Bearer ${process.env.LIGHT_CLOUD_API_KEY}`,
      },
    });

    const data = await response.json();

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "create-instance",
  "Create a new compute instance",
  {
    name: z.string().describe("Instance name"),
    size: z.enum(["small", "medium", "large"]).describe("Instance size"),
  },
  async ({ name, size }) => {
    const response = await fetch(`${LIGHT_CLOUD_API}/instances`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.LIGHT_CLOUD_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, size }),
    });

    const data = await response.json();

    return {
      content: [{ type: "text", text: `Created instance: ${data.id}` }],
    };
  }
);
```

### Passing API Keys

**Claude Code:**
```bash
claude mcp add light-cloud -e LIGHT_CLOUD_API_KEY=sk-xxx -- npx light-cloud-mcp-server
```

**Claude Desktop:**
```json
{
  "mcpServers": {
    "light-cloud": {
      "command": "npx",
      "args": ["light-cloud-mcp-server"],
      "env": {
        "LIGHT_CLOUD_API_KEY": "sk-xxx"
      }
    }
  }
}
```

---

## Client Configuration Paths

| Client | Config File Location |
|--------|---------------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Code (local) | `.mcp.json` (project directory) |
| Claude Code (user) | `~/.claude.json` |

---

## Testing

### Manual Test via JSON-RPC

```bash
node -e "
const { spawn } = require('child_process');
const server = spawn('node', ['dist/index.js']);
server.stdout.on('data', d => console.log('OUT:', d.toString().trim()));
server.stderr.on('data', d => console.log('ERR:', d.toString().trim()));
const msgs = [
  {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1.0.0'}}},
  {jsonrpc:'2.0',method:'notifications/initialized'},
  {jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'ping',arguments:{}}}
];
let i = 0;
const send = () => {
  if (i < msgs.length) { server.stdin.write(JSON.stringify(msgs[i++]) + '\n'); setTimeout(send, 100); }
  else { setTimeout(() => server.kill(), 200); }
};
send();
"
```

### Expected Output

```
ERR: Light Cloud MCP server running on stdio
OUT: {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"light-cloud","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
OUT: {"result":{"content":[{"type":"text","text":"pong"}]},"jsonrpc":"2.0","id":2}
```

---

## How Users Interact with Tools

After installing the MCP server, users don't need to know tool names or syntax. They just chat naturally with Claude.

### Example Conversation

```
User: "ping the light cloud server"

Claude: I'll check the server.
        [Calls ping tool]
        The server responded with "pong" - it's healthy.

User: "show me my cloud instances"

Claude: [Calls list-instances tool]
        You have 3 instances:
        - web-server (running, medium)
        - database (running, large)
        - dev-box (stopped, small)
```

---

## Natural Language Understanding

Claude understands **intent**, not keywords. Users can ask the same thing in different ways:

### Same tool, different phrasings:

**ping tool:**
- "ping the server"
- "is the server up?"
- "check if light cloud is working"
- "health check"
- "is everything running?"

**echo tool:**
- "echo hello"
- "repeat back: hello"
- "say hello to me"
- "mirror this message: hello"

### How Claude decides which tool to use:

1. Reads the tool's `name` and `description`
2. Matches user intent to the best fitting tool
3. Extracts parameters from the conversation

```typescript
server.tool(
  "ping",                          // ← tool name
  "Health check - returns pong",   // ← Claude reads this to understand purpose
  {},
  async () => { ... }
);
```

### Writing better tool descriptions

Better descriptions = smarter matching:

```typescript
// Vague - Claude might miss it
server.tool("list", "List things", ...)

// Clear - Claude understands when to use it
server.tool(
  "list-instances",
  "List all compute instances/VMs in the Light Cloud account, showing their status, size, and configuration",
  ...
)
```

---

## Where Does Data Come From?

The **npm package** is just the delivery method (how users install it). The **answers come from wherever your tools fetch data**.

### Data Flow

```
User question
     ↓
Claude (understands intent)
     ↓
MCP Server (your npm package)
     ↓
Your tool code decides where to get data:
     ├── Static response (hardcoded)
     ├── Light Cloud API (HTTP call)
     ├── Database query
     └── Local file system
```

### Data Source Examples

**Static (no external call):**
```typescript
server.tool("ping", "Health check", {}, async () => {
  return { content: [{ type: "text", text: "pong" }] };  // ← hardcoded
});
```

**From Light Cloud API:**
```typescript
server.tool("list-instances", "List instances", {}, async () => {
  const response = await fetch("https://api.lightcloud.com/instances", {
    headers: { "Authorization": `Bearer ${process.env.API_KEY}` }
  });
  const data = await response.json();  // ← from Light Cloud API
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});
```

**From database:**
```typescript
server.tool("get-user", "Get user info", { id: z.string() }, async ({ id }) => {
  const user = await db.query("SELECT * FROM users WHERE id = ?", [id]);  // ← from DB
  return { content: [{ type: "text", text: JSON.stringify(user) }] };
});
```

### Summary: Data Sources by Question

| Question | Data Source |
|----------|-------------|
| "Is server healthy?" | Static "pong" (local) |
| "List my instances" | Light Cloud API |
| "Create a VM" | Light Cloud API |
| "Show billing" | Light Cloud API |

The MCP server is the **bridge** between Claude and external services. The npm package just delivers that bridge to users.

---

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `tsc` | Compile TypeScript |
| `start` | `node dist/index.js` | Run compiled server |
| `dev` | `tsx src/index.ts` | Run in development mode |
| `prepublishOnly` | `npm run build` | Auto-build before publish |

---

## References

- [MCP Official Documentation](https://modelcontextprotocol.io/)
- [MCP SDK GitHub](https://github.com/modelcontextprotocol/sdk)
- [MCP Registry](https://registry.modelcontextprotocol.io/)
- [Claude Code MCP Docs](https://docs.anthropic.com/claude-code/mcp)
