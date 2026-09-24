// src/device-auth.ts - Device-code sign-in (RFC 8628) for Light Cloud
//
// The loopback flow in auth.ts needs a browser on this machine. This one
// does not: the backend hands out a short code, the person types it on
// console.light-cloud.com/device from any device (a phone will do), and we
// poll until they approve. An unknown email gets an account on approval, so
// this is also the sign-up path — no password ever passes through here.

import * as os from 'os';
import { ApiClient } from './api-client.js';
import { storeCredentials } from './token-storage.js';

const CLIENT_NAME = `Claude Code on ${os.hostname()}`;

interface StartResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
  newAccount: boolean;
  emailSent: boolean;
}

type PollResponse =
  | { status: 'authorization_pending' }
  | { status: 'slow_down' }
  | { status: 'expired_token' }
  | { status: 'access_denied' }
  | { status: 'approved'; token: string; refreshToken: string; user: { id: string; email: string } };

export type ConnectState =
  | { phase: 'idle' }
  | {
      phase: 'pending';
      email: string;
      userCode: string;
      verificationUrl: string;
      newAccount: boolean;
      emailSent: boolean;
      expiresAt: number;
    }
  | { phase: 'approved'; email: string; newAccount: boolean }
  | { phase: 'denied'; email: string }
  | { phase: 'expired'; email: string }
  | { phase: 'error'; email: string; message: string };

let state: ConnectState = { phase: 'idle' };
let pollTimer: NodeJS.Timeout | null = null;
let waiters: Array<() => void> = [];

function settle(next: ConnectState): void {
  state = next;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  const pending = waiters;
  waiters = [];
  for (const wake of pending) wake();
}

export function getConnectState(): ConnectState {
  return state;
}

/**
 * Starts a device-code sign-in for `email` and polls in the background.
 * Returns as soon as the backend has issued the code — the tool that calls
 * this prints it and the user goes to approve.
 */
export async function startDeviceConnect(
  client: ApiClient,
  email: string
): Promise<{ ok: true; state: Extract<ConnectState, { phase: 'pending' }> } | { ok: false; message: string }> {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  const result = await client.post<StartResponse>(
    '/api/auth/device/start',
    { email, client: 'mcp', clientName: CLIENT_NAME },
    { skipAuth: true }
  );

  if (!result.success || !result.data) {
    const message =
      result.error?.status === 404
        ? 'Device sign-in is not enabled on this Light Cloud environment yet. Use the login tool instead.'
        : result.error?.message || 'Could not start sign-in.';
    state = { phase: 'error', email, message };
    return { ok: false, message };
  }

  const started = result.data;
  const pending: Extract<ConnectState, { phase: 'pending' }> = {
    phase: 'pending',
    email,
    userCode: started.userCode,
    verificationUrl: started.verificationUrl,
    newAccount: started.newAccount,
    emailSent: started.emailSent,
    expiresAt: Date.now() + started.expiresIn * 1000,
  };
  state = pending;

  const intervalMs = Math.max(started.interval, 3) * 1000;
  let delay = intervalMs;

  const poll = async () => {
    if (state.phase !== 'pending') return;
    if (Date.now() > state.expiresAt) {
      settle({ phase: 'expired', email });
      return;
    }

    // The approved answer carries the session tokens, which the response
    // filter would otherwise drop.
    const answer = await client.post<PollResponse>(
      '/api/auth/device/poll',
      { deviceCode: started.deviceCode },
      { skipAuth: true, allow: ['token', 'refreshToken'] }
    );

    if (!answer.success || !answer.data) {
      // Network blip: keep going until the code expires.
      pollTimer = setTimeout(poll, delay);
      return;
    }

    switch (answer.data.status) {
      case 'approved':
        storeCredentials({
          accessToken: answer.data.token,
          refreshToken: answer.data.refreshToken,
        });
        settle({ phase: 'approved', email, newAccount: started.newAccount });
        return;
      case 'access_denied':
        settle({ phase: 'denied', email });
        return;
      case 'expired_token':
        settle({ phase: 'expired', email });
        return;
      case 'slow_down':
        delay += 5000;
        break;
      case 'authorization_pending':
      default:
        break;
    }
    pollTimer = setTimeout(poll, delay);
  };

  pollTimer = setTimeout(poll, delay);
  return { ok: true, state: pending };
}

/**
 * Resolves when the pending sign-in settles, or after `timeoutMs` with the
 * state as it is then. Lets a status tool long-poll instead of returning
 * "still waiting" every second.
 */
export function waitForConnect(timeoutMs: number): Promise<ConnectState> {
  if (state.phase !== 'pending') return Promise.resolve(state);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== wake);
      resolve(state);
    }, timeoutMs);
    const wake = () => {
      clearTimeout(timer);
      resolve(state);
    };
    waiters.push(wake);
  });
}

/** The lines a tool prints for a pending sign-in. */
export function describePending(pending: Extract<ConnectState, { phase: 'pending' }>): string {
  const minutesLeft = Math.max(1, Math.round((pending.expiresAt - Date.now()) / 60000));
  const lines = [
    pending.newAccount
      ? `No Light Cloud account exists for ${pending.email} yet — approving will create one (free plan, no card needed).`
      : `Signing in as ${pending.email}.`,
    '',
    `1. Open ${pending.verificationUrl} on any device (a phone works).`,
    `2. Enter the code:  ${pending.userCode}`,
    pending.newAccount
      ? `   (Use the link in the email we just sent to ${pending.email} — it proves the address is yours — then type the code.)`
      : `   (Sign in there if asked; the email we sent has the same link.)`,
    '',
    `The code expires in ${minutesLeft} minutes. Call connect-status to wait for the approval.`,
  ];
  if (!pending.emailSent) {
    lines.push('', 'Note: the confirmation email could not be sent. Existing accounts can still approve by signing in on the page above.');
  }
  return lines.join('\n');
}
