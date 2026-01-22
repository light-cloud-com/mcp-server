// src/types.ts - Light Cloud API Types

// ============ Request Types ============

export interface CreateApplicationRequest {
  targetOrganisationId: string;
  name: string;
  projectId?: string;
  githubRepoUrl: string;
  githubBranch?: string;
  isPrivate?: boolean;
  deploymentType: 'static' | 'container';
  framework?: Framework;
  runtime?: Runtime;
  buildCommand?: string;
  outputDirectory?: string;
  startCommand?: string;
  environmentVars?: Record<string, string>;
  containerPort?: number;
  memory?: string;
  cpu?: string;
  region?: string;
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
  startCommand?: string;
  environmentVars?: Record<string, string>;
}

export interface UploadRequestUrlRequest {
  targetOrganisationId: string;
  fileName?: string;
  contentType?: string;
  fileSize?: number;
}

export interface DeployRequest {
  targetOrganisationId: string;
  applicationId: string;
  environmentId?: string;
}

// ============ Response Types ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface UploadRequestUrlResponse {
  uploadId: string;
  signedUrl: string;
  gcsPath: string;
  expiresAt: string;
  maxSize: number;
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

export type Framework =
  | 'react'
  | 'nextjs'
  | 'vue'
  | 'angular'
  | 'svelte'
  | 'html'
  | 'express'
  | 'fastapi'
  | 'flask';

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
  completedAt?: string;
}
