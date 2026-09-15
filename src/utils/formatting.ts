// src/utils/formatting.ts - Status and list formatting helpers

import type {
  Application,
  Environment,
  DeploymentStatus,
  FormattedEnvironmentRow,
  FormattedApplicationRow,
} from '../types.js';

export const DASHBOARD_BASE_URL = process.env.LIGHT_CLOUD_CONSOLE_URL || 'https://console.light-cloud.com';

/**
 * Get emoji for deployment status
 */
export function getStatusEmoji(status: DeploymentStatus): string {
  switch (status) {
    case 'healthy':
      return '\u2705'; // Green check
    case 'building':
      return '\ud83d\udd28'; // Hammer
    case 'deploying':
      return '\ud83d\ude80'; // Rocket
    case 'pending':
      return '\u23f3'; // Hourglass
    case 'degraded':
      return '\u26a0\ufe0f'; // Warning
    case 'failed':
      return '\u274c'; // Red X
    case 'deleting':
      return '\ud83d\uddd1\ufe0f'; // Trash
    default:
      return '\u2753'; // Question mark
  }
}

/**
 * Format relative time
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    return date.toLocaleDateString();
  } else if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return 'just now';
  }
}

/**
 * Format environment row for table display
 */
export function formatEnvironmentRow(env: Environment): FormattedEnvironmentRow {
  return {
    name: env.name,
    status: env.status,
    statusEmoji: getStatusEmoji(env.status),
    source: env.github_branch || 'upload',
    lastDeploy: formatRelativeTime(env.updated_at),
    url: env.url,
  };
}

/**
 * Format application row for table display
 */
export function formatApplicationRow(app: Application, organisationSlug?: string): FormattedApplicationRow {
  return {
    name: app.name,
    status: app.status,
    statusEmoji: getStatusEmoji(app.status),
    type: app.deployment_type,
    url: app.url,
    dashboardUrl: `${DASHBOARD_BASE_URL}/applications/${app.id}`,
  };
}

/**
 * Generate markdown table from environment rows
 */
export function generateEnvironmentTable(environments: Environment[]): string {
  if (environments.length === 0) {
    return 'No environments found.';
  }

  const rows = environments.map(formatEnvironmentRow);

  const lines: string[] = [
    '| Environment | Status | Source | Last Deploy | URL |',
    '|-------------|--------|--------|-------------|-----|',
  ];

  for (const row of rows) {
    const urlCell = row.url ? `[Link](${row.url})` : '-';
    lines.push(
      `| ${row.name} | ${row.statusEmoji} ${row.status} | ${row.source} | ${row.lastDeploy} | ${urlCell} |`
    );
  }

  return lines.join('\n');
}

/**
 * Generate markdown table from application rows
 */
export function generateApplicationTable(applications: Application[], organisationSlug?: string): string {
  if (applications.length === 0) {
    return 'No applications found.';
  }

  const rows = applications.map((app) => formatApplicationRow(app, organisationSlug));

  const lines: string[] = [
    '| Application | Status | Type | URL | Dashboard |',
    '|-------------|--------|------|-----|-----------|',
  ];

  for (const row of rows) {
    const urlCell = row.url ? `[Link](${row.url})` : '-';
    lines.push(
      `| ${row.name} | ${row.statusEmoji} ${row.status} | ${row.type} | ${urlCell} | [Open](${row.dashboardUrl}) |`
    );
  }

  return lines.join('\n');
}

/**
 * Generate formatted status output for an application
 */
export function generateFormattedStatus(app: Application, organisationSlug?: string): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${app.name}`);
  lines.push('');

  // Status summary
  const emoji = getStatusEmoji(app.status);
  lines.push(`**Status:** ${emoji} ${app.status}`);
  lines.push(`**Type:** ${app.deployment_type}`);

  if (app.framework) {
    lines.push(`**Framework:** ${app.framework}`);
  }

  if (app.url) {
    lines.push(`**URL:** ${app.url}`);
  }

  // Source info
  if (app.source_type === 'github' && app.github_repo_url) {
    lines.push(`**Source:** GitHub - ${app.github_repo_url}`);
    if (app.github_branch) {
      lines.push(`**Branch:** ${app.github_branch}`);
    }
  } else {
    lines.push('**Source:** Upload');
  }

  lines.push('');

  // Dashboard link
  const dashboardUrl = `${DASHBOARD_BASE_URL}/applications/${app.id}`;
  lines.push(`[Open in Dashboard](${dashboardUrl})`);
  lines.push('');

  // Environments table
  if (app.environments && app.environments.length > 0) {
    lines.push('## Environments');
    lines.push('');
    lines.push(generateEnvironmentTable(app.environments));
    lines.push('');

    // Check for issues
    const issues = app.environments.filter((e) => e.status === 'failed' || e.status === 'degraded');
    if (issues.length > 0) {
      lines.push('### Issues Detected');
      lines.push('');
      for (const env of issues) {
        lines.push(`- **${env.name}**: ${getStatusEmoji(env.status)} ${env.status}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Generate formatted list output for applications
 */
export function generateFormattedList(applications: Application[], organisationSlug?: string): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Applications (${applications.length})`);
  lines.push('');

  if (applications.length === 0) {
    lines.push('No applications found.');
    lines.push('');
    lines.push('**Next steps:**');
    lines.push('- Create a new application from GitHub using `create-application`');
    lines.push('- Or deploy a local project using `upload-and-deploy`');
    return lines.join('\n');
  }

  // Table
  lines.push(generateApplicationTable(applications, organisationSlug));
  lines.push('');

  // Summary
  const healthyCount = applications.filter((a) => a.status === 'healthy').length;
  const issueCount = applications.filter((a) => a.status === 'failed' || a.status === 'degraded').length;

  lines.push('## Summary');
  lines.push(`- ${getStatusEmoji('healthy')} Healthy: ${healthyCount}`);
  if (issueCount > 0) {
    lines.push(`- ${getStatusEmoji('failed')} Issues: ${issueCount}`);
  }
  lines.push('');

  // Suggested actions
  if (issueCount > 0) {
    lines.push('**Suggested actions:**');
    lines.push('- Check logs for failed/degraded applications using `get-environment-logs`');
    lines.push('- Redeploy using `deploy-application`');
  }

  return lines.join('\n');
}
