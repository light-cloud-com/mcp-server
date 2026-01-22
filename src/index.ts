#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ApiClient } from "./api-client.js";
import { LightCloudApi } from "./api.js";
import { startNonBlockingLoginFlow, logout as performLogout } from "./auth.js";
import { isAuthenticated } from "./token-storage.js";

// Create MCP server instance
const server = new McpServer({
  name: "light-cloud",
  version: "1.0.0",
});

// Initialize API client and API wrapper
let api: LightCloudApi;

function getApi(): LightCloudApi {
  if (!api) {
    const client = new ApiClient();
    api = new LightCloudApi(client);
  }
  return api;
}

// Helper to format API responses
function formatResponse(result: { success: boolean; data?: unknown; error?: { code: string; message: string } }): {
  content: Array<{ type: "text"; text: string }>;
} {
  if (result.success) {
    return {
      content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
    };
  }
  return {
    content: [{ type: "text", text: `Error: ${result.error?.message || "Unknown error"} (${result.error?.code || "UNKNOWN"})` }],
  };
}

// ============ Health Check ============

server.tool("ping", "Health check - returns pong", {}, async () => {
  return { content: [{ type: "text", text: "pong" }] };
});

// ============ Authentication Tools ============

server.tool(
  "login",
  "Sign in to Light Cloud. Opens a browser window for authentication.",
  {},
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
  async () => {
    const result = performLogout();
    return {
      content: [{ type: "text", text: result.message }]
    };
  }
);

server.tool(
  "whoami",
  "Check authentication status and show current user",
  {},
  async () => {
    if (!isAuthenticated()) {
      return {
        content: [{
          type: "text",
          text: "Not logged in. Use the login tool to authenticate."
        }]
      };
    }

    const result = await getApi().getProfile();
    if (result.success && result.data) {
      const user = result.data;
      const orgs = user.organisations.map(o => `  - ${o.name} (${o.slug}) - ${o.role}`).join('\n');
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
  async ({ organisation_id, application_id }) => {
    const result = await getApi().getApplicationStatus(organisation_id, application_id);
    return formatResponse(result);
  }
);

server.tool(
  "create-application",
  "Create a new application from a GitHub repository",
  {
    organisation_id: z.string().describe("The organization ID to create the application in"),
    name: z.string().describe("The name for the new application"),
    github_repo_url: z.string().describe("The GitHub repository URL (e.g., https://github.com/owner/repo)"),
    github_branch: z.string().optional().describe("The branch to deploy from (defaults to main/master)"),
    deployment_type: z.enum(["static", "container"]).describe("Deployment type: 'static' for static sites, 'container' for server applications"),
    framework: z.enum(["react", "nextjs", "vue", "angular", "svelte", "html", "express", "fastapi", "flask"]).optional().describe("The framework used"),
    runtime: z.enum(["nodejs", "python", "go", "java", "ruby", "php", "dotnet", "custom"]).optional().describe("The runtime environment"),
    build_command: z.string().optional().describe("Custom build command (e.g., 'npm run build')"),
    output_directory: z.string().optional().describe("Build output directory (e.g., 'dist', 'build')"),
    start_command: z.string().optional().describe("Start command for container apps (e.g., 'npm start')"),
    environment_vars: z.record(z.string(), z.string()).optional().describe("Environment variables as key-value pairs"),
  },
  async ({
    organisation_id,
    name,
    github_repo_url,
    github_branch,
    deployment_type,
    framework,
    runtime,
    build_command,
    output_directory,
    start_command,
    environment_vars,
  }) => {
    const result = await getApi().createApplication({
      targetOrganisationId: organisation_id,
      name,
      githubRepoUrl: github_repo_url,
      githubBranch: github_branch,
      deploymentType: deployment_type,
      framework,
      runtime,
      buildCommand: build_command,
      outputDirectory: output_directory,
      startCommand: start_command,
      environmentVars: environment_vars as Record<string, string> | undefined,
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
    framework: z.enum(["react", "nextjs", "vue", "angular", "svelte", "html", "express", "fastapi", "flask"]).optional().describe("The framework used"),
    runtime: z.enum(["nodejs", "python", "go", "java", "ruby", "php", "dotnet", "custom"]).optional().describe("The runtime environment"),
    build_command: z.string().optional().describe("Custom build command"),
    output_directory: z.string().optional().describe("Build output directory"),
    start_command: z.string().optional().describe("Start command for container apps"),
    environment_vars: z.record(z.string(), z.string()).optional().describe("Environment variables as key-value pairs"),
  },
  async ({
    organisation_id,
    name,
    upload_id,
    deployment_type,
    framework,
    runtime,
    build_command,
    output_directory,
    start_command,
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
      startCommand: start_command,
      environmentVars: environment_vars as Record<string, string> | undefined,
    });
    return formatResponse(result);
  }
);

server.tool(
  "deploy-application",
  "Trigger a new deployment for an application",
  {
    organisation_id: z.string().describe("The organization ID"),
    application_id: z.string().describe("The application ID to deploy"),
    environment_id: z.string().optional().describe("Specific environment ID to deploy (optional)"),
  },
  async ({ organisation_id, application_id, environment_id }) => {
    const result = await getApi().deployApplication({
      targetOrganisationId: organisation_id,
      applicationId: application_id,
      environmentId: environment_id,
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
  "Get logs for an environment",
  {
    organisation_id: z.string().describe("The organization ID"),
    environment_id: z.string().describe("The environment ID to get logs for"),
  },
  async ({ organisation_id, environment_id }) => {
    const result = await getApi().getEnvironmentLogs(organisation_id, environment_id);
    if (result.success && result.data) {
      return {
        content: [{ type: "text", text: result.data.join("\n") || "No logs available" }],
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
  },
  async ({ organisation_id, environment_id }) => {
    const result = await getApi().listDeployments(organisation_id, environment_id);
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
  async () => {
    const result = await getApi().getGitHubInstallUrl();
    return formatResponse(result);
  }
);

server.tool(
  "get-github-installation-status",
  "Check if the Light Cloud GitHub App is installed",
  {},
  async () => {
    const result = await getApi().getGitHubInstallationStatus();
    return formatResponse(result);
  }
);

server.tool(
  "list-github-installations",
  "List all GitHub App installations",
  {},
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
  async () => {
    const result = await getApi().getPlatformConfig();
    return formatResponse(result);
  }
);

server.tool(
  "get-cloudrun-config",
  "Get Cloud Run configuration options",
  {},
  async () => {
    const result = await getApi().getCloudRunConfig();
    return formatResponse(result);
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
