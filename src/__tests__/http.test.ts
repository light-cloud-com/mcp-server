import { describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
const { jwtPayload, meantForUs, originAllowed, downgradeProtocolHeader } = await import('../http.js');

const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const RESOURCE = 'https://mcp.light-cloud.com/mcp';

describe('remote server', () => {
  it('answers a protocol version newer than the SDK knows as the newest it speaks', () => {
    const raw = ['Host', 'x', 'MCP-Protocol-Version', '2026-07-28', 'Accept', 'application/json'];
    downgradeProtocolHeader(raw);
    expect(raw[3]).toBe('2025-11-25');
    const known = ['mcp-protocol-version', '2025-06-18'];
    downgradeProtocolHeader(known);
    expect(known[1]).toBe('2025-06-18');
  });

  it('takes only tokens issued for it that have not expired', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    expect(meantForUs(jwtPayload(jwt({ aud: RESOURCE, exp })), RESOURCE)).toBe(true);
    expect(meantForUs(jwtPayload(jwt({ aud: [RESOURCE, 'x'], exp })), RESOURCE)).toBe(true);
    // a console or device-flow token has no audience: not for this server
    expect(meantForUs(jwtPayload(jwt({ exp })), RESOURCE)).toBe(false);
    expect(meantForUs(jwtPayload(jwt({ aud: 'https://evil.example/mcp', exp })), RESOURCE)).toBe(false);
    expect(meantForUs(jwtPayload(jwt({ aud: RESOURCE, exp: 1 })), RESOURCE)).toBe(false);
    expect(meantForUs(jwtPayload('not-a-jwt'), RESOURCE)).toBe(false);
  });

  it('lets server-to-server calls and the known apps through, not other browser origins', () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed('https://claude.ai')).toBe(true);
    expect(originAllowed('https://chatgpt.com')).toBe(true);
    expect(originAllowed('http://localhost:6274')).toBe(true);
    expect(originAllowed('https://evil.example')).toBe(false);
    expect(originAllowed('https://claude.ai.evil.example')).toBe(false);
  });
});
