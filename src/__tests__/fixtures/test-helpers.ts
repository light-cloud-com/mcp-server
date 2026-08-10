// Test helper utilities

import { vi } from 'vitest';
import type { ApiResponse } from '../../types.js';

/**
 * Creates a mock ApiClient with all methods stubbed
 */
export function createMockApiClient() {
  return {
    isAuthenticated: vi.fn(() => true),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

/**
 * Creates a mock successful API response
 */
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Creates a mock error API response
 */
export function createErrorResponse(code: string, message: string): ApiResponse<never> {
  return {
    success: false,
    error: { code, message },
  };
}

/**
 * Creates a mock fetch function for testing HTTP requests
 */
export function createMockFetch(responses: Map<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string, options?: RequestInit) => {
    const key = `${options?.method || 'GET'} ${url}`;
    const response = responses.get(key);

    if (!response) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ message: 'Not found' }),
      } as Response;
    }

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 200 ? 'OK' : 'Error',
      json: async () => response.body,
    } as Response;
  });
}

/**
 * Creates mock file system functions
 */
export function createMockFs() {
  const files = new Map<string, string>();

  return {
    existsSync: vi.fn((path: string) => files.has(path)),
    readFileSync: vi.fn((path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return content;
    }),
    writeFileSync: vi.fn((path: string, content: string) => {
      files.set(path, content);
    }),
    unlinkSync: vi.fn((path: string) => {
      if (!files.has(path)) {
        throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
      }
      files.delete(path);
    }),
    mkdirSync: vi.fn(),
    _files: files, // Expose for test manipulation
    _setFile: (path: string, content: string) => files.set(path, content),
    _clear: () => files.clear(),
  };
}

/**
 * Creates mock token storage module
 */
export function createMockTokenStorage() {
  let credentials: { accessToken: string; refreshToken?: string } | null = null;

  return {
    getStoredCredentials: vi.fn(() => credentials),
    storeCredentials: vi.fn((creds: { accessToken: string; refreshToken?: string }) => {
      credentials = creds;
    }),
    clearCredentials: vi.fn(() => {
      credentials = null;
    }),
    getAccessToken: vi.fn(() => credentials?.accessToken || null),
    getRefreshToken: vi.fn(() => credentials?.refreshToken || null),
    isAuthenticated: vi.fn(() => credentials?.accessToken !== undefined),
    _setCredentials: (creds: { accessToken: string; refreshToken?: string } | null) => {
      credentials = creds;
    },
  };
}

/**
 * Creates a mock HTTP server response
 */
export function createMockServerResponse() {
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let body = '';

  return {
    writeHead: vi.fn((code: number, hdrs?: Record<string, string>) => {
      statusCode = code;
      if (hdrs) headers = hdrs;
    }),
    end: vi.fn((content?: string) => {
      if (content) body = content;
    }),
    _getStatus: () => statusCode,
    _getHeaders: () => headers,
    _getBody: () => body,
  };
}

/**
 * Wait for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Suppress console output during tests
 */
export function suppressConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeEach(() => {
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  });
}
