// Tests for src/token-storage.ts - Credential storage functions

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock the fs module
vi.mock('fs');
vi.mock('os', async () => {
  const actual = await vi.importActual('os');
  return {
    ...actual,
    homedir: vi.fn(() => '/home/testuser'),
  };
});

// Import after mocking
import {
  getStoredCredentials,
  storeCredentials,
  clearCredentials,
  getAccessToken,
  getRefreshToken,
  isAuthenticated,
  StoredCredentials,
} from '../token-storage.js';

const CONFIG_DIR = '/home/testuser/.lightcloud';
const CREDENTIALS_FILE = '/home/testuser/.lightcloud/credentials.json';

describe('token-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStoredCredentials', () => {
    it('should return null when credentials file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getStoredCredentials();

      expect(result).toBeNull();
      expect(fs.existsSync).toHaveBeenCalledWith(CREDENTIALS_FILE);
    });

    it('should return credentials when file exists and is valid', () => {
      const credentials: StoredCredentials = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: '2024-12-31T23:59:59Z',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(credentials));

      const result = getStoredCredentials();

      expect(result).toEqual(credentials);
      expect(fs.readFileSync).toHaveBeenCalledWith(CREDENTIALS_FILE, 'utf-8');
    });

    it('should return credentials without optional fields', () => {
      const credentials: StoredCredentials = {
        accessToken: 'test-access-token',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(credentials));

      const result = getStoredCredentials();

      expect(result).toEqual(credentials);
      expect(result?.refreshToken).toBeUndefined();
    });

    it('should return null when file read fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = getStoredCredentials();

      expect(result).toBeNull();
    });

    it('should return null when file contains invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json {{{');

      const result = getStoredCredentials();

      expect(result).toBeNull();
    });
  });

  describe('storeCredentials', () => {
    it('should create config directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const credentials: StoredCredentials = {
        accessToken: 'test-token',
      };

      storeCredentials(credentials);

      expect(fs.existsSync).toHaveBeenCalledWith(CONFIG_DIR);
      expect(fs.mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true, mode: 0o700 });
    });

    it('should not create config directory if it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const credentials: StoredCredentials = {
        accessToken: 'test-token',
      };

      storeCredentials(credentials);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should write credentials with correct permissions', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const credentials: StoredCredentials = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      };

      storeCredentials(credentials);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CREDENTIALS_FILE,
        JSON.stringify(credentials, null, 2),
        { mode: 0o600 }
      );
    });

    it('should store credentials with all fields', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const credentials: StoredCredentials = {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        expiresAt: '2024-12-31T23:59:59Z',
      };

      storeCredentials(credentials);

      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);

      expect(parsed.accessToken).toBe('access-123');
      expect(parsed.refreshToken).toBe('refresh-456');
      expect(parsed.expiresAt).toBe('2024-12-31T23:59:59Z');
    });
  });

  describe('clearCredentials', () => {
    it('should delete credentials file when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

      clearCredentials();

      expect(fs.unlinkSync).toHaveBeenCalledWith(CREDENTIALS_FILE);
    });

    it('should not throw when credentials file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => clearCredentials()).not.toThrow();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should not throw when unlink fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => clearCredentials()).not.toThrow();
    });
  });

  describe('getAccessToken', () => {
    it('should return access token when credentials exist', () => {
      const credentials: StoredCredentials = {
        accessToken: 'my-access-token',
        refreshToken: 'my-refresh-token',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(credentials));

      const result = getAccessToken();

      expect(result).toBe('my-access-token');
    });

    it('should return null when credentials do not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getAccessToken();

      expect(result).toBeNull();
    });

    it('should return null when access token is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const result = getAccessToken();

      expect(result).toBeNull();
    });
  });

  describe('getRefreshToken', () => {
    it('should return refresh token when credentials exist', () => {
      const credentials: StoredCredentials = {
        accessToken: 'my-access-token',
        refreshToken: 'my-refresh-token',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(credentials));

      const result = getRefreshToken();

      expect(result).toBe('my-refresh-token');
    });

    it('should return null when refresh token is not present', () => {
      const credentials: StoredCredentials = {
        accessToken: 'my-access-token',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(credentials));

      const result = getRefreshToken();

      expect(result).toBeNull();
    });

    it('should return null when credentials do not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getRefreshToken();

      expect(result).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when access token exists', () => {
      const credentials: StoredCredentials = {
        accessToken: 'my-access-token',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(credentials));

      const result = isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return false when credentials do not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = isAuthenticated();

      expect(result).toBe(false);
    });

    it('should return false when access token is empty', () => {
      const credentials = {
        accessToken: '',
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(credentials));

      const result = isAuthenticated();

      expect(result).toBe(false);
    });
  });
});
