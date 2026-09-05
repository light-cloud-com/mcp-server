// src/auth.ts - Browser-based OAuth flow for Light Cloud

import * as http from 'http';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { storeCredentials, clearCredentials, getRefreshToken, storeCredentials as updateCredentials } from './token-storage.js';

const CONSOLE_URL = process.env.LIGHT_CLOUD_CONSOLE_URL || 'https://console.light-cloud.com';
const API_URL = process.env.LIGHT_CLOUD_API_URL || 'https://api.light-cloud.com';

interface AuthResult {
  success: boolean;
  message: string;
}

/**
 * Start browser-based login flow
 * Opens browser to Light Cloud auth page, starts local server to receive callback
 */
export async function login(): Promise<AuthResult> {
  return new Promise((resolve) => {
    const state = crypto.randomBytes(16).toString('hex');
    const port = 19836; // Fixed port for predictable callback URL

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const refreshToken = url.searchParams.get('refreshToken');
        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        // Send response to browser

        if (error) {
          finishInBrowser(res, 'error', error);
          server.close();
          resolve({ success: false, message: error });
          return;
        }

        if (returnedState !== state) {
          finishInBrowser(res, 'error', 'Invalid state parameter. Please try again.');
          server.close();
          resolve({ success: false, message: 'Invalid state parameter' });
          return;
        }

        if (!token) {
          finishInBrowser(res, 'error', 'No token received. Please try again.');
          server.close();
          resolve({ success: false, message: 'No token received' });
          return;
        }

        // Store credentials
        storeCredentials({
          accessToken: token,
          refreshToken: refreshToken || undefined,
        });

        finishInBrowser(res, 'success');
        server.close();
        resolve({ success: true, message: 'Successfully logged in to Light Cloud!' });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve({
          success: false,
          message: `Port ${port} is in use. Please close any other Light Cloud login processes and try again.`,
        });
      } else {
        resolve({ success: false, message: `Server error: ${err.message}` });
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const callbackUrl = `http://localhost:${port}/callback`;
      const authUrl = `${CONSOLE_URL}/auth/cli?callback=${encodeURIComponent(callbackUrl)}&state=${state}`;

      // Return the URL for the user to open
      resolve({
        success: true,
        message: `Please open this URL in your browser to login:\n\n${authUrl}\n\nWaiting for authentication...`,
      });

      // Set timeout (5 minutes)
      setTimeout(() => {
        server.close();
      }, 5 * 60 * 1000);
    });
  });
}

/**
 * Start the login flow and wait for completion
 */
export async function startLoginFlow(): Promise<AuthResult> {
  const state = crypto.randomBytes(16).toString('hex');
  const port = 19836;

  return new Promise((resolve) => {
    let resolved = false;

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const refreshToken = url.searchParams.get('refreshToken');
        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');


        if (error) {
          finishInBrowser(res, 'error', error);
          if (!resolved) {
            resolved = true;
            server.close();
            resolve({ success: false, message: error });
          }
          return;
        }

        if (returnedState !== state) {
          finishInBrowser(res, 'error', 'Invalid state parameter. Please try again.');
          if (!resolved) {
            resolved = true;
            server.close();
            resolve({ success: false, message: 'Invalid state parameter' });
          }
          return;
        }

        if (!token) {
          finishInBrowser(res, 'error', 'No token received. Please try again.');
          if (!resolved) {
            resolved = true;
            server.close();
            resolve({ success: false, message: 'No token received' });
          }
          return;
        }

        storeCredentials({
          accessToken: token,
          refreshToken: refreshToken || undefined,
        });

        finishInBrowser(res, 'success');
        if (!resolved) {
          resolved = true;
          server.close();
          resolve({ success: true, message: 'Successfully logged in to Light Cloud!' });
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (!resolved) {
        resolved = true;
        if (err.code === 'EADDRINUSE') {
          resolve({
            success: false,
            message: `Port ${port} is in use. Please close any other Light Cloud login processes and try again.`,
          });
        } else {
          resolve({ success: false, message: `Server error: ${err.message}` });
        }
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const callbackUrl = `http://localhost:${port}/callback`;
      const authUrl = `${CONSOLE_URL}/auth/cli?callback=${encodeURIComponent(callbackUrl)}&state=${state}`;

      // Try to open browser automatically
      openBrowser(authUrl);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.close();
        resolve({ success: false, message: 'Login timed out. Please try again.' });
      }
    }, 5 * 60 * 1000);
  });
}

/**
 * Get the login URL for manual opening
 */
export function getLoginUrl(): string {
  const state = crypto.randomBytes(16).toString('hex');
  const port = 19836;
  const callbackUrl = `http://localhost:${port}/callback`;
  return `${CONSOLE_URL}/auth/cli?callback=${encodeURIComponent(callbackUrl)}&state=${state}`;
}

// Track active login server
let activeLoginServer: http.Server | null = null;

/**
 * Start the login flow without blocking - returns URL immediately
 * The callback server runs in the background and stores credentials when received
 */
export function startNonBlockingLoginFlow(): AuthResult {
  // Close any existing server
  if (activeLoginServer) {
    activeLoginServer.close();
    activeLoginServer = null;
  }

  const state = crypto.randomBytes(16).toString('hex');
  const port = 19836;
  const callbackUrl = `http://localhost:${port}/callback`;
  const authUrl = `${CONSOLE_URL}/auth/cli?callback=${encodeURIComponent(callbackUrl)}&state=${state}`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/callback') {
      const token = url.searchParams.get('token');
      const refreshToken = url.searchParams.get('refreshToken');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');


      if (error) {
        finishInBrowser(res, 'error', error);
        server.close();
        activeLoginServer = null;
        return;
      }

      if (returnedState !== state) {
        finishInBrowser(res, 'error', 'Invalid state parameter. Please try again.');
        server.close();
        activeLoginServer = null;
        return;
      }

      if (!token) {
        finishInBrowser(res, 'error', 'No token received. Please try again.');
        server.close();
        activeLoginServer = null;
        return;
      }

      storeCredentials({
        accessToken: token,
        refreshToken: refreshToken || undefined,
      });

      finishInBrowser(res, 'success');
      server.close();
      activeLoginServer = null;
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Port in use - return error
      return;
    }
  });

  try {
    server.listen(port, '127.0.0.1', () => {
      activeLoginServer = server;
    });
  } catch {
    return {
      success: false,
      message: `Could not start login server on port ${port}. Please try again.`,
    };
  }

  // Timeout after 5 minutes
  setTimeout(() => {
    if (activeLoginServer === server) {
      server.close();
      activeLoginServer = null;
    }
  }, 5 * 60 * 1000);

  // Try to open browser
  const browserOpened = openBrowser(authUrl);

  if (browserOpened) {
    return {
      success: true,
      message: `Login URL (click to open):\n${authUrl}\n\nAfter logging in, use 'whoami' to verify.`,
    };
  } else {
    return {
      success: true,
      message: `Please open this URL to login:\n${authUrl}\n\nAfter logging in, use 'whoami' to verify.`,
    };
  }
}

/**
 * Logout - clear stored credentials
 */
export function logout(): AuthResult {
  clearCredentials();
  return { success: true, message: 'Successfully logged out of Light Cloud.' };
}

/**
 * Refresh the access token using refresh token
 */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': CONSOLE_URL,
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json() as { token: string; refreshToken?: string };
      updateCredentials({
        accessToken: data.token,
        refreshToken: data.refreshToken || refreshToken,
      });
      return true;
    }
  } catch {
    // Refresh failed
  }
  return false;
}

/**
 * Open URL in default browser
 */
function openBrowser(url: string): boolean {
  const platform = process.platform;

  try {
    let child;
    if (platform === 'darwin') {
      child = spawn('open', [url], { detached: true, stdio: 'ignore' });
    } else if (platform === 'win32') {
      child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    } else {
      child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Send the browser on to the console's closing page. The console renders
 * every hand-off screen (CLI, MCP, VS Code, provider connections) with one
 * component, so nothing here carries HTML or a copy of the logo.
 */
function finishInBrowser(
  res: http.ServerResponse,
  kind: 'success' | 'cancelled' | 'error',
  message?: string
): void {
  const target = new URL(`${CONSOLE_URL}/auth/cli`);
  target.searchParams.set('done', message === 'cancelled' ? 'cancelled' : kind);
  target.searchParams.set('client', 'mcp');
  if (message && message !== 'cancelled') target.searchParams.set('message', message);
  res.writeHead(302, { Location: target.toString() });
  res.end();
}
