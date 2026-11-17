import { describe, expect, it } from 'vitest';

process.env.LIGHTCLOUD_MCP_REMOTE = '1';
const { buildServer, CHATGPT_TOOLS, CREDENTIAL_TOOLS, LOCAL_ONLY_TOOLS } = await import('../index.js');

const tools = (s: unknown) => Object.keys((s as { _registeredTools: Record<string, unknown> })._registeredTools).sort();

describe('remote tool sets', () => {
  it('the local server has every tool, the remote one none that need the local machine', () => {
    const local = tools(buildServer());
    const remote = tools(buildServer({ remote: true }));
    expect(local.length).toBeGreaterThan(100);
    for (const t of LOCAL_ONLY_TOOLS) expect(local, t).toContain(t);
    expect(remote.filter(t => LOCAL_ONLY_TOOLS.has(t) || CREDENTIAL_TOOLS.has(t))).toEqual([]);
    expect(remote.length).toBe(local.length - LOCAL_ONLY_TOOLS.size - CREDENTIAL_TOOLS.size);
    // reading and writing SQL are separate tools
    expect(remote).toEqual(expect.arrayContaining(['query-database', 'execute-database-sql']));
    // code written in the chat reaches a repository through Light Cloud, not an upload from the sandbox
    expect(remote).toEqual(expect.arrayContaining(['create-repository', 'commit-files', 'request-upload-url']));
  });

  it('the ChatGPT address has exactly the directory set: no billing, no keys or passwords', () => {
    const chatgpt = tools(buildServer({ remote: true, only: CHATGPT_TOOLS }));
    expect(chatgpt).toEqual([...CHATGPT_TOOLS].sort());
    expect(chatgpt).toEqual(expect.arrayContaining(['create-repository', 'commit-files', 'create-application']));
    expect(chatgpt.some(t => /plan|billing|payment|card|api-key|connection-string|password/.test(t))).toBe(false);
  });
});
