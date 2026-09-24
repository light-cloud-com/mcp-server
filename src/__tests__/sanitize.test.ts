// Tests for src/utils/sanitize.ts - response shaping for the agent

import { describe, it, expect } from 'vitest';
import { sanitizeForAgent } from '../utils/sanitize.js';

describe('sanitizeForAgent', () => {
  it('drops infrastructure bookkeeping keys and mirrors deployed_url to url', () => {
    const out = sanitizeForAgent({
      id: 'env-1',
      cloud_run_service: 'svc',
      bucket_name: 'bucket',
      deployed_url: 'app.light-cloud.io',
    });
    expect(out).toEqual({ id: 'env-1', deployed_url: 'app.light-cloud.io', url: 'https://app.light-cloud.io' });
  });

  it('drops secrets from list and get payloads at any depth', () => {
    const out = sanitizeForAgent({
      databases: [
        { id: 'db-1', admin_user: 'postgres', admin_password_encrypted: 'enc:v1:xxx', admin_password: 'pw' },
      ],
      environment: {
        id: 'env-1',
        environment_vars: { DATABASE_URL: 'postgres://x' },
        environmentVariables: { A: '1' },
        connection_string: 'postgres://x',
        connectionString: 'postgres://x',
        password: 'pw',
        secret: 's',
        token: 't',
      },
    });
    expect(out).toEqual({
      databases: [{ id: 'db-1', admin_user: 'postgres' }],
      environment: { id: 'env-1' },
    });
  });

  it('keeps allowed keys for tools whose purpose is to return them', () => {
    const payload = {
      connectionString: 'postgres://u:p@h/db',
      password: 'p',
      environment_vars: { KEY: 'v' },
      token: 't',
      secret: 's',
      cloud_run_url: 'still hidden',
    };
    expect(sanitizeForAgent(payload, { allow: ['connectionString', 'password'] })).toEqual({
      connectionString: 'postgres://u:p@h/db',
      password: 'p',
    });
    expect(sanitizeForAgent(payload, { allow: ['environment_vars'] })).toEqual({
      environment_vars: { KEY: 'v' },
    });
    expect(sanitizeForAgent(payload, { allow: ['token', 'secret'] })).toEqual({ token: 't', secret: 's' });
  });

  it('does not treat prefixed keys as the secret itself', () => {
    // password_updated_at is bookkeeping (hidden); refreshToken and
    // passwordEnabled are neither the secret key nor a hidden prefix.
    const out = sanitizeForAgent({ refreshToken: 'r', passwordEnabled: true, password_updated_at: 'x' });
    expect(out).toEqual({ refreshToken: 'r', passwordEnabled: true });
  });

  it('leaves primitives, arrays and dates alone', () => {
    const when = new Date('2026-01-01T00:00:00Z');
    expect(sanitizeForAgent('text')).toBe('text');
    expect(sanitizeForAgent([1, 'a'])).toEqual([1, 'a']);
    expect(sanitizeForAgent({ when })).toEqual({ when });
  });
});
