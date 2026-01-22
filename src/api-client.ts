// src/api-client.ts - HTTP client for Light Cloud API

import { ApiResponse } from './types.js';
import { getAccessToken, isAuthenticated, storeCredentials, getRefreshToken } from './token-storage.js';

export class ApiClient {
  private baseUrl: string;
  private consoleUrl: string;

  constructor() {
    this.baseUrl = process.env.LIGHT_CLOUD_API_URL || 'https://api.light-cloud.com';
    this.consoleUrl = process.env.LIGHT_CLOUD_CONSOLE_URL || 'https://console.light-cloud.com';
  }

  isAuthenticated(): boolean {
    return isAuthenticated();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { skipAuth?: boolean } = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-AI-Source': 'claude_code',
      'Origin': this.consoleUrl,
    };

    if (!options.skipAuth) {
      const token = getAccessToken();
      if (!token) {
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated. Please use the login tool first.' }
        };
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle 401 - try to refresh token
      if (response.status === 401 && !options.skipAuth) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry with new token
          return this.request<T>(method, path, body, options);
        }
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Session expired. Please login again.' }
        };
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            code: errorBody.code || `HTTP_${response.status}`,
            message: errorBody.message || response.statusText
          }
        };
      }

      const data = await response.json();
      return { success: true, data };

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network request failed'
        }
      };
    }
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': this.consoleUrl,
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json() as { accessToken: string; refreshToken?: string };
        storeCredentials({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || refreshToken,
        });
        return true;
      }
    } catch {
      // Refresh failed
    }
    return false;
  }

  async get<T>(path: string, options?: { skipAuth?: boolean }): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: { skipAuth?: boolean }): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }
}
