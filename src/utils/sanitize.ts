/**
 * Shape API rows for the agent. The backend returns database rows as-is,
 * which carry infrastructure bookkeeping (provider service names, bucket
 * names, region, task ids, hostname ids). None of it is actionable from a
 * chat and it names third-party services, so it is dropped before the
 * agent sees the payload. `deployed_url` is also mirrored to `url` so
 * every tool answers the "where is my site" question the same way.
 *
 * Secrets are dropped the same way: a list or get must never put a
 * password, connection string, token or variable set into the transcript
 * as a side effect. The few tools whose job is to return one
 * (get-database-connection-string, get-environment-variables, the device
 * sign-in poll, create-api-key) name the keys they need in `allow`.
 */
const HIDDEN_KEY = /^(cloud_run_|cloudflare_|r2_|gcs_|gcp_)|^(bucket_name|infrastructure_id|task_id|password_hash|password_updated_at|uploadPath|upload_path|admin_password_encrypted|admin_password|connection_string|connectionString|environment_vars|environmentVariables|password|secret|token)$/;

export interface SanitizeOptions {
  /** Keys kept even though HIDDEN_KEY matches them, at any depth. */
  allow?: readonly string[];
}

export function sanitizeForAgent<T>(value: T, options: SanitizeOptions = {}): T {
  const allow = new Set(options.allow ?? []);
  const walk = <V>(node: V): V => {
    if (Array.isArray(node)) {
      return node.map(walk) as unknown as V;
    }
    if (node && typeof node === 'object' && !(node instanceof Date)) {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(node as Record<string, unknown>)) {
        if (HIDDEN_KEY.test(key) && !allow.has(key)) continue;
        out[key] = walk(entry);
      }
      if (typeof out.deployed_url === 'string' && out.deployed_url && !out.url) {
        out.url = out.deployed_url;
      }
      if (typeof out.url === 'string' && out.url && !/^https?:\/\//.test(out.url)) {
        out.url = `https://${out.url}`;
      }
      return out as V;
    }
    return node;
  };
  return walk(value);
}
