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
  DeploymentListResponse,
  PaginatedResponse,
} from './types.js';

export type LogSource = 'app' | 'request' | 'system';

export type LogSeverity =
  | 'DEFAULT'
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'ERROR'
  | 'CRITICAL'
  | 'ALERT'
  | 'EMERGENCY';

export interface EnvironmentLogOptions {
  hours?: number;
  limit?: number;
  search?: string;
  revision?: string;
  instanceId?: string;
  source?: LogSource;
  severity?: LogSeverity[];
}

/** Shape of POST /api/environments/logs. */
export interface EnvironmentLogEntry {
  timestamp: string;
  severity: string;
  source?: LogSource;
  instanceId?: string;
  textPayload?: string;
  jsonPayload?: Record<string, unknown>;
  resource?: { labels?: { revision_name?: string } };
  httpRequest?: { requestMethod?: string; requestUrl?: string; status?: number; latency?: string };
}

export interface EnvironmentLogsResponse {
  logs: EnvironmentLogEntry[];
  nextPageToken?: string;
  hasMore: boolean;
}

export interface OwnerBillingSummary {
  organisations: Array<{ organisation: { id: string; name: string } }>;
  billing_details_saved: boolean;
  stripe_customer_created: boolean;
  payment_method: { last4: string; brand: string } | null;
  billing_cycle: { next_billing_date: string | null; last_billed_at: string | null };
}

export interface PlanCatalogEntry {
  id: string;
  name: string;
  price: number;
  entitlements?: Record<string, unknown> | null;
}

export interface PlansResponse {
  plans: PlanCatalogEntry[];
  currentPlanId: string | null;
  pendingPlanId: string | null;
  pool: {
    total: number;
    spent: number;
    remaining: number;
    overage: number;
    pct: number;
    planPrice: number;
    cycleStarted: boolean;
  };
  hardStopped: boolean;
  spendingLimit: number | null;
}

export interface ChoosePlanResult {
  planId: string;
  pendingPlanId: string | null;
  spendingLimit: number | null;
  proratedCharge: number;
  chargeStatus: string;
  effectiveAt: string | null;
}

export interface CheckoutSession {
  url: string;
  sessionId: string;
  expiresAt: string;
}

export interface CheckoutStatus {
  status: 'open' | 'complete' | 'expired';
  paymentMethod: { brand: string; last4: string; exp_month: number; exp_year: number } | null;
}

export interface CreateDatabaseRequest {
  targetOrganisationId: string;
  name: string;
  projectId?: string;
  databaseType?: 'postgresql' | 'mysql';
  tier?: string;
  region?: string;
  storageGb?: number;
}

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

  /** Redeploys the production environment; the backend answers with the application. */
  async deployApplication(request: DeployRequest): Promise<ApiResponse<Application>> {
    return this.client.post<Application>('/api/applications/deploy', {
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
    // The backend reads `organisationId` here (it resolves the org's GitHub
    // installation for private repos); `targetOrganisationId` is kept for the
    // shared permission middleware.
    return this.client.post<DetectedProject>('/api/applications/detect-framework', {
      targetOrganisationId: organisationId,
      organisationId,
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

  /** The backend answers with the environment, not a deployment record. */
  async deployEnvironment(organisationId: string, environmentId: string): Promise<ApiResponse<Environment>> {
    return this.client.post<Environment>('/api/environments/deploy', {
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

  async getEnvironmentLogs(
    organisationId: string,
    environmentId: string,
    options: EnvironmentLogOptions = {}
  ): Promise<ApiResponse<EnvironmentLogsResponse>> {
    const hours = options.hours ?? 1;
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
    return this.client.post<EnvironmentLogsResponse>('/api/environments/logs', {
      targetOrganisationId: organisationId,
      environmentId,
      filters: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        textSearch: options.search || undefined,
        revision: options.revision || undefined,
        instanceId: options.instanceId || undefined,
        source: options.source,
        severity: options.severity?.length ? options.severity : undefined,
        pageSize: Math.min(Math.max(options.limit ?? 100, 1), 500),
      },
    });
  }

  // ============ Deployments ============

  /** Newest first; the backend caps a page at 20. */
  async listDeployments(
    organisationId: string,
    environmentId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<ApiResponse<DeploymentListResponse>> {
    return this.client.post<DeploymentListResponse>('/api/deployments', {
      targetOrganisationId: organisationId,
      environmentId,
      limit: Math.min(Math.max(options.limit ?? 20, 1), 20),
      offset: Math.max(options.offset ?? 0, 0),
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

  async getGitHubInstallationStatus(
    organisationId: string,
    owner: string,
    repo: string
  ): Promise<
    ApiResponse<{
      configured: boolean;
      installed: boolean;
      installationId?: number;
      accountLogin?: string;
      repoAccess?: boolean;
    }>
  > {
    const params = new URLSearchParams({ organisationId, owner, repo });
    return this.client.get(`/api/github-app/installation-status?${params.toString()}`);
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

  // ============ Billing ============

  async getOwnerBillingSummary(): Promise<ApiResponse<{ data: OwnerBillingSummary }>> {
    return this.client.post<{ data: OwnerBillingSummary }>('/api/billing/owner-summary', {});
  }

  async getPlans(organisationId: string): Promise<ApiResponse<{ data: PlansResponse }>> {
    return this.client.post<{ data: PlansResponse }>('/api/billing/plans', {
      targetOrganisationId: organisationId,
    });
  }

  async choosePlan(organisationId: string, planId: string): Promise<ApiResponse<{ data: ChoosePlanResult }>> {
    return this.client.post<{ data: ChoosePlanResult }>('/api/billing/choose-plan', {
      targetOrganisationId: organisationId,
      planId,
    });
  }

  async createCheckoutSession(organisationId: string): Promise<ApiResponse<{ data: CheckoutSession }>> {
    return this.client.post<{ data: CheckoutSession }>('/api/billing/checkout-session', {
      targetOrganisationId: organisationId,
      client: 'mcp',
    });
  }

  async getCheckoutSessionStatus(
    organisationId: string,
    sessionId: string
  ): Promise<ApiResponse<{ data: CheckoutStatus }>> {
    return this.client.post<{ data: CheckoutStatus }>('/api/billing/checkout-session/status', {
      targetOrganisationId: organisationId,
      sessionId,
    });
  }

  // ============ Databases ============

  async listDatabases(organisationId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/databases', { targetOrganisationId: organisationId });
  }

  async getDatabase(organisationId: string, databaseId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/databases/get', {
      targetOrganisationId: organisationId,
      databaseId,
    });
  }

  async createDatabase(request: CreateDatabaseRequest): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/databases/create', request);
  }

  async getDatabaseConnectionString(
    organisationId: string,
    databaseId: string
  ): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/databases/connection-string', {
      targetOrganisationId: organisationId,
      databaseId,
    });
  }

  // ============ Environment settings ============

  async updateEnvironment(
    organisationId: string,
    environmentId: string,
    changes: Record<string, unknown>
  ): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/environments/update', {
      targetOrganisationId: organisationId,
      environmentId,
      ...changes,
    });
  }

  async scaleEnvironment(
    organisationId: string,
    environmentId: string,
    scaling: { minInstances?: number; maxInstances?: number }
  ): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/environments/scale', {
      targetOrganisationId: organisationId,
      environmentId,
      ...scaling,
    });
  }

  async addCustomDomain(
    organisationId: string,
    applicationId: string,
    environmentId: string,
    domain: string
  ): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/applications/add-domain', {
      targetOrganisationId: organisationId,
      applicationId,
      environmentId,
      domain,
    });
  }

  async checkCustomDomain(
    organisationId: string,
    applicationId: string,
    environmentId: string
  ): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/applications/check-domain', {
      targetOrganisationId: organisationId,
      applicationId,
      environmentId,
    });
  }

  async getPlatformConfig(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.client.get<Record<string, unknown>>('/api/config/platform');
  }

  async getCloudRunConfig(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.client.get<Record<string, unknown>>('/api/config/cloudrun');
  }
}
