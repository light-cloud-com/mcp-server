#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ApiClient } from "./api-client.js";
import { LightCloudApi } from "./api.js";
import { startNonBlockingLoginFlow, logout as performLogout } from "./auth.js";
import { isAuthenticated } from "./token-storage.js";
import { detectLocalFramework } from "./detection/framework-detector.js";
import { detectLocalGit } from "./detection/git-detector.js";
import { packageSource } from "./upload/packager.js";
import { readConfig, writeConfig } from "./config/config-manager.js";
import { generateFormattedStatus, generateFormattedList } from "./utils/formatting.js";
import type { LightCloudConfig } from "./types.js";
import * as path from "path";

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
  "Check whether the Light Cloud GitHub App is installed for a repository within an organization (and can read that repository)",
  {
    organisation_id: z.string().describe("The organization ID"),
    owner: z.string().describe("GitHub repository owner (user or org login)"),
    repo: z.string().describe("GitHub repository name"),
  },
  async ({ organisation_id, owner, repo }) => {
    const result = await getApi().getGitHubInstallationStatus(organisation_id, owner, repo);
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

// ============ Local Detection Tools ============

server.tool(
  "detect-local-framework",
  "Detect framework and configuration from a local project directory",
  {
    directory: z.string().optional().describe("Path to project directory. Defaults to current working directory."),
  },
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
