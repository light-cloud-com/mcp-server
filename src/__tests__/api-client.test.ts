// Tests for src/api-client.ts - HTTP client

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock token-storage module before importing ApiClient
vi.mock('../token-storage.js', () => ({
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  isAuthenticated: vi.fn(),
  storeCredentials: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { ApiClient } from '../api-client.js';
import * as tokenStorage from '../token-storage.js';

describe('ApiClient', () => {
  let client: ApiClient;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    client = new ApiClient();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should use default URLs when environment variables are not set', () => {
      delete process.env.LIGHT_CLOUD_API_URL;
      delete process.env.LIGHT_CLOUD_CONSOLE_URL;

      const defaultClient = new ApiClient();
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('test-token');

      // Make a request to check the URL
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });

      defaultClient.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.light-cloud.com/test',
        expect.any(Object)
      );
    });

    it('should use custom URLs from environment variables', () => {
      process.env.LIGHT_CLOUD_API_URL = 'https://custom-api.example.com';
      process.env.LIGHT_CLOUD_CONSOLE_URL = 'https://custom-console.example.com';

      const customClient = new ApiClient();
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('test-token');

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });

      customClient.get('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-api.example.com/test',
        expect.any(Object)
      );
    });
  });

  describe('isAuthenticated', () => {
    it('should delegate to token storage', () => {
      vi.mocked(tokenStorage.isAuthenticated).mockReturnValue(true);

      const result = client.isAuthenticated();

      expect(result).toBe(true);
      expect(tokenStorage.isAuthenticated).toHaveBeenCalled();
    });

    it('should return false when not authenticated', () => {
      vi.mocked(tokenStorage.isAuthenticated).mockReturnValue(false);

      const result = client.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should make GET request with authorization header', async () => {
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('my-token');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, name: 'test' }),
      });

      const result = await client.get('/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.light-cloud.com/api/test',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-AI-Source': 'claude_code',
            'X-Client-Type': 'mcp',
            'Origin': 'https://console.light-cloud.com',
            'Authorization': 'Bearer my-token',
          },
          body: undefined,
        }
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1, name: 'test' });
    });

    it('should return error when not authenticated', async () => {
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue(null);

      const result = await client.get('/api/test');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNAUTHORIZED');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip auth when skipAuth option is set', async () => {
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue(null);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ public: 'data' }),
      });

      const result = await client.get('/api/public', { skipAuth: true });

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers).not.toHaveProperty('Authorization');
      expect(result.success).toBe(true);
    });
  });

  describe('post', () => {
    it('should make POST request with body', async () => {
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('my-token');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ created: true }),
      });

      const result = await client.post('/api/create', { name: 'test', value: 42 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.light-cloud.com/api/create',
        {
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer my-token',
          }),
          body: JSON.stringify({ name: 'test', value: 42 }),
        }
      );
      expect(result.success).toBe(true);
    });

    it('should handle POST without body', async () => {
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('my-token');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: 'ok' }),
      });

      await client.post('/api/action');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        })
      );
    });
  });

  describe('put', () => {
    it('should make PUT request with body', async () => {
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('my-token');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ updated: true }),
      });

      const result = await client.put('/api/update/123', { name: 'updated' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.light-cloud.com/api/update/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'updated' }),
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe('delete', () => {
    it('should make DELETE request', async () => {
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('my-token');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deleted: true }),
      });

      const result = await client.delete('/api/resource/123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.light-cloud.com/api/resource/123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('my-token');
    });

    it('should handle 400 Bad Request', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ code: 'INVALID_INPUT', message: 'Name is required' }),
      });

      const result = await client.post('/api/create', {});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_INPUT');
      expect(result.error?.message).toBe('Name is required');
    });

    it('should handle 404 Not Found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ code: 'NOT_FOUND', message: 'Resource not found' }),
      });

      const result = await client.get('/api/resource/999');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should handle 500 Internal Server Error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Something went wrong' }),
      });

      const result = await client.get('/api/test');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HTTP_500');
      expect(result.error?.message).toBe('Something went wrong');
    });

    it('should handle error response without JSON body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => {
          throw new Error('Not JSON');
        },
      });

      const result = await client.get('/api/test');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HTTP_503');
      expect(result.error?.message).toBe('Service Unavailable');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const result = await client.get('/api/test');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.message).toBe('Network failure');
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('String error');

      const result = await client.get('/api/test');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.message).toBe('Network request failed');
    });
  });

  describe('token refresh flow', () => {
    beforeEach(() => {
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('expired-token');
    });

    it('should refresh token on 401 and retry request', async () => {
      vi.mocked(tokenStorage.getRefreshToken).mockReturnValue('refresh-token');

      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Token expired' }),
      });

      // Refresh call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        }),
      });

      // Update mock to return new token for retry
      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('new-access-token');

      // Retry succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      });

      const result = await client.get('/api/protected');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'success' });
      expect(tokenStorage.storeCredentials).toHaveBeenCalledWith({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should return error when refresh token is not available', async () => {
      vi.mocked(tokenStorage.getRefreshToken).mockReturnValue(null);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Token expired' }),
      });

      const result = await client.get('/api/protected');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNAUTHORIZED');
      expect(result.error?.message).toBe('Session expired. Please login again.');
    });

    it('should return error when refresh request fails', async () => {
      vi.mocked(tokenStorage.getRefreshToken).mockReturnValue('refresh-token');

      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Token expired' }),
      });

      // Refresh call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Refresh token expired' }),
      });

      const result = await client.get('/api/protected');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNAUTHORIZED');
      expect(result.error?.message).toBe('Session expired. Please login again.');
    });

    it('should handle network error during refresh', async () => {
      vi.mocked(tokenStorage.getRefreshToken).mockReturnValue('refresh-token');

      // First call returns 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Token expired' }),
      });

      // Refresh call throws
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.get('/api/protected');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNAUTHORIZED');
    });

    it('should preserve original refresh token if new one not provided', async () => {
      vi.mocked(tokenStorage.getRefreshToken).mockReturnValue('original-refresh');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({}),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'new-access-token',
          // No refreshToken in response
        }),
      });

      vi.mocked(tokenStorage.getAccessToken).mockReturnValue('new-access-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      });

      await client.get('/api/protected');

      expect(tokenStorage.storeCredentials).toHaveBeenCalledWith({
        accessToken: 'new-access-token',
        refreshToken: 'original-refresh',
      });
    });
  });
});
