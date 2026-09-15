#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ApiClient } from "./api-client.js";
import { LightCloudApi } from "./api.js";
import { startNonBlockingLoginFlow, logout as performLogout } from "./auth.js";
import { isAuthenticated } from "./token-storage.js";
import {
  startDeviceConnect,
  waitForConnect,
  getConnectState,
  describePending,
} from "./device-auth.js";
import { detectLocalFramework } from "./detection/framework-detector.js";
import { detectLocalGit } from "./detection/git-detector.js";
import { packageSource } from "./upload/packager.js";
import { readConfig, writeConfig } from "./config/config-manager.js";
import { generateFormattedStatus, generateFormattedList } from "./utils/formatting.js";
import type { LightCloudConfig } from "./types.js";
import * as path from "path";

// Create MCP server instance
// Sent to the client at initialize: what this server can do that a model
// would not guess from tool names alone — above all that an account can be
// created from here, so "sign me up for Light Cloud" maps to `connect`.
const SERVER_INSTRUCTIONS = [
  "Light Cloud: deploy and run web apps, APIs and databases. This server covers the whole path from no account to a running app on a paid plan, without the web console.",
  "",
  "ACCOUNTS: `connect` with an email signs the user in AND creates the account if the email has none (free plan, no password, no form). Use it whenever the user has no Light Cloud account, wants to sign up, or is not signed in. It prints a short code; the user approves it at console.light-cloud.com/device on any device; call `connect-status` until approved. Never ask the user for a password. `login` is the alternative that opens a browser on this machine.",
  "",
  "BILLING: `get-billing` (plan, card, usage pool), `list-plans`, `choose-plan`. A card is added with `add-payment-method` (Stripe-hosted link the user opens anywhere; poll `payment-method-status`). No card number ever passes through a tool.",
  "",
  "DEPLOY: `detect-local-framework` then `upload-and-deploy` for a local folder, or `create-application` from a GitHub repository. Databases: `create-database` (shared pool by default) then `get-database-connection-string` and `set-environment-variables`. Custom domains, scaling and logs have their own tools.",
  "",
  "REFUSALS: an error that ends with `Next step: call X` means call tool X (choose-plan, add-payment-method, connect) and retry — do not stop. The `deploy-from-scratch` prompt walks the full path in order.",
].join("\n");

const server = new McpServer(
  {
    name: "light-cloud",
    version: "1.4.1",
  },
  { instructions: SERVER_INSTRUCTIONS }
);

// Initialize API client and API wrapper
let apiClient: ApiClient;
let api: LightCloudApi;

function getClient(): ApiClient {
  if (!apiClient) apiClient = new ApiClient();
  return apiClient;
}

function getApi(): LightCloudApi {
  if (!api) {
    api = new LightCloudApi(getClient());
  }
  return api;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

const text = (value: string): ToolResult => ({ content: [{ type: "text", text: value }] });

/**
 * A refusal the backend tagged with a next step ("PLAN_ENTITLEMENT →
 * choose-plan", "PAYMENT_METHOD_REQUIRED → add-payment-method") comes back
 * as a one-line instruction, so the agent acts on it instead of giving up.
 */
function formatError(error?: { code: string; message: string; nextStep?: string }): string {
  const code = error?.code || "UNKNOWN";
  const message = error?.message || "Unknown error";
  const hint = error?.nextStep
    ? `\nNext step: call the \`${error.nextStep}\` tool, then retry this one.`
    : "";
  return `Error: ${message} (${code})${hint}`;
}

// Helper to format API responses
function formatResponse(result: { success: boolean; data?: unknown; error?: { code: string; message: string; nextStep?: string } }): ToolResult {
  if (result.success) {
    return text(JSON.stringify(result.data, null, 2));
  }
  return text(formatError(result.error));
}

// Tool annotations (MCP spec): what a host may assume before calling.
// readOnlyHint: no state change. destructiveHint: irreversible. openWorldHint:
// talks to the Light Cloud API (all of them) — set once here so no tool
// registers without them.
const ANNOTATIONS: Record<string, { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean }> = {
  "ping": { title: "Ping", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "login": { title: "Login", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "logout": { title: "Logout", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  "connect": { title: "Connect", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "connect-status": { title: "Connect status", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "whoami": { title: "Whoami", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-profile": { title: "Get profile", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "list-applications": { title: "List applications", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-application": { title: "Get application", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-application-status": { title: "Get application status", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "create-application": { title: "Create application", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "create-application-from-upload": { title: "Create application from upload", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "deploy-application": { title: "Deploy application", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "delete-application": { title: "Delete application", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  "detect-framework": { title: "Detect framework", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "list-environments": { title: "List environments", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-environment": { title: "Get environment", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "create-environment": { title: "Create environment", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "deploy-environment": { title: "Deploy environment", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "delete-environment": { title: "Delete environment", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  "get-environment-logs": { title: "Get environment logs", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "list-deployments": { title: "List deployments", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-deployment": { title: "Get deployment", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-github-install-url": { title: "Get GitHub install URL", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-github-installation-status": { title: "Get GitHub installation status", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "list-github-installations": { title: "List GitHub installations", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "list-repositories": { title: "List repositories", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "list-branches": { title: "List branches", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "check-repo-access": { title: "Check repo access", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "request-upload-url": { title: "Request upload URL", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "complete-upload": { title: "Complete upload", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "get-platform-config": { title: "Get platform config", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-cloudrun-config": { title: "Get Cloud Run config", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "detect-local-framework": { title: "Detect local framework", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "detect-local-git": { title: "Detect local git", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "package-source": { title: "Package source", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "upload-and-deploy": { title: "Upload and deploy", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "get-formatted-status": { title: "Get formatted status", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-formatted-list": { title: "Get formatted list", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "read-project-config": { title: "Read project config", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "write-project-config": { title: "Write project config", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-billing": { title: "Get billing", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "list-plans": { title: "List plans", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "choose-plan": { title: "Choose plan", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "add-payment-method": { title: "Add payment method", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "payment-method-status": { title: "Payment method status", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "list-databases": { title: "List databases", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-database": { title: "Get database", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "create-database": { title: "Create database", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "get-database-connection-string": { title: "Get database connection string", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "set-environment-variables": { title: "Set environment variables", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "get-environment-variables": { title: "Get environment variables", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "set-scaling": { title: "Set scaling", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  "add-custom-domain": { title: "Add custom domain", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  "get-custom-domain-status": { title: "Get custom domain status", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
};

// ============ Health Check ============

server.tool("ping", "Health check - returns pong", {}, ANNOTATIONS["ping"], async () => {
  return { content: [{ type: "text", text: "pong" }] };
});

// ============ Authentication Tools ============

server.tool(
  "login",
  "Sign in to Light Cloud through a browser on THIS machine (loopback callback). Prefer `connect` — it works without a local browser and also creates the account for a new email.",
  {},
  ANNOTATIONS["login"],
  async () => {
    if (isAuthenticated()) {
      // Already logged in, verify token is valid
      const result = await getApi().getProfile();
      if (result.success && result.data) {
        return {
          content: [{
            type: "text",
            text: `Already logged in as ${result.data.email}. Use logout first if you want to switch accounts.`
          }]
        };
      }
    }

    const result = startNonBlockingLoginFlow();
    return {
      content: [{ type: "text", text: result.message }]
    };
  }
);

server.tool(
  "logout",
  "Sign out of Light Cloud",
  {},
  ANNOTATIONS["logout"],
  async () => {
    const result = performLogout();
    return {
      content: [{ type: "text", text: result.message }]
    };
  }
);

server.tool(
  "connect",
  "SIGN UP or sign in to Light Cloud with an email — the only account step needed. An email with no account gets one " +
  "(free plan, no password, no form) when the user approves a short code at console.light-cloud.com/device from any device; " +
  "an existing account just signs in. No browser is needed on this machine. Then call connect-status to wait for the approval. " +
  "Use this whenever the user is not signed in, has no account, or asks to sign up / create an account / get started.",
  {
    email: z.string().describe("The email address to sign in (or sign up) with"),
  },
  ANNOTATIONS["connect"],
  async ({ email }) => {
    if (isAuthenticated()) {
      const result = await getApi().getProfile();
      if (result.success && result.data) {
        return text(`Already signed in as ${result.data.email}. Use logout first to switch accounts.`);
      }
    }
    const started = await startDeviceConnect(getClient(), email.trim().toLowerCase());
    if (!started.ok) return text(`Error: ${started.message}`);
    return text(describePending(started.state));
  }
);

server.tool(
  "connect-status",
  "Wait for a pending `connect` sign-in to be approved (up to ~45 seconds per call). " +
  "Call again while it reports pending. Returns the signed-in account once approved.",
  {},
  ANNOTATIONS["connect-status"],
  async () => {
    const state = await waitForConnect(45_000);
    switch (state.phase) {
      case "idle":
        return text(isAuthenticated()
          ? "No sign-in is pending; you are signed in. Use whoami for details."
          : "No sign-in is pending. Call connect with an email address first.");
      case "pending":
        return text(`Still waiting for approval of code ${state.userCode} at ${state.verificationUrl}. Call connect-status again.`);
      case "approved": {
        const profile = await getApi().getProfile();
        const orgs = profile.success && profile.data
          ? profile.data.organisations.map((o) => `  - ${o.name} (id: ${o.id}, ${o.role})`).join("\n")
          : "  (could not load workspaces yet — call whoami)";
        return text(
          `${state.newAccount ? "Account created and signed in" : "Signed in"} as ${state.email}.\n\nWorkspaces:\n${orgs}\n\n` +
          (state.newAccount
            ? "The workspace is on the free plan; a card is only needed for a paid plan (see list-plans / add-payment-method)."
            : "Use get-billing to check the plan before creating resources.")
        );
      }
      case "denied":
        return text(`Sign-in for ${state.email} was refused in the browser. Call connect again if that was a mistake.`);
      case "expired":
        return text(`The code for ${state.email} expired before it was approved. Call connect again for a new one.`);
      case "error":
        return text(`Error: ${state.message}`);
    }
  }
);

server.tool(
  "whoami",
  "Check authentication status and show current user",
  {},
  ANNOTATIONS["whoami"],
  async () => {
    if (!isAuthenticated()) {
      const pending = getConnectState();
      if (pending.phase === "pending") {
        return text(`Not signed in yet — waiting for code ${pending.userCode} to be approved at ${pending.verificationUrl}. Call connect-status.`);
      }
      return text("Not signed in. Call connect with your email (works anywhere), or login (opens a browser on this machine).");
    }

    const result = await getApi().getProfile();
    if (result.success && result.data) {
      const user = result.data;
      const orgs = user.organisations.map(o => `  - ${o.name} (id: ${o.id}, ${o.slug}) - ${o.role}`).join('\n');
      return {
        content: [{
          type: "text",
          text: `Logged in as: ${user.email}\nName: ${user.first_name || ''} ${user.last_name || ''}\n\nOrganizations:\n${orgs}`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: "Session expired or invalid. Please login again."
      }]
    };
  }
);

server.tool(
  "get-profile",
  "Get the current user profile and list of organizations",
  {},
  ANNOTATIONS["get-profile"],
  async () => {
    const result = await getApi().getProfile();
    return formatResponse(result);
  }
);

// ============ Application Tools ============

server.tool(
  "list-applications",
  "List all applications in an organization",
  {
    organisation_id: z.string().describe("The organization ID to list applications for"),
  },
  ANNOTATIONS["list-applications"],
  async ({ organisation_id }) => {
    const result = await getApi().listApplications(organisation_id);
    return formatResponse(result);
  }
);

server.tool(
  "get-application",
  "Get details of a specific application",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID to get details for"),
  },
  ANNOTATIONS["get-application"],
  async ({ organisation_id, application_id }) => {
    const result = await getApi().getApplication(organisation_id, application_id);
    return formatResponse(result);
  }
);

server.tool(
  "get-application-status",
  "Get the current status of an application",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID to get status for"),
  },
  ANNOTATIONS["get-application-status"],
  async ({ organisation_id, application_id }) => {
    const result = await getApi().getApplicationStatus(organisation_id, application_id);
    return formatResponse(result);
  }
);

server.tool(
  "create-application",
  "Create a new application from a GitHub, GitLab or Bitbucket repository",
  {
    organisation_id: z.string().describe("The organization ID to create the application in"),
    name: z.string().describe("The name for the new application"),
    github_repo_url: z.string().describe("The repository URL (e.g., https://github.com/owner/repo, https://gitlab.com/group/project, https://bitbucket.org/workspace/repo). The provider is inferred from the host."),
    github_branch: z.string().optional().describe("The branch to deploy from (defaults to main/master)"),
    git_provider: z.enum(["github", "gitlab", "bitbucket"]).optional().describe("Force the git provider; needed for self-hosted GitLab where the URL host is not gitlab.com"),
    gitlab_project_id: z.string().optional().describe("GitLab project id or full path (self-hosted GitLab)"),
    bitbucket_repo_uuid: z.string().optional().describe("Bitbucket repository UUID, when known"),
    root_directory: z.string().optional().describe("Repo-relative folder to build from, for monorepos (e.g., 'apps/web')"),
    deployment_type: z.enum(["static", "container"]).describe("Deployment type: 'static' for static sites, 'container' for server applications"),
    framework: z.string().optional().describe("The framework id, validated by the backend registry. Common values: react, nextjs, nuxt, sveltekit, remix, astro, vue, angular, svelte, express, fastify, nestjs, django, flask, fastapi, gin, springboot, rails, laravel, html"),
    runtime: z.enum(["nodejs", "python", "go", "java", "ruby", "php", "dotnet", "custom"]).optional().describe("The runtime environment"),
    build_command: z.string().optional().describe("Custom build command (e.g., 'npm run build')"),
    output_directory: z.string().optional().describe("Build output directory (e.g., 'dist', 'build')"),
    environment_vars: z.record(z.string(), z.string()).optional().describe("Environment variables as key-value pairs"),
    container_port: z.number().int().optional().describe("Port the container listens on (container apps)"),
    min_instances: z.number().int().min(0).optional().describe("Minimum running instances; 0 scales to zero when idle (container apps)"),
    max_instances: z.number().int().min(1).optional().describe("Maximum instances (container apps)"),
    auto_deploy_on_push: z.boolean().optional().describe("Redeploy automatically on every push to the deployed branch"),
  },
  ANNOTATIONS["create-application"],
  async ({
    organisation_id,
    name,
    github_repo_url,
    github_branch,
    git_provider,
    gitlab_project_id,
    bitbucket_repo_uuid,
    root_directory,
    deployment_type,
    framework,
    runtime,
    build_command,
    output_directory,
    environment_vars,
    container_port,
    min_instances,
    max_instances,
    auto_deploy_on_push,
  }) => {
    const result = await getApi().createApplication({
      targetOrganisationId: organisation_id,
      name,
      githubRepoUrl: github_repo_url,
      githubBranch: github_branch,
      gitProvider: git_provider,
      gitlabProjectId: gitlab_project_id,
      bitbucketRepoUuid: bitbucket_repo_uuid,
      rootDirectory: root_directory,
      deploymentType: deployment_type,
      framework,
      runtime,
      buildCommand: build_command,
      outputDirectory: output_directory,
      environmentVars: environment_vars as Record<string, string> | undefined,
      containerPort: container_port,
      minInstances: min_instances,
      maxInstances: max_instances,
      autoDeployOnPush: auto_deploy_on_push,
    });
    return formatResponse(result);
  }
);

server.tool(
  "create-application-from-upload",
  "Create a new application from an uploaded source archive",
  {
    organisation_id: z.string().describe("The organization ID to create the application in"),
    name: z.string().describe("The name for the new application"),
    upload_id: z.string().describe("The upload ID from a completed upload"),
    deployment_type: z.enum(["static", "container"]).describe("Deployment type: 'static' for static sites, 'container' for server applications"),
    framework: z.string().optional().describe("The framework id, validated by the backend registry. Common values: react, nextjs, nuxt, sveltekit, remix, astro, vue, angular, svelte, express, fastify, nestjs, django, flask, fastapi, gin, springboot, rails, laravel, html"),
    runtime: z.enum(["nodejs", "python", "go", "java", "ruby", "php", "dotnet", "custom"]).optional().describe("The runtime environment"),
    build_command: z.string().optional().describe("Custom build command"),
    output_directory: z.string().optional().describe("Build output directory"),
    environment_vars: z.record(z.string(), z.string()).optional().describe("Environment variables as key-value pairs"),
  },
  ANNOTATIONS["create-application-from-upload"],
  async ({
    organisation_id,
    name,
    upload_id,
    deployment_type,
    framework,
    runtime,
    build_command,
    output_directory,
    environment_vars,
  }) => {
    const result = await getApi().createApplicationFromUpload({
      targetOrganisationId: organisation_id,
      name,
      uploadId: upload_id,
      deploymentType: deployment_type,
      framework,
      runtime,
      buildCommand: build_command,
      outputDirectory: output_directory,
      environmentVars: environment_vars as Record<string, string> | undefined,
    });
    return formatResponse(result);
  }
);

server.tool(
  "deploy-application",
  "Trigger a new deployment. Without environment_id the production environment is rebuilt; with it, that environment is deployed instead.",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID to deploy"),
    environment_id: z.string().optional().describe("Deploy this environment instead of production"),
    upload_id: z.string().optional().describe("Completed upload ID holding the new source archive (upload-based apps). Without it the archive the app was created from is rebuilt."),
  },
  ANNOTATIONS["deploy-application"],
  async ({ organisation_id, application_id, environment_id, upload_id }) => {
    if (environment_id) {
      if (upload_id) {
        return {
          content: [{ type: "text", text: "Error: upload_id applies to the whole application; omit environment_id to redeploy a new archive." }],
        };
      }
      return formatResponse(await getApi().deployEnvironment(organisation_id, environment_id));
    }
    const result = await getApi().deployApplication({
      targetOrganisationId: organisation_id,
      applicationId: application_id,
      uploadId: upload_id,
    });
    return formatResponse(result);
  }
);

server.tool(
  "delete-application",
  "Delete an application and all its environments",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID to delete"),
  },
  ANNOTATIONS["delete-application"],
  async ({ organisation_id, application_id }) => {
    const result = await getApi().deleteApplication(organisation_id, application_id);
    if (result.success) {
      return { content: [{ type: "text", text: "Application deleted successfully" }] };
    }
    return formatResponse(result);
  }
);

server.tool(
  "detect-framework",
  "Auto-detect framework and configuration from a GitHub repository",
  {
    organisation_id: z.string().describe("The organization ID"),
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
    branch: z.string().describe("Branch to analyze"),
  },
  ANNOTATIONS["detect-framework"],
  async ({ organisation_id, owner, repo, branch }) => {
    const result = await getApi().detectFramework(organisation_id, owner, repo, branch);
    return formatResponse(result);
  }
);

// ============ Environment Tools ============

server.tool(
  "list-environments",
  "List all environments for an application",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID to list environments for"),
  },
  ANNOTATIONS["list-environments"],
  async ({ organisation_id, application_id }) => {
    const result = await getApi().listEnvironments(organisation_id, application_id);
    return formatResponse(result);
  }
);

server.tool(
  "get-environment",
  "Get details of a specific environment",
  {
    organisation_id: z.string().describe("The organization ID"),
    environment_id: z.string().describe("The environment ID to get details for"),
  },
  ANNOTATIONS["get-environment"],
  async ({ organisation_id, environment_id }) => {
    const result = await getApi().getEnvironment(organisation_id, environment_id);
    return formatResponse(result);
  }
);

server.tool(
  "create-environment",
  "Create a new environment for an application",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID to create the environment for"),
    name: z.string().describe("Name for the new environment (e.g., 'staging', 'preview')"),
    branch: z.string().describe("Git branch to deploy for this environment"),
  },
  ANNOTATIONS["create-environment"],
  async ({ organisation_id, application_id, name, branch }) => {
    const result = await getApi().createEnvironment(organisation_id, application_id, name, branch);
    return formatResponse(result);
  }
);

server.tool(
  "deploy-environment",
  "Trigger a new deployment for a specific environment",
  {
    organisation_id: z.string().describe("The organization ID"),
    environment_id: z.string().describe("The environment ID to deploy"),
  },
  ANNOTATIONS["deploy-environment"],
  async ({ organisation_id, environment_id }) => {
    const result = await getApi().deployEnvironment(organisation_id, environment_id);
    return formatResponse(result);
  }
);

server.tool(
  "delete-environment",
  "Delete an environment",
  {
    organisation_id: z.string().describe("The organization ID"),
    environment_id: z.string().describe("The environment ID to delete"),
  },
  ANNOTATIONS["delete-environment"],
  async ({ organisation_id, environment_id }) => {
    const result = await getApi().deleteEnvironment(organisation_id, environment_id);
    if (result.success) {
      return { content: [{ type: "text", text: "Environment deleted successfully" }] };
    }
    return formatResponse(result);
  }
);

server.tool(
  "get-environment-logs",
  "Get runtime logs for a backend (container) environment, newest first",
  {
    organisation_id: z.string().describe("The organization ID"),
    environment_id: z.string().describe("The environment ID to get logs for"),
    hours: z.number().optional().describe("How far back to look, in hours (default 1)"),
    limit: z.number().optional().describe("Maximum lines to return (default 100, max 500)"),
    search: z.string().optional().describe("Only lines containing this text"),
    revision: z.string().optional().describe("Only lines from this Cloud Run revision"),
    instance_id: z.string().optional().describe("Only lines from this container instance"),
    source: z.enum(["app", "request", "system"]).optional().describe("Log stream: 'app' (stdout/stderr), 'request' (HTTP access log), 'system' (platform). Default: all"),
    severity: z.array(z.enum(["DEFAULT", "DEBUG", "INFO", "NOTICE", "WARNING", "ERROR", "CRITICAL", "ALERT", "EMERGENCY"])).optional().describe("Only these severities"),
  },
  ANNOTATIONS["get-environment-logs"],
  async ({ organisation_id, environment_id, hours, limit, search, revision, instance_id, source, severity }) => {
    const result = await getApi().getEnvironmentLogs(organisation_id, environment_id, {
      hours,
      limit,
      search,
      revision,
      instanceId: instance_id,
      source,
      severity,
    });
    if (result.success && result.data) {
      const lines = result.data.logs.map((entry) => {
        const message =
          entry.textPayload ??
          (typeof entry.jsonPayload?.message === "string"
            ? entry.jsonPayload.message
            : entry.jsonPayload
              ? JSON.stringify(entry.jsonPayload)
              : entry.httpRequest
                ? `${entry.httpRequest.requestMethod ?? ""} ${entry.httpRequest.requestUrl ?? ""} ${entry.httpRequest.status ?? ""}`.trim()
                : "");
        const tag = entry.source === "system" ? " [system]" : "";
        const rev = entry.resource?.labels?.revision_name
          ? ` (${entry.resource.labels.revision_name})`
          : "";
        return `${entry.timestamp} ${entry.severity}${tag}${rev} ${message}`;
      });
      const footer = result.data.hasMore ? "\n… more lines available; narrow with search, revision, source, severity or hours." : "";
      return {
        content: [{ type: "text", text: (lines.join("\n") || "No logs in this window") + footer }],
      };
    }
    return formatResponse(result);
  }
);

// ============ Deployment Tools ============

server.tool(
  "list-deployments",
  "List deployments for an environment",
  {
    organisation_id: z.string().describe("The organization ID"),
    environment_id: z.string().describe("The environment ID to list deployments for"),
    limit: z.number().int().optional().describe("Page size (default 20, max 20)"),
    offset: z.number().int().optional().describe("Skip this many, newest first (default 0)"),
  },
  ANNOTATIONS["list-deployments"],
  async ({ organisation_id, environment_id, limit, offset }) => {
    const result = await getApi().listDeployments(organisation_id, environment_id, { limit, offset });
    return formatResponse(result);
  }
);

server.tool(
  "get-deployment",
  "Get details of a specific deployment",
  {
    organisation_id: z.string().describe("The organization ID"),
    deployment_id: z.string().describe("The deployment ID to get details for"),
  },
  ANNOTATIONS["get-deployment"],
  async ({ organisation_id, deployment_id }) => {
    const result = await getApi().getDeployment(organisation_id, deployment_id);
    return formatResponse(result);
  }
);

// ============ GitHub Integration Tools ============

server.tool(
  "get-github-install-url",
  "Get the URL to install the Light Cloud GitHub App",
  {},
  ANNOTATIONS["get-github-install-url"],
  async () => {
    const result = await getApi().getGitHubInstallUrl();
    return formatResponse(result);
  }
);

server.tool(
  "get-github-installation-status",
  "Check whether the Light Cloud GitHub App is installed for a repository within an organization (and can read that repository)",
  {
    organisation_id: z.string().describe("The organization ID"),
    owner: z.string().describe("GitHub repository owner (user or org login)"),
    repo: z.string().describe("GitHub repository name"),
  },
  ANNOTATIONS["get-github-installation-status"],
  async ({ organisation_id, owner, repo }) => {
    const result = await getApi().getGitHubInstallationStatus(organisation_id, owner, repo);
    return formatResponse(result);
  }
);

server.tool(
  "list-github-installations",
  "List all GitHub App installations",
  {},
  ANNOTATIONS["list-github-installations"],
  async () => {
    const result = await getApi().listGitHubInstallations();
    return formatResponse(result);
  }
);

server.tool(
  "list-repositories",
  "List GitHub repositories accessible to an organization",
  {
    organisation_id: z.string().describe("The organization ID"),
  },
  ANNOTATIONS["list-repositories"],
  async ({ organisation_id }) => {
    const result = await getApi().listRepositories(organisation_id);
    return formatResponse(result);
  }
);

server.tool(
  "list-branches",
  "List branches in a GitHub repository",
  {
    organisation_id: z.string().describe("The organization ID"),
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
  },
  ANNOTATIONS["list-branches"],
  async ({ organisation_id, owner, repo }) => {
    const result = await getApi().listBranches(organisation_id, owner, repo);
    return formatResponse(result);
  }
);

server.tool(
  "check-repo-access",
  "Check if an organization has access to specific GitHub accounts",
  {
    organisation_id: z.string().describe("The organization ID"),
    account_logins: z.array(z.string()).describe("List of GitHub account logins to check"),
  },
  ANNOTATIONS["check-repo-access"],
  async ({ organisation_id, account_logins }) => {
    const result = await getApi().checkRepoAccess(organisation_id, account_logins);
    return formatResponse(result);
  }
);

// ============ Upload Tools ============

server.tool(
  "request-upload-url",
  "Request a signed URL to upload source code",
  {
    organisation_id: z.string().describe("The organization ID"),
    file_name: z.string().optional().describe("Name of the file being uploaded"),
    content_type: z.string().optional().describe("MIME type of the file (default: application/zip)"),
    file_size: z.number().optional().describe("Size of the file in bytes"),
  },
  ANNOTATIONS["request-upload-url"],
  async ({ organisation_id, file_name, content_type, file_size }) => {
    const result = await getApi().requestUploadUrl({
      targetOrganisationId: organisation_id,
      fileName: file_name,
      contentType: content_type,
      fileSize: file_size,
    });
    return formatResponse(result);
  }
);

server.tool(
  "complete-upload",
  "Mark an upload as complete with optional detection metadata",
  {
    organisation_id: z.string().describe("The organization ID"),
    upload_id: z.string().describe("The upload ID to mark as complete"),
    detected_framework: z.string().optional().describe("Detected framework"),
    detected_runtime: z.string().optional().describe("Detected runtime"),
    detected_deployment_type: z.enum(["static", "container"]).optional().describe("Detected deployment type"),
    detected_build_command: z.string().optional().describe("Detected build command"),
    detected_output_directory: z.string().optional().describe("Detected output directory"),
  },
  ANNOTATIONS["complete-upload"],
  async ({
    organisation_id,
    upload_id,
    detected_framework,
    detected_runtime,
    detected_deployment_type,
    detected_build_command,
    detected_output_directory,
  }) => {
    const result = await getApi().completeUpload(organisation_id, upload_id, {
      detectedFramework: detected_framework,
      detectedRuntime: detected_runtime,
      detectedDeploymentType: detected_deployment_type,
      detectedBuildCommand: detected_build_command,
      detectedOutputDirectory: detected_output_directory,
    });
    return formatResponse(result);
  }
);

// ============ Config Tools ============

server.tool(
  "get-platform-config",
  "Get Light Cloud platform configuration",
  {},
  ANNOTATIONS["get-platform-config"],
  async () => {
    const result = await getApi().getPlatformConfig();
    return formatResponse(result);
  }
);

server.tool(
  "get-cloudrun-config",
  "Get Cloud Run configuration options",
  {},
  ANNOTATIONS["get-cloudrun-config"],
  async () => {
    const result = await getApi().getCloudRunConfig();
    return formatResponse(result);
  }
);

// ============ Local Detection Tools ============

server.tool(
  "detect-local-framework",
  "Detect framework and configuration from a local project directory",
  {
    directory: z.string().optional().describe("Path to project directory. Defaults to current working directory."),
  },
  ANNOTATIONS["detect-local-framework"],
  async ({ directory }) => {
    try {
      const result = detectLocalFramework(directory || process.cwd());
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error detecting framework: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

server.tool(
  "detect-local-git",
  "Detect Git repository information from a local project directory",
  {
    directory: z.string().optional().describe("Path to project directory. Defaults to current working directory."),
  },
  ANNOTATIONS["detect-local-git"],
  async ({ directory }) => {
    try {
      const result = detectLocalGit(directory || process.cwd());
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error detecting git info: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// ============ Source Packaging Tool ============

server.tool(
  "package-source",
  "Package a local project directory into a zip archive for upload",
  {
    directory: z.string().optional().describe("Path to project directory. Defaults to current working directory."),
  },
  ANNOTATIONS["package-source"],
  async ({ directory }) => {
    try {
      const result = await packageSource({ directory: directory || process.cwd() });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            base64: result.base64,
            fileCount: result.fileCount,
            totalSize: result.totalSize,
            excludedCount: result.excludedCount,
            sizeBytes: result.buffer.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error packaging source: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// ============ Upload and Deploy Workflow Tool ============

server.tool(
  "upload-and-deploy",
  "Complete workflow to package, upload, and deploy a local project",
  {
    organisation_id: z.string().describe("Organization to deploy to"),
    directory: z.string().optional().describe("Path to project directory. Defaults to current working directory."),
    application_id: z.string().optional().describe("Existing application ID to redeploy to"),
    name: z.string().optional().describe("Application name. Defaults to folder name for new apps."),
  },
  ANNOTATIONS["upload-and-deploy"],
  async ({ organisation_id, directory, application_id, name }) => {
    try {
      const projectDir = directory || process.cwd();

      // Step 1: Detect framework
      const frameworkDetection = detectLocalFramework(projectDir);

      // Step 2: Detect git info
      const gitDetection = detectLocalGit(projectDir);

      // Step 3: Read existing config if no application_id provided
      let appId = application_id;
      const existingConfig = readConfig(projectDir);
      if (!appId && existingConfig?.applicationId) {
        appId = existingConfig.applicationId;
      }

      // Step 4: Package source
      const packageResult = await packageSource({ directory: projectDir });

      // Step 5: Request upload URL
      const uploadUrlResult = await getApi().requestUploadUrl({
        targetOrganisationId: organisation_id,
        fileName: 'source.zip',
        contentType: 'application/zip',
        fileSize: packageResult.buffer.length,
      });

      if (!uploadUrlResult.success || !uploadUrlResult.data) {
        return {
          content: [{ type: "text", text: `Error requesting upload URL: ${uploadUrlResult.error?.message || 'Unknown error'}` }],
        };
      }

      // Step 6: Upload to GCS
      const uploadResponse = await fetch(uploadUrlResult.data.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/zip',
        },
        body: new Uint8Array(packageResult.buffer),
      });

      if (!uploadResponse.ok) {
        return {
          content: [{ type: "text", text: `Error uploading source: ${uploadResponse.statusText}` }],
        };
      }

      // Step 7: Complete upload
      const completeResult = await getApi().completeUpload(organisation_id, uploadUrlResult.data.uploadId, {
        detectedFramework: frameworkDetection.framework,
        detectedRuntime: frameworkDetection.runtime,
        detectedDeploymentType: frameworkDetection.deploymentType,
        detectedBuildCommand: frameworkDetection.buildCommand,
        detectedOutputDirectory: frameworkDetection.outputDirectory,
      });

      if (!completeResult.success) {
        return {
          content: [{ type: "text", text: `Error completing upload: ${completeResult.error?.message || 'Unknown error'}` }],
        };
      }

      // Step 8: Create or deploy application
      let appResult;
      const appName = name || path.basename(projectDir);

      if (appId) {
        // Redeploy existing application from the archive just uploaded —
        // without uploadId the backend rebuilds the original one.
        appResult = await getApi().deployApplication({
          targetOrganisationId: organisation_id,
          applicationId: appId,
          uploadId: uploadUrlResult.data.uploadId,
        });
      } else {
        // Create new application from upload
        appResult = await getApi().createApplicationFromUpload({
          targetOrganisationId: organisation_id,
          name: appName,
          uploadId: uploadUrlResult.data.uploadId,
          deploymentType: frameworkDetection.deploymentType,
          framework: frameworkDetection.framework,
          runtime: frameworkDetection.runtime,
          buildCommand: frameworkDetection.buildCommand,
          outputDirectory: frameworkDetection.outputDirectory,
        });
      }

      if (!appResult.success || !appResult.data) {
        return {
          content: [{ type: "text", text: `Error ${appId ? 'deploying' : 'creating'} application: ${appResult.error?.message || 'Unknown error'}` }],
        };
      }

      // Step 9: Save config for future deployments
      const newConfig: LightCloudConfig = {
        organisationId: organisation_id,
        applicationId: 'id' in appResult.data ? appResult.data.id : appId,
        applicationName: appName,
        framework: frameworkDetection.framework,
        deploymentType: frameworkDetection.deploymentType,
      };
      writeConfig(newConfig, projectDir);

      // Return success response
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            action: appId ? 'redeployed' : 'created',
            application: appResult.data,
            detection: {
              framework: frameworkDetection,
              git: gitDetection,
            },
            package: {
              fileCount: packageResult.fileCount,
              totalSize: packageResult.totalSize,
              archiveSize: packageResult.buffer.length,
            },
            configSaved: true,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error in upload-and-deploy: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// ============ Enhanced Formatting Tools ============

server.tool(
  "get-formatted-status",
  "Get application status with enhanced formatting (markdown tables, emojis)",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID to get status for"),
  },
  ANNOTATIONS["get-formatted-status"],
  async ({ organisation_id, application_id }) => {
    // Get application with environments
    const appResult = await getApi().getApplication(organisation_id, application_id);

    if (!appResult.success || !appResult.data) {
      return formatResponse(appResult);
    }

    // Get environments if not included
    let app = appResult.data;
    if (!app.environments) {
      const envResult = await getApi().listEnvironments(organisation_id, application_id);
      if (envResult.success && envResult.data) {
        app = { ...app, environments: envResult.data };
      }
    }

    // Get organisation slug for dashboard links
    const profileResult = await getApi().getProfile();
    let orgSlug: string | undefined;
    if (profileResult.success && profileResult.data) {
      const org = profileResult.data.organisations.find(o => o.id === organisation_id);
      orgSlug = org?.slug;
    }

    const formatted = generateFormattedStatus(app, orgSlug);
    return {
      content: [{ type: "text", text: formatted }],
    };
  }
);

server.tool(
  "get-formatted-list",
  "Get formatted list of all applications with markdown tables and emojis",
  {
    organisation_id: z.string().describe("The organization ID to list applications for"),
  },
  ANNOTATIONS["get-formatted-list"],
  async ({ organisation_id }) => {
    const result = await getApi().listApplications(organisation_id);

    if (!result.success || !result.data) {
      return formatResponse(result);
    }

    // Get organisation slug for dashboard links
    const profileResult = await getApi().getProfile();
    let orgSlug: string | undefined;
    if (profileResult.success && profileResult.data) {
      const org = profileResult.data.organisations.find(o => o.id === organisation_id);
      orgSlug = org?.slug;
    }

    const formatted = generateFormattedList(result.data, orgSlug);
    return {
      content: [{ type: "text", text: formatted }],
    };
  }
);

// ============ Project Configuration Tools ============

server.tool(
  "read-project-config",
  "Read .lightcloud config file from a project directory",
  {
    directory: z.string().optional().describe("Path to project directory. Defaults to current working directory."),
  },
  ANNOTATIONS["read-project-config"],
  async ({ directory }) => {
    try {
      const config = readConfig(directory || process.cwd());

      if (config === null) {
        return {
          content: [{ type: "text", text: "No .lightcloud config file found in this directory." }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error reading config: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

server.tool(
  "write-project-config",
  "Write/update .lightcloud config file in a project directory",
  {
    directory: z.string().optional().describe("Path to project directory. Defaults to current working directory."),
    organisation_id: z.string().optional().describe("Organization ID to save"),
    application_id: z.string().optional().describe("Application ID to save"),
    environment_id: z.string().optional().describe("Environment ID to save"),
    application_name: z.string().optional().describe("Application name to save"),
    framework: z.string().optional().describe("Framework id to save, validated by the backend registry (e.g. react, nextjs, sveltekit, django, fastapi)"),
    deployment_type: z.enum(["static", "container"]).optional().describe("Deployment type to save"),
  },
  ANNOTATIONS["write-project-config"],
  async ({ directory, organisation_id, application_id, environment_id, application_name, framework, deployment_type }) => {
    try {
      const config: LightCloudConfig = {};

      if (organisation_id) config.organisationId = organisation_id;
      if (application_id) config.applicationId = application_id;
      if (environment_id) config.environmentId = environment_id;
      if (application_name) config.applicationName = application_name;
      if (framework) config.framework = framework;
      if (deployment_type) config.deploymentType = deployment_type;

      writeConfig(config, directory || process.cwd());

      // Read back the merged config
      const savedConfig = readConfig(directory || process.cwd());

      return {
        content: [{
          type: "text",
          text: `Config saved successfully.\n\n${JSON.stringify(savedConfig, null, 2)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error writing config: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  }
);

// ============ Billing Tools ============

const money = (value: number) => `$${value.toFixed(2)}`;

server.tool(
  "get-billing",
  "Plan, card on file and usage pool for a workspace. Call before creating resources: it says whether a card or a plan change is needed.",
  {
    organisation_id: z.string().describe("The organization ID"),
  },
  ANNOTATIONS["get-billing"],
  async ({ organisation_id }) => {
    const [summary, plans] = await Promise.all([
      getApi().getOwnerBillingSummary(),
      getApi().getPlans(organisation_id),
    ]);
    if (!plans.success || !plans.data) return text(formatError(plans.error));

    const p = plans.data.data;
    const current = p.plans.find((plan) => plan.id === (p.currentPlanId ?? "hobby"));
    const card = summary.success && summary.data ? summary.data.data.payment_method : null;
    const lines = [
      `Plan: ${current ? `${current.name} (${current.id}) — ${money(current.price)}/month` : p.currentPlanId ?? "free"}`,
      p.pendingPlanId ? `Pending change at next cycle: ${p.pendingPlanId}` : null,
      `Card on file: ${card ? `${card.brand} •••• ${card.last4}` : "none"}`,
      `Usage pool this cycle: ${money(p.pool.spent)} of ${money(p.pool.total)} used (${Math.round(p.pool.pct)}%)` +
        (p.pool.overage > 0 ? `, overage ${money(p.pool.overage)}` : ""),
      p.hardStopped
        ? "STATUS: free-plan pool exhausted — projects are paused until an upgrade (choose-plan) or the next cycle."
        : null,
      summary.success && summary.data?.data.billing_cycle.next_billing_date
        ? `Next invoice: ${summary.data.data.billing_cycle.next_billing_date.slice(0, 10)}`
        : null,
      "",
      current && current.price === 0
        ? "Paid plans need a card: add-payment-method, then choose-plan."
        : "Use list-plans to compare plans; choose-plan to change.",
    ].filter((line): line is string => line !== null);
    return text(lines.join("\n"));
  }
);

server.tool(
  "list-plans",
  "The plans a workspace can be on, with prices and what each includes (sizes, always-on, database tiers).",
  {
    organisation_id: z.string().describe("The organization ID"),
  },
  ANNOTATIONS["list-plans"],
  async ({ organisation_id }) => {
    const result = await getApi().getPlans(organisation_id);
    if (!result.success || !result.data) return text(formatError(result.error));
    const p = result.data.data;
    const rows = p.plans.map((plan) => {
      const marker = plan.id === (p.currentPlanId ?? "hobby") ? " (current)" : "";
      const entitlements = plan.entitlements ? `\n    includes: ${JSON.stringify(plan.entitlements)}` : "";
      return `- ${plan.id}: ${plan.name}${marker} — ${money(plan.price)}/month${entitlements}`;
    });
    return text(`Plans:\n${rows.join("\n")}\n\nchoose-plan(plan_id) to switch. Paid plans need a card on file (add-payment-method).`);
  }
);

server.tool(
  "choose-plan",
  "Put a workspace on a plan. Free plan: immediate, no card. Paid plan: charges the card on file for the first month; " +
  "without a card the tool says so — call add-payment-method first. Downgrades take effect at the next cycle.",
  {
    organisation_id: z.string().describe("The organization ID"),
    plan_id: z.string().describe("Plan id from list-plans (e.g. hobby, starter, pro)"),
  },
  ANNOTATIONS["choose-plan"],
  async ({ organisation_id, plan_id }) => {
    const result = await getApi().choosePlan(organisation_id, plan_id);
    if (!result.success || !result.data) return text(formatError(result.error));
    const r = result.data.data;
    if (r.pendingPlanId) {
      return text(`Downgrade scheduled: ${r.planId} until ${r.effectiveAt?.slice(0, 10) ?? "the next cycle"}, then ${r.pendingPlanId}.`);
    }
    const charge = r.proratedCharge > 0 ? ` Charged ${money(r.proratedCharge)} (${r.chargeStatus}).` : "";
    return text(`Workspace is now on plan ${r.planId}.${charge}`);
  }
);

// One card-setup link at a time per MCP process; status polls read it back.
let pendingCheckout: { organisationId: string; sessionId: string; url: string; expiresAt: number; planId?: string } | null = null;

server.tool(
  "add-payment-method",
  "Save a card for a workspace's owner through a Stripe-hosted page. Prints a link to open on any device " +
  "(no card details ever pass through this tool). Then call payment-method-status to wait for the card to be saved. " +
  "Optionally names a plan to switch to once the card is on file.",
  {
    organisation_id: z.string().describe("The organization ID"),
    plan_id: z.string().optional().describe("Plan to switch to once the card is saved (from list-plans)"),
  },
  ANNOTATIONS["add-payment-method"],
  async ({ organisation_id, plan_id }) => {
    const session = await getApi().createCheckoutSession(organisation_id);
    if (!session.success || !session.data) {
      if (session.error?.status === 404) {
        return text("Error: hosted card setup is not enabled on this Light Cloud environment yet. Add a card in the console under Billing → General.");
      }
      return text(formatError(session.error));
    }
    const { url, sessionId, expiresAt } = session.data.data;
    pendingCheckout = {
      organisationId: organisation_id,
      sessionId,
      url,
      expiresAt: new Date(expiresAt).getTime(),
      planId: plan_id,
    };
    return text([
      "Open this link on any device to save a card (Stripe-hosted; the card never passes through here):",
      "",
      url,
      "",
      `The link expires in ${Math.round((pendingCheckout.expiresAt - Date.now()) / 60000)} minutes. Call payment-method-status to wait for it.`,
    ].join("\n"));
  }
);

server.tool(
  "payment-method-status",
  "Wait for the card from add-payment-method to be saved (up to ~45 seconds per call; call again while it reports open). " +
  "Switches the plan afterwards if add-payment-method was given one.",
  {},
  ANNOTATIONS["payment-method-status"],
  async () => {
    if (!pendingCheckout) {
      return text("No card setup is pending. Call add-payment-method first (or get-billing to see the card on file).");
    }
    const { organisationId, sessionId, url, planId } = pendingCheckout;
    const deadline = Math.min(Date.now() + 45_000, pendingCheckout.expiresAt);
    let last: "open" | "complete" | "expired" = "open";
    for (;;) {
      const status = await getApi().getCheckoutSessionStatus(organisationId, sessionId);
      if (status.success && status.data) {
        last = status.data.data.status;
        if (last === "complete") {
          pendingCheckout = null;
          const card = status.data.data.paymentMethod;
          let summary = `Card saved${card ? `: ${card.brand} •••• ${card.last4}` : ""}.`;
          if (planId) {
            const chosen = await getApi().choosePlan(organisationId, planId);
            summary += chosen.success && chosen.data
              ? ` Workspace is now on plan ${chosen.data.data.planId}${chosen.data.data.proratedCharge > 0 ? ` (charged ${money(chosen.data.data.proratedCharge)})` : ""}.`
              : ` Plan change failed: ${formatError(chosen.error)}`;
          }
          return text(summary);
        }
        if (last === "expired") break;
      }
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    if (last === "expired" || Date.now() >= pendingCheckout.expiresAt) {
      pendingCheckout = null;
      return text("The card setup link expired before a card was saved. Call add-payment-method again for a new link.");
    }
    return text(`No card saved yet. The link is still open:\n${url}\nCall payment-method-status again to keep waiting.`);
  }
);

// ============ Database Tools ============

server.tool(
  "list-databases",
  "List the databases in a workspace",
  {
    organisation_id: z.string().describe("The organization ID"),
  },
  ANNOTATIONS["list-databases"],
  async ({ organisation_id }) => formatResponse(await getApi().listDatabases(organisation_id))
);

server.tool(
  "get-database",
  "Details and status of a database (provisioning state, engine, tier, host)",
  {
    organisation_id: z.string().describe("The organization ID"),
    database_id: z.string().describe("The database ID"),
  },
  ANNOTATIONS["get-database"],
  async ({ organisation_id, database_id }) => formatResponse(await getApi().getDatabase(organisation_id, database_id))
);

server.tool(
  "create-database",
  "Create a managed database. Default: a PostgreSQL database on the shared pool (tier shared-dev, included in every plan). " +
  "Dedicated tiers (dev, starter, pro …) depend on the plan — a refusal names the next step. " +
  "Provisioning is asynchronous: poll get-database until status is ready, then get-database-connection-string.",
  {
    organisation_id: z.string().describe("The organization ID"),
    name: z.string().describe("Database name (letters, digits, dashes)"),
    engine: z.enum(["postgresql", "mysql"]).optional().describe("Engine, default postgresql"),
    tier: z.string().optional().describe("shared-dev (default) or a dedicated Cloud SQL tier such as db-f1-micro"),
    project_id: z.string().optional().describe("Folder (project) to create it in; default folder when omitted"),
  },
  ANNOTATIONS["create-database"],
  async ({ organisation_id, name, engine, tier, project_id }) => {
    const result = await getApi().createDatabase({
      targetOrganisationId: organisation_id,
      name,
      databaseType: engine ?? "postgresql",
      tier: tier ?? "shared-dev",
      projectId: project_id,
    });
    return formatResponse(result);
  }
);

server.tool(
  "get-database-connection-string",
  "The connection string for a ready database. Treat it as a secret: put it in an environment variable (set-environment-variables), do not print it into files.",
  {
    organisation_id: z.string().describe("The organization ID"),
    database_id: z.string().describe("The database ID"),
  },
  ANNOTATIONS["get-database-connection-string"],
  async ({ organisation_id, database_id }) =>
    formatResponse(await getApi().getDatabaseConnectionString(organisation_id, database_id))
);

// ============ Environment settings ============

server.tool(
  "set-environment-variables",
  "Set (merge) environment variables on an environment. Existing keys not mentioned are kept; pass an empty string to clear one. " +
  "Redeploy afterwards (deploy-environment) for running code to see them.",
  {
    organisation_id: z.string().describe("The organization ID"),
    environment_id: z.string().describe("The environment ID"),
    variables: z.record(z.string(), z.string()).describe("Key/value pairs to set"),
  },
  ANNOTATIONS["set-environment-variables"],
  async ({ organisation_id, environment_id, variables }) => {
    const current = await getApi().getEnvironment(organisation_id, environment_id);
    if (!current.success) return text(formatError(current.error));
    const existing = ((current.data as unknown as { environment_vars?: Record<string, string> })?.environment_vars) ?? {};
    const merged: Record<string, string> = { ...existing };
    for (const [key, value] of Object.entries(variables)) {
      if (value === "") delete merged[key];
      else merged[key] = value;
    }
    const result = await getApi().updateEnvironment(organisation_id, environment_id, { environmentVars: merged });
    if (!result.success) return text(formatError(result.error));
    return text(`Environment variables saved (${Object.keys(merged).length} keys: ${Object.keys(merged).join(", ") || "none"}). Redeploy for them to take effect.`);
  }
);

server.tool(
  "get-environment-variables",
  "The environment variable names set on an environment (values are shown masked).",
  {
    organisation_id: z.string().describe("The organization ID"),
    environment_id: z.string().describe("The environment ID"),
  },
  ANNOTATIONS["get-environment-variables"],
  async ({ organisation_id, environment_id }) => {
    const current = await getApi().getEnvironment(organisation_id, environment_id);
    if (!current.success) return text(formatError(current.error));
    const vars = ((current.data as unknown as { environment_vars?: Record<string, string> })?.environment_vars) ?? {};
    const rows = Object.entries(vars).map(([k, v]) => `${k}=${v.length > 6 ? `${v.slice(0, 3)}…${v.slice(-2)}` : "•••"}`);
    return text(rows.length ? rows.join("\n") : "No environment variables set.");
  }
);

server.tool(
  "set-scaling",
  "Instance floor and ceiling for an environment. min_instances ≥ 1 keeps it always on (plan permitting — a refusal names the next step).",
  {
    organisation_id: z.string().describe("The organization ID"),
    environment_id: z.string().describe("The environment ID"),
    min_instances: z.number().int().min(0).optional().describe("Minimum running instances (0 = scale to zero)"),
    max_instances: z.number().int().min(1).optional().describe("Maximum instances"),
  },
  ANNOTATIONS["set-scaling"],
  async ({ organisation_id, environment_id, min_instances, max_instances }) =>
    formatResponse(await getApi().scaleEnvironment(organisation_id, environment_id, {
      minInstances: min_instances,
      maxInstances: max_instances,
    }))
);

server.tool(
  "add-custom-domain",
  "Attach a custom domain to an environment. Returns the DNS records to create; then poll get-custom-domain-status.",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID"),
    environment_id: z.string().describe("The environment ID"),
    domain: z.string().describe("Hostname, e.g. app.example.com"),
  },
  ANNOTATIONS["add-custom-domain"],
  async ({ organisation_id, application_id, environment_id, domain }) =>
    formatResponse(await getApi().addCustomDomain(organisation_id, application_id, environment_id, domain))
);

server.tool(
  "get-custom-domain-status",
  "Whether an environment's custom domain has verified and is serving.",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID"),
    environment_id: z.string().describe("The environment ID"),
  },
  ANNOTATIONS["get-custom-domain-status"],
  async ({ organisation_id, application_id, environment_id }) =>
    formatResponse(await getApi().checkCustomDomain(organisation_id, application_id, environment_id))
);

// ============ Guided path ============

server.prompt(
  "deploy-from-scratch",
  "Take a project from no Light Cloud account to a running deployment, from the terminal only.",
  {
    email: z.string().optional().describe("Email to sign in / sign up with, if not signed in yet"),
  },
  ({ email }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Deploy the project in the current directory to Light Cloud using the light-cloud MCP tools. Follow this order and stop to ask me only when a decision is mine to make (which plan, whether to pay).",
            "",
            "1. `whoami`. If not signed in: `connect` with " + (email ? `the email ${email}` : "my email (ask me for it)") + ", show me the code and link, then `connect-status` until approved.",
            "2. `get-billing` for the workspace. On the free plan, continue. If a later step is refused with PLAN_ENTITLEMENT or POOL_EXHAUSTED, show me `list-plans`, ask which plan, then `add-payment-method` (if no card) + `payment-method-status` until saved, and `choose-plan`.",
            "3. `detect-local-framework` and `detect-local-git` in the project directory.",
            "4. Git-backed and pushed to GitHub: `get-github-installation-status`; if not installed, give me `get-github-install-url` and wait; then `create-application` from the repository. Otherwise: `package-source` + `upload-and-deploy`.",
            "5. If detection says the framework needs a database: `create-database` (shared-dev), poll `get-database` until ready, `get-database-connection-string`, and `set-environment-variables` with it under the variable name the framework expects.",
            "6. Any other variables the app needs: ask me, then `set-environment-variables`.",
            "7. `deploy-environment` if anything changed after creation, then `get-formatted-status` until the deployment is ready. Give me the URL.",
            "",
            "Every refusal from a tool that says `Next step: …` means call that tool, then retry. Never ask me for a password or card number — the tools open a browser link for those.",
          ].join("\n"),
        },
      },
    ],
  })
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
