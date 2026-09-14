// Tests for src/api.ts - LightCloudApi class

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LightCloudApi } from '../api.js';
import {
  createMockApiClient,
  createSuccessResponse,
  createErrorResponse,
} from './fixtures/test-helpers.js';
import {
  mockUser,
  mockApplication,
  mockContainerApplication,
  mockEnvironment,
  mockStagingEnvironment,
  mockDeployment,
  mockBuildingDeployment,
  mockGitHubInstallation,
  mockOrgInstallation,
  mockRepository,
  mockPrivateRepository,
  mockBranch,
  mockFeatureBranch,
  mockDetectedProject,
  mockUploadResponse,
  mockUploadCompleteResponse,
  mockPlatformConfig,
  mockCloudRunConfig,
  mockLogs,
} from './fixtures/mock-responses.js';

describe('LightCloudApi', () => {
  let mockClient: ReturnType<typeof createMockApiClient>;
  let api: LightCloudApi;

  beforeEach(() => {
    mockClient = createMockApiClient();
    api = new LightCloudApi(mockClient as any);
    vi.clearAllMocks();
  });

  // ============ Authentication ============

  describe('getProfile', () => {
    it('should return user profile on success', async () => {
      mockClient.get.mockResolvedValue(createSuccessResponse(mockUser));

      const result = await api.getProfile();

      expect(mockClient.get).toHaveBeenCalledWith('/api/auth/profile');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockUser);
    });

    it('should return error when not authenticated', async () => {
      mockClient.get.mockResolvedValue(createErrorResponse('UNAUTHORIZED', 'Not authenticated'));

      const result = await api.getProfile();

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNAUTHORIZED');
    });
  });

  // ============ Applications ============

  describe('listApplications', () => {
    it('should return list of applications', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse({
        items: [mockApplication, mockContainerApplication],
        totalItems: 2,
        totalPages: 1,
        currentPage: 1,
      }));

      const result = await api.listApplications('org-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/applications', {
        targetOrganisationId: 'org-123',
        limit: 100,
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0]).toEqual(mockApplication);
    });

    it('should handle empty application list', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse({
        items: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
      }));

      const result = await api.listApplications('org-123');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should propagate error response', async () => {
      mockClient.post.mockResolvedValue(createErrorResponse('NOT_FOUND', 'Organization not found'));

      const result = await api.listApplications('invalid-org');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('getApplication', () => {
    it('should return application details', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockApplication));

      const result = await api.getApplication('org-123', 'app-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/applications/get', {
        targetOrganisationId: 'org-123',
        applicationId: 'app-123',
      });
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('app-123');
    });

    it('should handle non-existent application', async () => {
      mockClient.post.mockResolvedValue(createErrorResponse('NOT_FOUND', 'Application not found'));

      const result = await api.getApplication('org-123', 'invalid-app');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Application not found');
    });
  });

  describe('createApplication', () => {
    it('should create a static application', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockApplication));

      const result = await api.createApplication({
        targetOrganisationId: 'org-123',
        name: 'Test App',
        githubRepoUrl: 'https://github.com/test/repo',
        deploymentType: 'static',
        framework: 'react',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/applications/create', {
        targetOrganisationId: 'org-123',
        name: 'Test App',
        githubRepoUrl: 'https://github.com/test/repo',
        deploymentType: 'static',
        framework: 'react',
        aiSource: 'claude_code',
      });
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Test App');
    });

    it('should create a container application', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockContainerApplication));

      const result = await api.createApplication({
        targetOrganisationId: 'org-123',
        name: 'Container App',
        githubRepoUrl: 'https://github.com/test/container-repo',
        deploymentType: 'container',
        runtime: 'nodejs',
        startCommand: 'npm start',
      });

      expect(result.success).toBe(true);
      expect(result.data?.deployment_type).toBe('container');
    });

    it('should handle validation errors', async () => {
      mockClient.post.mockResolvedValue(createErrorResponse('VALIDATION_ERROR', 'Name is required'));

      const result = await api.createApplication({
        targetOrganisationId: 'org-123',
        name: '',
        githubRepoUrl: 'https://github.com/test/repo',
        deploymentType: 'static',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('createApplicationFromUpload', () => {
    it('should create application from uploaded source', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockApplication));

      const result = await api.createApplicationFromUpload({
        targetOrganisationId: 'org-123',
        name: 'Uploaded App',
        uploadId: 'upload-123',
        deploymentType: 'static',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/applications/create-from-upload', {
        targetOrganisationId: 'org-123',
        name: 'Uploaded App',
        uploadId: 'upload-123',
        deploymentType: 'static',
        aiSource: 'claude_code',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('deployApplication', () => {
    it('should trigger deployment', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockBuildingDeployment));

      const result = await api.deployApplication({
        targetOrganisationId: 'org-123',
        applicationId: 'app-123',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/applications/deploy', {
        targetOrganisationId: 'org-123',
        applicationId: 'app-123',
        aiSource: 'claude_code',
      });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('building');
    });

    it('should trigger deployment for specific environment', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockBuildingDeployment));

      const result = await api.deployApplication({
        targetOrganisationId: 'org-123',
        applicationId: 'app-123',
        environmentId: 'env-456',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/applications/deploy', {
        targetOrganisationId: 'org-123',
        applicationId: 'app-123',
        environmentId: 'env-456',
        aiSource: 'claude_code',
      });
    });
  });

  describe('deleteApplication', () => {
    it('should delete application', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(undefined));

      const result = await api.deleteApplication('org-123', 'app-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/applications/delete', {
        targetOrganisationId: 'org-123',
        applicationId: 'app-123',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('getApplicationStatus', () => {
    it('should return application status', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockApplication));

      const result = await api.getApplicationStatus('org-123', 'app-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/applications/status', {
        targetOrganisationId: 'org-123',
        applicationId: 'app-123',
      });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('healthy');
    });
  });

  describe('detectFramework', () => {
    it('should detect framework from repository', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockDetectedProject));

      const result = await api.detectFramework('org-123', 'test-user', 'test-repo', 'main');

      expect(mockClient.post).toHaveBeenCalledWith('/api/applications/detect-framework', {
        targetOrganisationId: 'org-123',
        owner: 'test-user',
        repo: 'test-repo',
        branch: 'main',
      });
      expect(result.success).toBe(true);
      expect(result.data?.framework).toBe('react');
      expect(result.data?.deploymentType).toBe('static');
    });
  });

  // ============ Environments ============

  describe('listEnvironments', () => {
    it('should return list of environments', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse([mockEnvironment, mockStagingEnvironment]));

      const result = await api.listEnvironments('org-123', 'app-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/environments', {
        targetOrganisationId: 'org-123',
        applicationId: 'app-123',
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('getEnvironment', () => {
    it('should return environment details', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockEnvironment));

      const result = await api.getEnvironment('org-123', 'env-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/environments/get', {
        targetOrganisationId: 'org-123',
        environmentId: 'env-123',
      });
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('production');
    });
  });

  describe('createEnvironment', () => {
    it('should create new environment', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockStagingEnvironment));

      const result = await api.createEnvironment('org-123', 'app-123', 'staging', 'develop');

      expect(mockClient.post).toHaveBeenCalledWith('/api/environments/create', {
        targetOrganisationId: 'org-123',
        applicationId: 'app-123',
        name: 'staging',
        githubBranch: 'develop',
        aiSource: 'claude_code',
      });
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('staging');
    });
  });

  describe('deployEnvironment', () => {
    it('should trigger environment deployment', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockBuildingDeployment));

      const result = await api.deployEnvironment('org-123', 'env-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/environments/deploy', {
        targetOrganisationId: 'org-123',
        environmentId: 'env-123',
        aiSource: 'claude_code',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('deleteEnvironment', () => {
    it('should delete environment', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(undefined));

      const result = await api.deleteEnvironment('org-123', 'env-456');

      expect(mockClient.post).toHaveBeenCalledWith('/api/environments/delete', {
        targetOrganisationId: 'org-123',
        environmentId: 'env-456',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('getEnvironmentLogs', () => {
    it('should return environment logs', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockLogs));

      const result = await api.getEnvironmentLogs('org-123', 'env-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/environments/logs', {
        targetOrganisationId: 'org-123',
        environmentId: 'env-123',
        filters: expect.objectContaining({
          startTime: expect.any(String),
          endTime: expect.any(String),
          pageSize: 100,
        }),
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);
    });
  });

  // ============ Deployments ============

  describe('listDeployments', () => {
    it('should return list of deployments', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse([mockDeployment, mockBuildingDeployment]));

      const result = await api.listDeployments('org-123', 'env-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/deployments', {
        targetOrganisationId: 'org-123',
        environmentId: 'env-123',
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('getDeployment', () => {
    it('should return deployment details', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockDeployment));

      const result = await api.getDeployment('org-123', 'deploy-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/deployments/get', {
        targetOrganisationId: 'org-123',
        deploymentId: 'deploy-123',
      });
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('healthy');
    });
  });

  // ============ GitHub Integration ============

  describe('getGitHubInstallUrl', () => {
    it('should return GitHub app install URL', async () => {
      mockClient.get.mockResolvedValue(createSuccessResponse({ url: 'https://github.com/apps/light-cloud/installations/new' }));

      const result = await api.getGitHubInstallUrl();

      expect(mockClient.get).toHaveBeenCalledWith('/api/github-app/install');
      expect(result.success).toBe(true);
      expect(result.data?.url).toContain('github.com');
    });
  });

  describe('getGitHubInstallationStatus', () => {
    it('should return installation status', async () => {
      mockClient.get.mockResolvedValue(createSuccessResponse({
        configured: true,
        installed: true,
        installationId: 123,
        accountLogin: mockGitHubInstallation.account_name,
      }));

      const result = await api.getGitHubInstallationStatus('org-1', 'octo', 'repo');

      expect(mockClient.get).toHaveBeenCalledWith(
        '/api/github-app/installation-status?organisationId=org-1&owner=octo&repo=repo'
      );
      expect(result.success).toBe(true);
      expect(result.data?.installed).toBe(true);
    });

    it('should return false when not installed', async () => {
      mockClient.get.mockResolvedValue(createSuccessResponse({
        configured: true,
        installed: false,
      }));

      const result = await api.getGitHubInstallationStatus('org-1', 'octo', 'repo');

      expect(result.success).toBe(true);
      expect(result.data?.installed).toBe(false);
    });
  });

  describe('listGitHubInstallations', () => {
    it('should return list of GitHub installations', async () => {
      mockClient.get.mockResolvedValue(createSuccessResponse([mockGitHubInstallation, mockOrgInstallation]));

      const result = await api.listGitHubInstallations();

      expect(mockClient.get).toHaveBeenCalledWith('/api/github-app/installations');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('listRepositories', () => {
    it('should return list of repositories', async () => {
      mockClient.get.mockResolvedValue(createSuccessResponse([mockRepository, mockPrivateRepository]));

      const result = await api.listRepositories('org-123');

      expect(mockClient.get).toHaveBeenCalledWith('/api/github-app/organisation/org-123/repositories');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('listBranches', () => {
    it('should return list of branches', async () => {
      mockClient.get.mockResolvedValue(createSuccessResponse([mockBranch, mockFeatureBranch]));

      const result = await api.listBranches('org-123', 'test-user', 'test-repo');

      expect(mockClient.get).toHaveBeenCalledWith('/api/github-app/organisation/org-123/repositories/test-user/test-repo/branches');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('checkRepoAccess', () => {
    it('should check repository access', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse({
        accounts: {
          'test-user': { installed: true, linkedToThisOrg: true },
          'other-user': { installed: false, linkedToThisOrg: false },
        },
      }));

      const result = await api.checkRepoAccess('org-123', ['test-user', 'other-user']);

      expect(mockClient.post).toHaveBeenCalledWith('/api/github-app/organisation/org-123/check-accounts', {
        accountLogins: ['test-user', 'other-user'],
      });
      expect(result.success).toBe(true);
      expect(result.data?.accounts['test-user'].installed).toBe(true);
    });
  });

  // ============ Upload ============

  describe('requestUploadUrl', () => {
    it('should return signed upload URL', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockUploadResponse));

      const result = await api.requestUploadUrl({
        targetOrganisationId: 'org-123',
        fileName: 'source.zip',
        fileSize: 1024000,
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/upload/request-url', {
        targetOrganisationId: 'org-123',
        fileName: 'source.zip',
        fileSize: 1024000,
        aiSource: 'claude_code',
      });
      expect(result.success).toBe(true);
      expect(result.data?.uploadId).toBe('upload-123');
      expect(result.data?.signedUrl).toContain('storage.googleapis.com');
    });
  });

  describe('completeUpload', () => {
    it('should complete upload without detection', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockUploadCompleteResponse));

      const result = await api.completeUpload('org-123', 'upload-123');

      expect(mockClient.post).toHaveBeenCalledWith('/api/upload/complete', {
        targetOrganisationId: 'org-123',
        uploadId: 'upload-123',
      });
      expect(result.success).toBe(true);
    });

    it('should complete upload with detection metadata', async () => {
      mockClient.post.mockResolvedValue(createSuccessResponse(mockUploadCompleteResponse));

      const result = await api.completeUpload('org-123', 'upload-123', {
        detectedFramework: 'react',
        detectedRuntime: 'nodejs',
        detectedDeploymentType: 'static',
        detectedBuildCommand: 'npm run build',
        detectedOutputDirectory: 'dist',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/upload/complete', {
        targetOrganisationId: 'org-123',
        uploadId: 'upload-123',
        detectedFramework: 'react',
        detectedRuntime: 'nodejs',
        detectedDeploymentType: 'static',
        detectedBuildCommand: 'npm run build',
        detectedOutputDirectory: 'dist',
      });
      expect(result.success).toBe(true);
    });
  });

  // ============ Config ============

  describe('getPlatformConfig', () => {
    it('should return platform configuration', async () => {
      mockClient.get.mockResolvedValue(createSuccessResponse(mockPlatformConfig));

      const result = await api.getPlatformConfig();

      expect(mockClient.get).toHaveBeenCalledWith('/api/config/platform');
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('maxAppsPerOrg');
    });
  });

  describe('getCloudRunConfig', () => {
    it('should return Cloud Run configuration', async () => {
      mockClient.get.mockResolvedValue(createSuccessResponse(mockCloudRunConfig));

      const result = await api.getCloudRunConfig();

      expect(mockClient.get).toHaveBeenCalledWith('/api/config/cloudrun');
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('regions');
      expect(result.data).toHaveProperty('memoryOptions');
    });
  });
});
