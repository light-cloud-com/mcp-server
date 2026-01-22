// src/token-storage.ts - Persistent token storage for Light Cloud credentials

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  ensureConfigDir();
  fs.writeFileSync(
    CREDENTIALS_FILE,
    JSON.stringify(credentials, null, 2),
    { mode: 0o600 }
  );
}

export function clearCredentials(): void {
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
