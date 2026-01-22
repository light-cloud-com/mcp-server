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
        res.writeHead(200, { 'Content-Type': 'text/html' });

        if (error) {
          res.end(getErrorHtml(error));
          server.close();
          resolve({ success: false, message: error });
          return;
        }

        if (returnedState !== state) {
          res.end(getErrorHtml('Invalid state parameter. Please try again.'));
          server.close();
          resolve({ success: false, message: 'Invalid state parameter' });
          return;
        }

        if (!token) {
          res.end(getErrorHtml('No token received. Please try again.'));
          server.close();
          resolve({ success: false, message: 'No token received' });
          return;
        }

        // Store credentials
        storeCredentials({
          accessToken: token,
          refreshToken: refreshToken || undefined,
        });

        res.end(getSuccessHtml());
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

        res.writeHead(200, { 'Content-Type': 'text/html' });

        if (error) {
          res.end(getErrorHtml(error));
          if (!resolved) {
            resolved = true;
            server.close();
            resolve({ success: false, message: error });
          }
          return;
        }

        if (returnedState !== state) {
          res.end(getErrorHtml('Invalid state parameter. Please try again.'));
          if (!resolved) {
            resolved = true;
            server.close();
            resolve({ success: false, message: 'Invalid state parameter' });
          }
          return;
        }

        if (!token) {
          res.end(getErrorHtml('No token received. Please try again.'));
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

        res.end(getSuccessHtml());
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

      res.writeHead(200, { 'Content-Type': 'text/html' });

      if (error) {
        res.end(getErrorHtml(error));
        server.close();
        activeLoginServer = null;
        return;
      }

      if (returnedState !== state) {
        res.end(getErrorHtml('Invalid state parameter. Please try again.'));
        server.close();
        activeLoginServer = null;
        return;
      }

      if (!token) {
        res.end(getErrorHtml('No token received. Please try again.'));
        server.close();
        activeLoginServer = null;
        return;
      }

      storeCredentials({
        accessToken: token,
        refreshToken: refreshToken || undefined,
      });

      res.end(getSuccessHtml());
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
      const data = await response.json() as { accessToken: string; refreshToken?: string };
      updateCredentials({
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

function getSuccessHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Light Cloud - Login Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
    }
    .checkmark {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #10b981;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto 1.5rem;
    }
    .checkmark svg {
      width: 40px;
      height: 40px;
      fill: white;
    }
    h1 {
      color: #1f2937;
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
    }
    p {
      color: #6b7280;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">
      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    </div>
    <h1>Login Successful!</h1>
    <p>You can close this window and return to Claude.</p>
  </div>
</body>
</html>`;
}

function getErrorHtml(error: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Light Cloud - Login Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
    }
    .error-icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #ef4444;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto 1.5rem;
    }
    .error-icon svg {
      width: 40px;
      height: 40px;
      fill: white;
    }
    h1 {
      color: #1f2937;
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
    }
    p {
      color: #6b7280;
      margin: 0;
    }
    .error-message {
      background: #fef2f2;
      color: #dc2626;
      padding: 1rem;
      border-radius: 8px;
      margin-top: 1rem;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </div>
    <h1>Login Failed</h1>
    <p>There was a problem logging in to Light Cloud.</p>
    <div class="error-message">${error}</div>
  </div>
</body>
</html>`;
}
