# Claude directory: MCP connector submission

Everything to paste into [claude.ai/directory/manage](https://claude.ai/directory/manage) → **Submit new** → **MCP connector**, in the portal's order (10 steps). Background: `platform/docs/mcp/LISTINGS.md` §1. Draft 2026-11-17. Templates are left out on purpose: the gallery is off on production and its tools are hidden there.

## Step 1. Connection

- **Server URL:** `https://mcp.light-cloud.com/mcp` (or pick the Light Cloud custom connector already added in Claude).
- **Users connect to different URLs:** no. One URL for everyone.

## Step 2. Tools

Nothing to type: the tools sync from the server. Expect every tool to be annotated (title, read-only or destructive); no flagged tools. If any tool is flagged, stop and send the name.

## Step 3. Listing

**Server name** (100 max)

Light Cloud

**One-liner** (200 max)

Deploy websites, web apps, APIs and databases on Light Cloud from a conversation. Claude writes the code into your own GitHub repository, puts it live and tells you how it runs.

**Description** (2,000 max; Anthropic cannot edit it after submission)

Light Cloud hosts websites, web apps, APIs and databases. With this connector, Claude works on your Light Cloud account the way you would in the console.

Ask for a site and Claude writes it, puts the code in a new repository in your own GitHub, GitLab or Bitbucket account, and deploys it. Every later change is a commit, and each push redeploys. The code stays yours.

What you can ask:
- The status of your workspace: every app with its state and live address, your databases and your connected git accounts.
- Build and deploy a site, or deploy a repository you already have.
- Read build and runtime logs, find out why a deploy failed, roll back to an earlier deployment.
- Add a PostgreSQL or MySQL database, look at its tables and run queries.
- Set environment variables, scaling, a password on a preview or a custom domain.
- Sort apps and databases into folders.
- Check the plan, the usage and the invoices.

You sign in once on a Light Cloud page and can disconnect Claude at any time under Settings > Security in the console. No account yet? The sign-in page creates one on the free plan, with no card. Claude asks before anything that deletes or changes the plan. Card numbers never pass through the chat, and the connector leaves out the tools that return database connection strings or API keys.

**Categories** (one to five, from the portal's list): the closest to Developer tools and Productivity; add Data or Databases if the list has it.

**Documentation URL:** https://docs.light-cloud.com/deploy-with-ai/mcp-server

**Privacy policy URL:** https://help.light-cloud.com/legal/privacy-policy

**Support contact:** https://light-cloud.com/contact?subject=support

**Icon:** `platform/mcp-server/icon.png` (512×512 PNG)

**URL slug** (permanent once published): `light-cloud`

## Step 4. Use cases

Shown to reviewers, not on the listing.

| | Use case | Example prompt |
| --- | --- | --- |
| 1 | Build and deploy a web app | Build me a small web app, put the code in a new repository and deploy it on Light Cloud. |
| 2 | Monitor apps and fix failed deploys | How are my apps doing? If a deploy failed, read the logs and tell me how to fix it. |
| 3 | Add a database to an app | Add a PostgreSQL database to my app and show me its tables. |

**Prerequisites**

A Light Cloud account. The free plan works, and the sign-in page creates an account on the spot. To create repositories, the user needs a GitHub, GitLab or Bitbucket account connected to Light Cloud; the connector gives the link if none is connected. Databases and custom domains need a paid Light Cloud plan.

**Read/write capabilities:** Read and write.

## Step 5. Company

- **Company name:** Light Cloud
- **Website:** https://light-cloud.com
- **Primary contact for review updates:** Julia, with the email she wants review mail at.

## Step 6. Authentication

- **Authentication requirement:** required (every tool acts on the user's account).
- **Authentication method:** OAuth.
- **OAuth client ID and secret:** leave empty. Claude uses its own published client identity (a client ID metadata document), which the server accepts; dynamic client registration also works.

## Step 7. Data handling

- **Whose API:** our own (Light Cloud's API, not proxied from a partner or a third party).
- **Personal health data:** no.
- **Sponsored content:** no.

## Step 8. Test & launch

- Confirm that every tool was run as a custom connector in Claude. Before ticking: run the production chat tests (`status`; "Create a small HTML page in a new repository and deploy it"; "Change the heading and commit it") and a few read tools (logs, database tables).
- No credentials in the portal. If the listing goes to Verified review, a reviewer asks for test access by email: send the reviewer account (`directory-review@light-cloud.com`, password in `~/.config/light-cloud/directory-reviewer-password`) and the console address `https://console.light-cloud.com`.

## Step 9. Compliance

Tick all seven acknowledgements (directory guidelines, first-party API usage, financial transactions, AI media generation, prompt injection, conversation data collection, public documentation). Notes, if the portal asks:
- **Financial transactions:** plan changes go through Stripe-hosted pages; no card number is ever entered in the chat.
- **AI media generation:** none.
- **Conversation data:** the server sees only tool calls, not the conversation, and stores nothing between requests.

## Step 10. Review and submit

Read the quality warnings, if any, then **Submit**. Afterwards: status and feedback in the portal; escalations to `mcp-review@anthropic.com`. Next: the plugin bundle (`light-cloud-com/skills`, path empty, branch `main`), linked to this connector.
