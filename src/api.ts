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

  /**
   * Visitor password gate on an environment. `password` undefined or
   * empty turns the gate off; anything else sets (or rotates) it.
   */
  async setEnvironmentPassword(
    organisationId: string,
    environmentId: string,
    password?: string
  ): Promise<ApiResponse<{ passwordEnabled: boolean }>> {
    const enabled = Boolean(password);
    return this.client.post<{ passwordEnabled: boolean }>('/api/environments/password', {
      targetOrganisationId: organisationId,
      environmentId,
      enabled,
      ...(enabled ? { password } : {}),
    });
  }

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

  // ============ Parity with the console (2026-09-15) ============
  // Thin wrappers: the backend validates, the sanitizer trims the answer.

  private org(organisationId: string, rest: Record<string, unknown> = {}) {
    return { targetOrganisationId: organisationId, ...rest };
  }

  // -- applications & environments --
  async updateApplication(organisationId: string, applicationId: string, changes: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/applications/update', this.org(organisationId, { applicationId, ...changes }));
  }
  async renameApplication(organisationId: string, applicationId: string, name: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/applications/rename', this.org(organisationId, { applicationId, name }));
  }
  async moveApplication(organisationId: string, applicationId: string, targetFolderId: string | null): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/applications/move', this.org(organisationId, { applicationId, targetFolderId }));
  }
  async removeCustomDomain(organisationId: string, applicationId: string, environmentId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/applications/remove-domain', this.org(organisationId, { applicationId, environmentId }));
  }
  async retryCustomDomain(organisationId: string, environmentId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/environments/retry-domain', this.org(organisationId, { environmentId }));
  }
  async listRepoDirectories(organisationId: string, owner: string, repo: string, branch: string, path?: string, gitProvider?: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/applications/list-repo-directories', { organisationId, owner, repo, branch, path, gitProvider });
  }
  async getEnvironmentMetrics(organisationId: string, environmentId: string, timeRange?: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/environments/metrics/detailed', this.org(organisationId, { environmentId, timeRange }));
  }
  async getEnvironmentActivity(organisationId: string, environmentId: string, limit?: number): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/environments/activity', this.org(organisationId, { environmentId, limit }));
  }
  async getEnvironmentRuntime(organisationId: string, environmentId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/environments/runtime', this.org(organisationId, { environmentId }));
  }
  async getBuildLogs(organisationId: string, deploymentId: string, pageToken?: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/deployments/build-logs', this.org(organisationId, { deploymentId, pageToken }));
  }
  async rollbackDeployment(organisationId: string, environmentId: string, deploymentId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/deployments/rollback', this.org(organisationId, { environmentId, deploymentId }));
  }

  // -- projects (folders) --
  async listProjects(organisationId: string, parentId?: string | null): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/projects', this.org(organisationId, { page: 1, limit: 100, parentId: parentId ?? undefined }));
  }
  async createProject(organisationId: string, name: string, parentId?: string | null): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/projects/create', this.org(organisationId, { name, type: 'folder', parentId: parentId ?? undefined }));
  }
  async deleteProject(organisationId: string, projectId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/projects/delete', this.org(organisationId, { projectId }));
  }

  // -- stacks --
  async createStack(organisationId: string, stackId: string, body: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/stacks/create', this.org(organisationId, { stackId, ...body }));
  }

  // -- databases --
  async updateDatabase(organisationId: string, databaseId: string, changes: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/databases/update', this.org(organisationId, { databaseId, ...changes }));
  }
  async deleteDatabase(organisationId: string, databaseId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/databases/delete', this.org(organisationId, { databaseId }));
  }
  async rotateDatabasePassword(organisationId: string, databaseId: string, newPassword?: string): Promise<ApiResponse<{ password: string }>> {
    return this.client.post('/api/databases/rotate-password', this.org(organisationId, { databaseId, newPassword }));
  }
  async getDatabaseMetrics(organisationId: string, databaseId: string, timeRange?: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/databases/metrics', this.org(organisationId, { databaseId, timeRange }));
  }
  async getDatabaseSchema(organisationId: string, databaseId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/databases/explorer/schema', this.org(organisationId, { databaseId }));
  }
  async queryDatabase(organisationId: string, databaseId: string, sql: string, allowWrites = false): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/databases/explorer/query', this.org(organisationId, { databaseId, sql, allowWrites }));
  }
  async dumpDatabase(organisationId: string, databaseId: string): Promise<Response> {
    return this.client.raw('POST', '/api/databases/dump', {
      body: JSON.stringify(this.org(organisationId, { databaseId })),
      contentType: 'application/json',
    });
  }
  async importDatabase(organisationId: string, databaseId: string, body: BodyInit, gzip: boolean): Promise<Response> {
    const query = new URLSearchParams({ targetOrganisationId: organisationId, databaseId });
    return this.client.raw('POST', `/api/databases/import?${query}`, {
      body,
      contentType: gzip ? 'application/gzip' : 'application/sql',
    });
  }

  // -- billing --
  async getUsage(organisationId: string, days = 30): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/billing/usage', this.org(organisationId, { includeDaily: true, days }));
  }
  async getUsageHistory(organisationId: string, days = 30): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/billing/usage-history', this.org(organisationId, { days }));
  }
  async listInvoices(organisationId: string, limit = 20, status?: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/billing/invoices', this.org(organisationId, { limit, status }));
  }
  async getInvoice(organisationId: string, invoiceId: string): Promise<ApiResponse<unknown>> {
    return this.client.post(`/api/billing/invoice/${encodeURIComponent(invoiceId)}`, this.org(organisationId));
  }
  async getOutstanding(): Promise<ApiResponse<unknown>> {
    return this.client.get('/api/billing/outstanding');
  }
  async retryInvoice(organisationId: string, invoiceId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/billing/invoice/retry', this.org(organisationId, { invoiceId }));
  }
  async removePaymentMethod(organisationId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/billing/payment-method/remove', this.org(organisationId));
  }
  async getBillingSettings(organisationId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/billing/settings/get', this.org(organisationId));
  }
  async setBillingSettings(organisationId: string, settings: { spending_limit?: number | null; budget_alert_threshold?: number | null }): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/billing/settings', this.org(organisationId, settings));
  }
  async getBillingDetails(organisationId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/billing/details/get', this.org(organisationId));
  }
  async setBillingDetails(organisationId: string, details: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/billing/details', this.org(organisationId, details));
  }

  // -- workspaces, members, roles --
  async createOrganisation(name: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/organisations/create', { name });
  }
  async listMembers(organisationId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/users', this.org(organisationId, { page: 1, limit: 100 }));
  }
  async inviteMember(organisationId: string, email: string, role: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/users/invite', this.org(organisationId, { email, role }));
  }
  async removeMember(organisationId: string, userId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/users/remove', this.org(organisationId, { userId }));
  }
  async setMemberRole(organisationId: string, userId: string, newRole: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/users/update-role', this.org(organisationId, { userId, newRole }));
  }
  async listRoles(organisationId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/roles/all', this.org(organisationId));
  }

  // -- profile & account --
  async setProfileName(firstName: string, lastName: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/profile/name', { firstName, lastName });
  }
  async setTimezone(timezone: string): Promise<ApiResponse<unknown>> {
    return this.client.put('/api/profile/timezone', { timezone, source: 'manual' });
  }
  async listSessions(): Promise<ApiResponse<unknown>> {
    return this.client.get('/api/auth/sessions');
  }
  async revokeSession(sessionId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/auth/sessions/revoke', { sessionId });
  }
  async getAgentAccess(): Promise<ApiResponse<unknown>> {
    return this.client.get('/api/profile/agent-access');
  }

  // -- git providers --
  async gitProviderConnectUrl(provider: 'gitlab' | 'bitbucket', organisationId: string): Promise<ApiResponse<{ url: string }>> {
    const query = new URLSearchParams({ organisationId });
    return this.client.get<{ url: string }>(`/api/${provider}/connect?${query}`);
  }
  async listGitProviderRepositories(provider: 'gitlab' | 'bitbucket', organisationId: string): Promise<ApiResponse<unknown>> {
    return this.client.get(`/api/${provider}/organisation/${organisationId}/repositories`);
  }

  // -- API keys --
  async listApiKeys(organisationId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/api-keys', this.org(organisationId));
  }
  async createApiKey(organisationId: string, name: string, role?: string, expiresAt?: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/api-keys/create', this.org(organisationId, { name, role, expiresAt }));
  }
  async revokeApiKey(organisationId: string, keyId: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/api-keys/revoke', this.org(organisationId, { keyId }));
  }

  // -- notifications & support --
  async listNotifications(unreadOnly = false, limit = 20): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/notifications/list', { page: 1, limit, unreadOnly });
  }
  async markNotificationsRead(notificationId?: string): Promise<ApiResponse<unknown>> {
    return notificationId
      ? this.client.post('/api/notifications/mark-read', { notificationId })
      : this.client.post('/api/notifications/mark-all-read', {});
  }
  async contactSupport(kind: string, subject: string, message: string): Promise<ApiResponse<unknown>> {
    return this.client.post('/api/support/request', { kind, subject, message });
  }
}
