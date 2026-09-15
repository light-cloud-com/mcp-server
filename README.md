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
- **Logs, metrics, rollbacks** - runtime and build logs, environment metrics and activity, one-call rollback
- **Framework detection** - the uploaded folder is read by the same detector the console uses for a repository
- **Password-protected sites** - `password` on deploy gates the site at the edge from the first request
- **Console parity** - settings, folders, stacks, database admin (schema, SQL, dump, import), invoices and spending limits, workspace members, API keys (paid plans), git provider links, notifications, support
- **An off switch you control** - Settings → Security → Agents & CLI in the console decides what agents may do; enforced on the backend

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

110 tools: everything the console can do, from a conversation. Console-only by design: the account password, two-factor settings, and the Agents & CLI switch (below). Full reference with a prompt for each tool: https://docs.light-cloud.com/deploy-with-ai/mcp-server#tool-reference

| Group | Tools |
|-------|-------|
| Account | `connect`, `connect-status`, `login`, `logout`, `whoami`, `get-profile`, `update-profile`, `list-connected-devices`, `sign-out-device`, `get-agent-access` |
| Deploy | `upload-and-deploy` (with optional `password`), `create-application`, `create-stack`, `wait-for-deployment`, `deploy-application`, `deploy-environment`, `rollback-deployment`, `set-password-protection`, `detect-local-framework`, `detect-framework`, `detect-local-git`, `list-repo-directories`, `read-project-config`, `write-project-config` |
| Apps & environments | `list-applications`, `get-application`, `get-application-status`, `get-formatted-list`, `get-formatted-status`, `update-application`, `rename-application`, `move-application`, `delete-application`, `list-environments`, `get-environment`, `create-environment`, `update-environment`, `delete-environment`, `set-scaling`, `get-environment-metrics`, `get-environment-activity`, `get-environment-runtime`, `list-folders`, `create-folder`, `delete-folder` |
| Logs & deployments | `get-environment-logs`, `list-deployments`, `get-deployment`, `get-build-logs` |
| Variables, domains | `set-environment-variables`, `get-environment-variables`, `add-custom-domain`, `get-custom-domain-status`, `retry-custom-domain`, `remove-custom-domain` |
| Databases | `list-databases`, `get-database`, `create-database`, `update-database`, `delete-database`, `get-database-connection-string`, `rotate-database-password`, `get-database-schema`, `query-database`, `get-database-metrics`, `dump-database`, `import-database` |
| Plan & billing | `get-billing`, `list-plans`, `choose-plan`, `add-payment-method`, `payment-method-status`, `remove-payment-method`, `get-usage`, `get-usage-history`, `list-invoices`, `get-invoice`, `retry-invoice`, `get-outstanding-invoices`, `get-spending-limit`, `set-spending-limit`, `get-billing-details`, `set-billing-details` |
| Workspace & members | `create-workspace`, `list-members`, `invite-member`, `remove-member`, `set-member-role`, `list-roles`, `list-api-keys`, `create-api-key` (paid plans), `revoke-api-key` |
| Git providers | `get-github-installation-status`, `get-github-install-url`, `list-github-installations`, `list-repositories`, `list-branches`, `check-repo-access`, `connect-git-provider` (GitLab / Bitbucket, one link), `list-provider-repositories` |
| Other | `list-notifications`, `mark-notifications-read`, `contact-support`, `ping`, `get-platform-config`, `get-cloudrun-config`, and the low-level upload steps (`package-source`, `request-upload-url`, `complete-upload`, `create-application-from-upload`) |

Prompt: `deploy-from-scratch` — asks the two things a folder cannot answer (workspace, public or password-protected), then deploys and hands back the URL.

## Turning agents off

Settings → Security → **Agents & CLI** in the console decides what this server, the CLI and the VS Code extension may do on an account: a master switch, then groups (deploy, delete, settings, databases, billing, workspace, API keys). Reads are always allowed. The backend enforces it from the session's own client claim, fixed when the session was issued, so a header cannot get around it — and the switch can only be changed from the console. A refusal comes back as `AGENT_ACCESS_DISABLED` or `AGENT_ACTION_BLOCKED` with the place to change it; the server's instructions tell the assistant not to retry.

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
