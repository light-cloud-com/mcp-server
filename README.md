# Light Cloud MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that enables Claude to deploy and manage applications on Light Cloud Platform.

## No account yet? Start here

Ask Claude: **"Sign me up for Light Cloud as you@example.com"** (or "connect me to Light Cloud"). The `connect` tool creates the account — free plan, no password, no form — once you approve a short code at `console.light-cloud.com/device` from any device. Same tool signs an existing account in. Then: "deploy this project", "add a database", "put the workspace on Pro and add a card". Nothing needs the web console.

## Features

- **Sign-up and sign-in from the terminal** - `connect` with an email; a code approved on any device creates or signs in the account. No password.
- **Billing from the conversation** - plans, usage pool, card via a Stripe-hosted link
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

### Claude Desktop (one-click extension)

Download `light-cloud-<version>.mcpb` from the [latest release](https://github.com/light-cloud-com/mcp-server/releases/latest) and open it — Claude Desktop shows an install dialog. The bundle carries the server and its dependencies; Node ships with Claude Desktop, so nothing else is needed. Settings (API endpoint, console URL) are editable in the extension's page.

Build it yourself: `npm run bundle` → `release/light-cloud-<version>.mcpb` (`manifest.json` in this repository is the generated manifest).

### Claude Desktop (manual config)

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
| `connect` | Sign in — or sign up — with an email from the terminal: shows a code to type on `console.light-cloud.com/device` from any device. No browser needed on this machine, no password ever |
| `connect-status` | Wait for the `connect` approval (long-polls ~45 s per call) |
| `login` | Sign in through a browser on this machine (loopback callback) |
| `logout` | Sign out and clear credentials |
| `whoami` | Check authentication status |
| `get-billing` | Plan, card on file, usage pool for a workspace |
| `list-plans` | Plans with prices and entitlements |
| `choose-plan` | Switch plan (paid plans need a card; the refusal says so) |
| `add-payment-method` | Stripe-hosted link to save a card (no card data through the tool) |
| `payment-method-status` | Wait for the card from `add-payment-method` to be saved |
| `list-databases` / `get-database` / `create-database` / `get-database-connection-string` | Managed databases (shared pool by default) |
| `set-environment-variables` / `get-environment-variables` | Environment variables (merge; values masked on read) |
| `set-scaling` | Instance floor / ceiling (always-on when min ≥ 1) |
| `add-custom-domain` / `get-custom-domain-status` | Custom domains |
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

Two ways in; both store credentials in `~/.lightcloud/credentials.json`.

**`connect` (default, works anywhere).** Ask Claude to connect with your
email. The tool prints an 8-character code and the address
`console.light-cloud.com/device`; open it on any device, sign in if you
already have an account (or follow the link in the email we sent if you do
not — approving creates the account), type the code, approve. Claude calls
`connect-status` until the approval lands. No password is typed into
Claude, ever.

**`login` (browser on this machine).** Opens the console's sign-in page
with a loopback callback, as before.

## Refusals an agent can act on

Write tools that hit a plan limit come back with a `code` and a `Next
step:` line, for example `PLAN_ENTITLEMENT → choose-plan`,
`PAYMENT_METHOD_REQUIRED → add-payment-method`, `POOL_EXHAUSTED →
choose-plan`, `ORGANISATION_SUSPENDED → add-payment-method`. The
`deploy-from-scratch` prompt walks the whole path: connect, billing check,
detect, create, database + environment variables, deploy.

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

## Submitting to the Anthropic directory

What the [Software Directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy) asks for and where it is:

- Bundle: the `.mcpb` on the [latest release](https://github.com/light-cloud-com/mcp-server/releases/latest); source in this repository.
- Tool annotations (`title`, `readOnlyHint`, `destructiveHint`) on every tool; descriptions match behaviour; no hidden instructions.
- Privacy policy: https://www.light-cloud.com/legal/privacy-policy · support: https://www.light-cloud.com/contact · docs: https://docs.light-cloud.com/deploy-with-ai/mcp-server
- Example prompts: "Connect me to Light Cloud as you@example.com", "Deploy this project to Light Cloud", "Add a Postgres database and set DATABASE_URL on production", "Why did the last deployment fail? Check the logs".
- Test account with sample data: provided on the submission form.
