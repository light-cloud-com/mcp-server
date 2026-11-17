// src/token-storage.ts - Persistent token storage for Light Cloud credentials

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The remote server (src/http.ts) runs each request inside this, with the
 * bearer token the request came with: credentials then come from the request,
 * never the file, and nothing is written (the OAuth client refreshes its own).
 */
export const requestCredentials = new AsyncLocalStorage<{ accessToken: string }>();

export interface StoredCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.lightcloud');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function getStoredCredentials(): StoredCredentials | null {
  const remote = requestCredentials.getStore();
  if (remote) return { accessToken: remote.accessToken };
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return null;
    }
    const data = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(data) as StoredCredentials;
  } catch {
    return null;
  }
}

export function storeCredentials(credentials: StoredCredentials): void {
  if (requestCredentials.getStore()) return;
  ensureConfigDir();
  fs.writeFileSync(
    CREDENTIALS_FILE,
    JSON.stringify(credentials, null, 2),
    { mode: 0o600 }
  );
}

export function clearCredentials(): void {
  if (requestCredentials.getStore()) return;
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // Ignore errors when clearing
  }
}

export function getAccessToken(): string | null {
  const credentials = getStoredCredentials();
  return credentials?.accessToken || null;
}

export function getRefreshToken(): string | null {
  const credentials = getStoredCredentials();
  return credentials?.refreshToken || null;
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}
