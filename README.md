# Light Cloud MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that enables Claude to deploy and manage applications on Light Cloud Platform.

## Features

- **Browser-based authentication** - Secure OAuth login flow
- **Application management** - Create, deploy, and delete applications
- **Environment management** - Manage staging, production, and preview environments
- **GitHub integration** - Deploy directly from GitHub repositories
- **Upload deployment** - Deploy local projects without GitHub
- **Real-time logs** - View deployment and application logs
- **Framework detection** - Auto-detect React, Next.js, Vue, Python, and more

## Installation

### Claude Code

```bash
# Add the MCP server
claude mcp add light-cloud -- npx @light-cloud/mcp-server
```

Then inside Claude Code, allow all tools without repeated prompts:

```
/allowed add mcp__light-cloud__*
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "light-cloud": {
      "command": "npx",
      "args": ["@light-cloud/mcp-server"]
    }
  }
}
```

## Usage

Once installed, just chat naturally with Claude:

```
You: Deploy my React app to Light Cloud
Claude: I'll help you deploy. First, let me check your authentication...
        [Opens browser for login]

You: Show me all my applications
Claude: [Lists your applications with status]

You: Check the logs for my-app
Claude: [Fetches and displays recent logs]
```

## Available Tools

| Tool | Description |
|------|-------------|
| `login` | Sign in to Light Cloud (opens browser) |
| `logout` | Sign out and clear credentials |
| `whoami` | Check authentication status |
| `list-applications` | List all applications |
| `get-application` | Get application details |
| `create-application` | Create app from GitHub repo |
| `deploy-application` | Trigger a deployment |
| `delete-application` | Delete an application |
| `list-environments` | List environments for an app |
| `create-environment` | Create a new environment |
| `deploy-environment` | Deploy to specific environment |
| `get-environment-logs` | Runtime logs, newest first; optional `hours`, `limit`, `search`, `revision` |
| `list-repositories` | List connected GitHub repos |
| `detect-framework` | Auto-detect project framework |

## Authentication

The server uses browser-based OAuth authentication. When you first interact with Light Cloud tools, Claude will prompt you to log in:

1. Claude opens your browser to the Light Cloud login page
2. Sign in with Google, GitHub, or email
3. Return to Claude - you're authenticated!

Credentials are stored securely in `~/.lightcloud/credentials.json`.

## Configuration

Set a custom API endpoint (for staging/development):

```bash
# Environment variable
export LIGHT_CLOUD_API_URL=https://api.staging-light-cloud.com

# Or in Claude Desktop config
{
  "mcpServers": {
    "light-cloud": {
      "command": "npx",
      "args": ["light-cloud-mcp-server"],
      "env": {
        "LIGHT_CLOUD_API_URL": "https://api.staging-light-cloud.com"
      }
    }
  }
}
```

## Development

```bash
# Clone the repository
git clone https://github.com/light-cloud-com/mcp-server.git
cd mcp-server

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Testing

Test the server manually:

```bash
npm run build
node dist/index.js
```

Then send JSON-RPC messages via stdin.

## License

MIT - see [LICENSE](LICENSE)

## Links

- [Light Cloud Platform](https://light-cloud.com)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Report Issues](https://github.com/light-cloud-com/mcp-server/issues)
