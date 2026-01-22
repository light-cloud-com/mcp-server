// src/api.ts - Light Cloud API endpoints

import { ApiClient } from './api-client.js';
import {
  ApiResponse,
  Application,
  Environment,
  Deployment,
  User,
  GitHubInstallation,
  Repository,
  Branch,
  CreateApplicationRequest,
  CreateApplicationFromUploadRequest,
  DeployRequest,
  UploadRequestUrlRequest,
  UploadRequestUrlResponse,
  UploadCompleteResponse,
  DetectedProject,
  PaginatedResponse,
} from './types.js';

export class LightCloudApi {
  constructor(private client: ApiClient) {}

  // ============ Authentication ============

  async getProfile(): Promise<ApiResponse<User>> {
    return this.client.get<User>('/api/auth/profile');
  }

  // ============ Applications ============

  async listApplications(organisationId: string): Promise<ApiResponse<Application[]>> {
    const result = await this.client.post<PaginatedResponse<Application>>('/api/applications', {
      targetOrganisationId: organisationId,
      limit: 100,
    });

    if (result.success && result.data) {
      return {
        success: true,
        data: result.data.items,
      };
    }

    return {
      success: result.success,
      error: result.error,
    };
  }

  async getApplication(organisationId: string, applicationId: string): Promise<ApiResponse<Application>> {
    return this.client.post<Application>('/api/applications/get', {
      targetOrganisationId: organisationId,
      applicationId,
    });
  }

  async createApplication(request: CreateApplicationRequest): Promise<ApiResponse<Application>> {
    return this.client.post<Application>('/api/applications/create', {
      ...request,
      aiSource: 'claude_code',
    });
  }

  async createApplicationFromUpload(request: CreateApplicationFromUploadRequest): Promise<ApiResponse<Application>> {
    return this.client.post<Application>('/api/applications/create-from-upload', {
      ...request,
      aiSource: 'claude_code',
    });
  }

  async deployApplication(request: DeployRequest): Promise<ApiResponse<Deployment>> {
    return this.client.post<Deployment>('/api/applications/deploy', {
      ...request,
      aiSource: 'claude_code',
    });
  }

  async deleteApplication(organisationId: string, applicationId: string): Promise<ApiResponse<void>> {
    return this.client.post<void>('/api/applications/delete', {
      targetOrganisationId: organisationId,
      applicationId,
    });
  }

  async getApplicationStatus(organisationId: string, applicationId: string): Promise<ApiResponse<Application>> {
    return this.client.post<Application>('/api/applications/status', {
      targetOrganisationId: organisationId,
      applicationId,
    });
  }

  async detectFramework(
    organisationId: string,
    owner: string,
    repo: string,
    branch: string
  ): Promise<ApiResponse<DetectedProject>> {
    return this.client.post<DetectedProject>('/api/applications/detect-framework', {
      targetOrganisationId: organisationId,
      owner,
      repo,
      branch,
    });
  }

  // ============ Environments ============

  async listEnvironments(organisationId: string, applicationId: string): Promise<ApiResponse<Environment[]>> {
    return this.client.post<Environment[]>('/api/environments', {
      targetOrganisationId: organisationId,
      applicationId,
    });
  }

  async getEnvironment(organisationId: string, environmentId: string): Promise<ApiResponse<Environment>> {
    return this.client.post<Environment>('/api/environments/get', {
      targetOrganisationId: organisationId,
      environmentId,
    });
  }

  async createEnvironment(
    organisationId: string,
    applicationId: string,
    name: string,
    branch: string
  ): Promise<ApiResponse<Environment>> {
    return this.client.post<Environment>('/api/environments/create', {
      targetOrganisationId: organisationId,
      applicationId,
      name,
      githubBranch: branch,
      aiSource: 'claude_code',
    });
  }

  async deployEnvironment(organisationId: string, environmentId: string): Promise<ApiResponse<Deployment>> {
    return this.client.post<Deployment>('/api/environments/deploy', {
      targetOrganisationId: organisationId,
      environmentId,
      aiSource: 'claude_code',
    });
  }

  async deleteEnvironment(organisationId: string, environmentId: string): Promise<ApiResponse<void>> {
    return this.client.post<void>('/api/environments/delete', {
      targetOrganisationId: organisationId,
      environmentId,
    });
  }

  async getEnvironmentLogs(organisationId: string, environmentId: string): Promise<ApiResponse<string[]>> {
    return this.client.post<string[]>('/api/environments/logs', {
      targetOrganisationId: organisationId,
      environmentId,
    });
  }

  // ============ Deployments ============

  async listDeployments(organisationId: string, environmentId: string): Promise<ApiResponse<Deployment[]>> {
    return this.client.post<Deployment[]>('/api/deployments', {
      targetOrganisationId: organisationId,
      environmentId,
    });
  }

  async getDeployment(organisationId: string, deploymentId: string): Promise<ApiResponse<Deployment>> {
    return this.client.post<Deployment>('/api/deployments/get', {
      targetOrganisationId: organisationId,
      deploymentId,
    });
  }

  // ============ GitHub Integration ============

  async getGitHubInstallUrl(): Promise<ApiResponse<{ url: string }>> {
    return this.client.get<{ url: string }>('/api/github-app/install');
  }

  async getGitHubInstallationStatus(): Promise<ApiResponse<{ installed: boolean; installations: GitHubInstallation[] }>> {
    return this.client.get<{ installed: boolean; installations: GitHubInstallation[] }>('/api/github-app/installation-status');
  }

  async listGitHubInstallations(): Promise<ApiResponse<GitHubInstallation[]>> {
    return this.client.get<GitHubInstallation[]>('/api/github-app/installations');
  }

  async listRepositories(organisationId: string): Promise<ApiResponse<Repository[]>> {
    return this.client.get<Repository[]>(`/api/github-app/organisation/${organisationId}/repositories`);
  }

  async listBranches(organisationId: string, owner: string, repo: string): Promise<ApiResponse<Branch[]>> {
    return this.client.get<Branch[]>(`/api/github-app/organisation/${organisationId}/repositories/${owner}/${repo}/branches`);
  }

  async checkRepoAccess(
    organisationId: string,
    accountLogins: string[]
  ): Promise<ApiResponse<{ accounts: Record<string, { installed: boolean; linkedToThisOrg: boolean }> }>> {
    return this.client.post<{ accounts: Record<string, { installed: boolean; linkedToThisOrg: boolean }> }>(
      `/api/github-app/organisation/${organisationId}/check-accounts`,
      { accountLogins }
    );
  }

  // ============ Upload ============

  async requestUploadUrl(request: UploadRequestUrlRequest): Promise<ApiResponse<UploadRequestUrlResponse>> {
    return this.client.post<UploadRequestUrlResponse>('/api/upload/request-url', {
      ...request,
      aiSource: 'claude_code',
    });
  }

  async completeUpload(
    organisationId: string,
    uploadId: string,
    detection?: {
      detectedFramework?: string;
      detectedRuntime?: string;
      detectedDeploymentType?: 'static' | 'container';
      detectedBuildCommand?: string;
      detectedOutputDirectory?: string;
    }
  ): Promise<ApiResponse<UploadCompleteResponse>> {
    return this.client.post('/api/upload/complete', {
      targetOrganisationId: organisationId,
      uploadId,
      ...detection,
    });
  }

  // ============ Config ============

  async getPlatformConfig(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.client.get<Record<string, unknown>>('/api/config/platform');
  }

  async getCloudRunConfig(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.client.get<Record<string, unknown>>('/api/config/cloudrun');
  }
}
