// Mock API responses for testing

import type {
  User,
  Organisation,
  Application,
  Environment,
  Deployment,
  GitHubInstallation,
  Repository,
  Branch,
  DetectedProject,
  UploadRequestUrlResponse,
  UploadCompleteResponse,
} from '../../types.js';

export const mockOrganisation: Organisation = {
  id: 'org-123',
  name: 'Test Organization',
  slug: 'test-org',
  role: 'owner',
};

export const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  organisations: [mockOrganisation],
};

export const mockApplication: Application = {
  id: 'app-123',
  name: 'Test App',
  slug: 'test-app',
  deployment_type: 'static',
  framework: 'react',
  runtime: 'nodejs',
  github_repo_url: 'https://github.com/test/repo',
  github_branch: 'main',
  source_type: 'github',
  status: 'healthy',
  url: 'https://test-app.light-cloud.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockContainerApplication: Application = {
  id: 'app-456',
  name: 'Container App',
  slug: 'container-app',
  deployment_type: 'container',
  framework: 'express',
  runtime: 'nodejs',
  github_repo_url: 'https://github.com/test/container-repo',
  github_branch: 'main',
  source_type: 'github',
  status: 'healthy',
  url: 'https://container-app.light-cloud.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockEnvironment: Environment = {
  id: 'env-123',
  application_id: 'app-123',
  name: 'production',
  github_branch: 'main',
  is_production: true,
  status: 'healthy',
  url: 'https://test-app.light-cloud.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockStagingEnvironment: Environment = {
  id: 'env-456',
  application_id: 'app-123',
  name: 'staging',
  github_branch: 'develop',
  is_production: false,
  status: 'healthy',
  url: 'https://staging-test-app.light-cloud.com',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

export const mockDeployment: Deployment = {
  id: 'deploy-123',
  environment_id: 'env-123',
  status: 'healthy',
  deployment_stage: 'completed',
  commit_sha: 'abc123',
  commit_message: 'Initial commit',
  started_at: '2024-01-01T00:00:00Z',
  completed_at: '2024-01-01T00:01:00Z',
};

export const mockBuildingDeployment: Deployment = {
  id: 'deploy-456',
  environment_id: 'env-123',
  status: 'building',
  deployment_stage: 'building',
  commit_sha: 'def456',
  commit_message: 'Add new feature',
  started_at: '2024-01-01T00:02:00Z',
};

export const mockGitHubInstallation: GitHubInstallation = {
  id: 'install-123',
  account_name: 'test-user',
  account_type: 'user',
  repositories: ['repo1', 'repo2'],
};

export const mockOrgInstallation: GitHubInstallation = {
  id: 'install-456',
  account_name: 'test-org',
  account_type: 'organization',
  repositories: ['org-repo1', 'org-repo2'],
};

export const mockRepository: Repository = {
  id: 12345,
  name: 'test-repo',
  full_name: 'test-user/test-repo',
  private: false,
  default_branch: 'main',
};

export const mockPrivateRepository: Repository = {
  id: 12346,
  name: 'private-repo',
  full_name: 'test-user/private-repo',
  private: true,
  default_branch: 'main',
};

export const mockBranch: Branch = {
  name: 'main',
  commit: {
    sha: 'abc123def456',
    message: 'Initial commit',
  },
};

export const mockFeatureBranch: Branch = {
  name: 'feature/new-feature',
  commit: {
    sha: 'xyz789',
    message: 'Add new feature',
  },
};

export const mockDetectedProject: DetectedProject = {
  framework: 'react',
  runtime: 'nodejs',
  deploymentType: 'static',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  packageManager: 'npm',
  nodeVersion: '20',
  hasDockerfile: false,
};

export const mockContainerDetectedProject: DetectedProject = {
  framework: 'express',
  runtime: 'nodejs',
  deploymentType: 'container',
  buildCommand: 'npm run build',
  startCommand: 'npm start',
  packageManager: 'npm',
  nodeVersion: '20',
  hasDockerfile: true,
};

export const mockUploadResponse: UploadRequestUrlResponse = {
  uploadId: 'upload-123',
  signedUrl: 'https://storage.googleapis.com/bucket/path?signature=xxx',
  gcsPath: 'gs://bucket/path',
  expiresAt: '2024-01-01T01:00:00Z',
  maxSize: 104857600,
};

export const mockUploadCompleteResponse: UploadCompleteResponse = {
  id: 'upload-123',
  status: 'completed',
  fileSize: 1024000,
  gcsPath: 'gs://bucket/path',
  detectedFramework: 'react',
  detectedRuntime: 'nodejs',
  detectedDeploymentType: 'static',
  detectedBuildCommand: 'npm run build',
  detectedOutputDirectory: 'dist',
  completedAt: '2024-01-01T00:05:00Z',
};

export const mockPlatformConfig = {
  maxAppsPerOrg: 100,
  maxEnvironmentsPerApp: 10,
  supportedFrameworks: ['react', 'nextjs', 'vue', 'angular', 'svelte', 'html'],
  supportedRuntimes: ['nodejs', 'python', 'go'],
};

export const mockCloudRunConfig = {
  regions: ['us-central1', 'europe-west1', 'asia-east1'],
  memoryOptions: ['256Mi', '512Mi', '1Gi', '2Gi'],
  cpuOptions: ['0.5', '1', '2', '4'],
};

export const mockLogs = [
  '2024-01-01T00:00:00Z [INFO] Starting deployment...',
  '2024-01-01T00:00:01Z [INFO] Building application...',
  '2024-01-01T00:00:30Z [INFO] Build completed successfully',
  '2024-01-01T00:00:35Z [INFO] Deploying to Cloud Run...',
  '2024-01-01T00:01:00Z [INFO] Deployment completed',
];
