// src/types.ts - Light Cloud API Types

// ============ Request Types ============

export type GitProvider = 'github' | 'gitlab' | 'bitbucket';

/**
 * Body of POST /api/applications/create. Field names follow the backend
 * (console-backend/src/routes/applications/createApplication.ts): the repo URL
 * is always `githubRepoUrl` whatever the provider, and the provider is
 * inferred from the URL host when `gitProvider` is omitted.
 */
export interface CreateApplicationRequest {
  targetOrganisationId: string;
  name: string;
  projectId?: string;
  githubRepoUrl: string;
  githubBranch?: string;
  isPrivate?: boolean;
  gitProvider?: GitProvider;
  /** GitLab project id or path; needed for self-hosted GitLab. */
  gitlabProjectId?: string;
  bitbucketRepoUuid?: string;
  /** Repo-relative folder to build from (monorepos). */
  rootDirectory?: string;
  deploymentType: 'static' | 'container';
  framework?: Framework;
  runtime?: Runtime;
  buildCommand?: string;
  outputDirectory?: string;
  environmentVars?: Record<string, string>;
  containerPort?: number;
  memory?: string;
  cpu?: string;
  minInstances?: number;
  maxInstances?: number;
  region?: string;
  autoDeployOnPush?: boolean;
  autoDeployBranches?: string[];
}

export interface CreateApplicationFromUploadRequest {
  targetOrganisationId: string;
  name: string;
  uploadId: string;
  projectId?: string;
  deploymentType: 'static' | 'container';
  framework?: Framework;
  runtime?: Runtime;
  buildCommand?: string;
  outputDirectory?: string;
  containerPort?: number;
  environmentVars?: Record<string, string>;
}

export interface UploadRequestUrlRequest {
  targetOrganisationId: string;
  fileName?: string;
  contentType?: string;
  fileSize?: number;
}

/**
 * Body of POST /api/applications/deploy. Redeploys the production environment;
 * a specific environment goes through /api/environments/deploy instead.
 * `uploadId` names a freshly uploaded archive — without it the backend rebuilds
 * the archive the application was created from.
 */
export interface DeployRequest {
  targetOrganisationId: string;
  applicationId: string;
  uploadId?: string;
}

// ============ Response Types ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    /** HTTP status, when the error came from a response. */
    status?: number;
    /** The backend's hint for what to call next (e.g. "add-payment-method"). */
    nextStep?: string;
  };
}

export interface UploadRequestUrlResponse {
  uploadId: string;
  signedUrl: string;
  gcsPath: string;
  expiresAt: string;
  maxSize: number;
}

/** Body of POST /api/deployments — a page of an environment's history. */
export interface DeploymentListResponse {
  deployments: Deployment[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
}

export interface Application {
  id: string;
  name: string;
  slug: string;
  deployment_type: 'static' | 'container';
  framework?: string;
  runtime?: string;
  github_repo_url?: string;
  github_branch?: string;
  source_type: 'github' | 'upload';
  status: DeploymentStatus;
  url?: string;
  created_at: string;
  updated_at: string;
  environments?: Environment[];
}

export interface Environment {
  id: string;
  application_id: string;
  name: string;
  github_branch: string;
  is_production: boolean;
  status: DeploymentStatus;
  url?: string;
  custom_domain?: string;
  created_at: string;
  updated_at: string;
}

export interface Deployment {
  id: string;
  environment_id: string;
  status: DeploymentStatus;
  deployment_stage?: string;
  commit_sha?: string;
  commit_message?: string;
  started_at: string;
  completed_at?: string;
  logs_url?: string;
  deployment_logs?: string[];
}

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  organisations: Organisation[];
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface GitHubInstallation {
  id: string;
  account_name: string;
  account_type: 'user' | 'organization';
  repositories?: string[];
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
    message?: string;
  };
}

// ============ Enums ============

export type DeploymentStatus =
  | 'pending'
  | 'building'
  | 'deploying'
  | 'healthy'
  | 'degraded'
  | 'failed'
  | 'deleting';

/**
 * Framework id as defined by the console-backend registry
 * (console-backend/src/const/frameworks.ts), which is authoritative and
 * open-ended — new ids appear there without a release here, so this is not an
 * enforced union. Common values: react, nextjs, nuxt, sveltekit, remix, astro,
 * vue, angular, svelte, solid, qwik, express, fastify, nestjs, hono, nodejs,
 * django, flask, fastapi, python, gin, echo, fiber, go, springboot, quarkus,
 * java, rails, sinatra, ruby, laravel, symfony, wordpress, wasp, php, aspnet,
 * blazor, gatsby, docusaurus, eleventy, html, custom.
 */
export type Framework = string;

export type Runtime =
  | 'nodejs'
  | 'python'
  | 'go'
  | 'java'
  | 'ruby'
  | 'php'
  | 'dotnet'
  | 'custom';

// ============ Detection Types ============

export interface DetectedProject {
  framework?: Framework;
  runtime?: Runtime;
  deploymentType: 'static' | 'container';
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry';
  nodeVersion?: string;
  pythonVersion?: string;
  hasDockerfile?: boolean;
  envFiles?: string[];
  detectedDependencies?: string[];
}

export interface UploadCompleteResponse {
  id: string;
  status: string;
  fileSize: number;
  gcsPath: string;
  detectedFramework?: string;
  detectedRuntime?: string;
  detectedDeploymentType?: string;
  detectedBuildCommand?: string;
  detectedOutputDirectory?: string;
  detectedContainerPort?: number | null;
  /** 'server' when the backend inspected the archive with the console's detector. */
  detectionSource?: 'server' | 'client';
  detectionConfidence?: 'high' | 'medium' | 'low' | null;
  detectedFiles?: string[];
  configWarning?: string | null;
  completedAt?: string;
}

// ============ Local Detection Types ============

export interface LocalFrameworkDetection {
  framework?: Framework;
  runtime?: Runtime;
  deploymentType: 'static' | 'container';
  buildCommand?: string;
  outputDirectory?: string;
  startCommand?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry';
  envFiles?: string[];
  hasDockerfile?: boolean;
  nodeVersion?: string;
  pythonVersion?: string;
}

export interface LocalGitDetection {
  hasGit: boolean;
  remoteUrl?: string;
  isGitHub?: boolean;
  owner?: string;
  repo?: string;
  branch?: string;
  isDirty?: boolean;
}

// ============ Package Types ============

export interface PackageResult {
  buffer: Buffer;
  base64: string;
  fileCount: number;
  totalSize: number;
  excludedCount: number;
}

// ============ Config Types ============

export interface LightCloudConfig {
  organisationId?: string;
  applicationId?: string;
  environmentId?: string;
  applicationName?: string;
  framework?: Framework;
  deploymentType?: 'static' | 'container';
}

// ============ Formatted Output Types ============

export interface FormattedEnvironmentRow {
  name: string;
  status: string;
  statusEmoji: string;
  source: string;
  lastDeploy: string;
  url?: string;
}

export interface FormattedApplicationRow {
  name: string;
  status: string;
  statusEmoji: string;
  type: string;
  url?: string;
  dashboardUrl: string;
}
