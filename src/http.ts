// src/http.ts - the remote MCP server (Streamable HTTP), for connectors such as Claude and ChatGPT.
//
//   POST /mcp                                  MCP requests; Authorization: Bearer <access token>
//   GET  /.well-known/oauth-protected-resource where to get a token (RFC 9728)
//   GET  /health
//   GET  /.well-known/openai-apps-challenge   OpenAI's domain check (OPENAI_APPS_CHALLENGE)
//
// Stateless: every request builds its own server (buildServer({ remote: true })) and runs
// inside requestCredentials with its own token, so requests never share a session. Tokens are
// issued by console-backend's OAuth server for this resource (their `aud`); the API checks the
// signature and the Agents & CLI switch on every call, as for the stdio server.
//
// Config: PORT, MCP_PUBLIC_URL (e.g. https://mcp.light-cloud.com), LIGHT_CLOUD_API_URL (the
// API and the authorization server, e.g. https://api.light-cloud.com).
import { createHash } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';

process.env.LIGHTCLOUD_MCP_REMOTE = '1';
const { buildServer, CHATGPT_TOOLS } = await import('./index.js');
const { requestCredentials } = await import('./token-storage.js');

const PORT = Number(process.env.PORT || 8080);
const PUBLIC_URL = (process.env.MCP_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const API_URL = (process.env.LIGHT_CLOUD_API_URL || 'https://api.light-cloud.com').replace(/\/$/, '');
// two addresses, each its own OAuth resource (token audience): every remote tool, and the ChatGPT directory's set
const SERVERS = {
  mcp: { resource: `${PUBLIC_URL}/mcp`, metadata: `${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp`, only: undefined },
  chatgpt: { resource: `${PUBLIC_URL}/chatgpt`, metadata: `${PUBLIC_URL}/.well-known/oauth-protected-resource/chatgpt`, only: CHATGPT_TOOLS },
} as const;
type ServerName = keyof typeof SERVERS;

/** The payload of a JWT, unverified (the API verifies the signature); null when it is not one. */
export const jwtPayload = (token: string): Record<string, unknown> | null => {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

/** Issued for this server (RFC 8707 audience) and not expired. */
export const meantForUs = (payload: Record<string, unknown> | null, resource: string, now = Date.now()): boolean => {
  if (!payload) return false;
  const aud = payload.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  return audiences.includes(resource) && exp > now;
};

// tokens the API accepted, by hash, until they expire or 15 seconds pass
const accepted = new Map<string, number>();
const accept = async (token: string, exp: number): Promise<boolean> => {
  const key = createHash('sha256').update(token).digest('hex');
  const until = accepted.get(key);
  if (until && until > Date.now()) return true;
  // /api/auth/profile stays open when the user turns Agents & CLI off, so tool calls then get that refusal, not a sign-in prompt
  const res = await fetch(`${API_URL}/api/auth/profile`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res?.ok) return false;
  if (accepted.size > 5000) accepted.clear();
  // short, so a disconnect in Settings → Security takes effect within seconds
  accepted.set(key, Math.min(exp, Date.now() + 15_000));
  return true;
};

// shortcut: Claude now sends MCP-Protocol-Version 2026-07-28, which SDK v1 refuses with a 400; answer a newer
// version as the newest we speak. Remove with the move to SDK v2 (docs/todo/MCP_LISTINGS_JULIA.md).
export const downgradeProtocolHeader = (rawHeaders: string[]): void => {
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'mcp-protocol-version' && !SUPPORTED_PROTOCOL_VERSIONS.includes(rawHeaders[i + 1])) {
      rawHeaders[i + 1] = LATEST_PROTOCOL_VERSION;
    }
  }
};

// browsers send Origin: only these may call (DNS rebinding); server-to-server clients send none
const ORIGINS = [/^https:\/\/(www\.)?claude\.(ai|com)$/, /^https:\/\/(www\.)?chatgpt\.com$/, /^https:\/\/([a-z0-9-]+\.)*light-cloud\.com$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
export const originAllowed = (origin: string | undefined): boolean => !origin || ORIGINS.some(o => o.test(origin));

const challenge = (res: Response, name: ServerName, error?: 'invalid_token') =>
  res
    .status(401)
    .set(
      'WWW-Authenticate',
      `Bearer resource_metadata="${SERVERS[name].metadata}", scope="lightcloud"${error ? `, error="${error}", error_description="The access token is missing, expired or not for this server"` : ''}`
    )
    .json({ error: error ?? 'unauthorized', error_description: 'Sign in to Light Cloud to use this server.' });

const app = express();
app.disable('x-powered-by');
// files for create-repository and commit-files come in the request (the API takes up to 12 MB)
app.use(express.json({ limit: '12mb' }));
// browser-based MCP clients read these headers
app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id',
    'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  });
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const resourceMetadata = (name: ServerName) => (_req: Request, res: Response) =>
  res.json({
    resource: SERVERS[name].resource,
    authorization_servers: [API_URL],
    scopes_supported: ['lightcloud'],
    bearer_methods_supported: ['header'],
    resource_name: 'Light Cloud',
    resource_documentation: 'https://docs.light-cloud.com/deploy-with-ai/mcp-server',
  });
app.get('/.well-known/oauth-protected-resource', resourceMetadata('mcp'));
app.get('/.well-known/oauth-protected-resource/mcp', resourceMetadata('mcp'));
app.get('/.well-known/oauth-protected-resource/chatgpt', resourceMetadata('chatgpt'));

app.get('/health', (_req, res) => res.json({ ok: true }));
// OpenAI's domain check for the ChatGPT plugin directory: the portal's token, as plain text, from the deploy's env
app.get('/.well-known/openai-apps-challenge', (_req, res) => {
  const token = process.env.OPENAI_APPS_CHALLENGE;
  if (!token) return void res.status(404).end();
  res.type('text/plain').send(token);
});

const handle = (name: ServerName) => async (req: Request, res: Response) => {
  if (!originAllowed(req.get('origin'))) return res.status(403).json({ error: 'forbidden_origin' });
  const header = req.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return challenge(res, name);
  const payload = jwtPayload(token);
  if (!meantForUs(payload, SERVERS[name].resource) || !(await accept(token, Number(payload!.exp) * 1000))) return challenge(res, name, 'invalid_token');

  // the transport reads rawHeaders
  downgradeProtocolHeader(req.rawHeaders);
  await requestCredentials.run({ accessToken: token }, async () => {
    const server = buildServer({ remote: true, only: SERVERS[name].only });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    // why a request was refused (unsupported protocol version, bad JSON-RPC): Cloud Run logs only show the status
    transport.onerror = error => console.error(`MCP transport (${name}): ${error.message}`);
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request failed:', error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  });
};

for (const name of Object.keys(SERVERS) as ServerName[]) {
  app.post(`/${name}`, handle(name));
  // stateless: no session to stream or end
  app.get(`/${name}`, (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' }));
  app.delete(`/${name}`, (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' }));
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.error(`Light Cloud MCP server (remote) on :${PORT}: ${SERVERS.mcp.resource}, ${SERVERS.chatgpt.resource}`));
}

export { app };
