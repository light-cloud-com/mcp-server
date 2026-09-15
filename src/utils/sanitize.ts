/**
 * Shape API rows for the agent. The backend returns database rows as-is,
 * which carry infrastructure bookkeeping (provider service names, bucket
 * names, region, task ids, hostname ids). None of it is actionable from a
 * chat and it names third-party services, so it is dropped before the
 * agent sees the payload. `deployed_url` is also mirrored to `url` so
 * every tool answers the "where is my site" question the same way.
 */
const HIDDEN_KEY = /^(cloud_run_|cloudflare_|r2_|gcs_|gcp_)|^(bucket_name|infrastructure_id|task_id|password_hash|password_updated_at|uploadPath|upload_path)$/;

export function sanitizeForAgent<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sanitizeForAgent) as unknown as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (HIDDEN_KEY.test(key)) continue;
      out[key] = sanitizeForAgent(entry);
    }
    if (typeof out.deployed_url === 'string' && out.deployed_url && !out.url) {
      out.url = out.deployed_url;
    }
    if (typeof out.url === 'string' && out.url && !/^https?:\/\//.test(out.url)) {
      out.url = `https://${out.url}`;
    }
    return out as T;
  }
  return value;
}
