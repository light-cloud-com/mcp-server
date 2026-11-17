import { describe, expect, it } from 'vitest';

process.env.LIGHTCLOUD_MCP_REMOTE = '1';
process.env.MCP_HIDDEN_TOOLS = 'search-templates, get-template,deploy-template';
const { buildServer, CHATGPT_TOOLS } = await import('../index.js');

const tools = (s: unknown) => Object.keys((s as { _registeredTools: Record<string, unknown> })._registeredTools);
const TEMPLATE_TOOLS = ['search-templates', 'get-template', 'deploy-template'];

describe('MCP_HIDDEN_TOOLS', () => {
  it('leaves the listed tools out of both remote addresses, and only those', () => {
    const remote = tools(buildServer({ remote: true }));
    const chatgpt = tools(buildServer({ remote: true, only: CHATGPT_TOOLS }));
    for (const t of TEMPLATE_TOOLS) {
      expect(remote, t).not.toContain(t);
      expect(chatgpt, t).not.toContain(t);
    }
    expect(chatgpt.length).toBe(CHATGPT_TOOLS.size - TEMPLATE_TOOLS.length);
    expect(remote).toContain('create-repository');
  });

  it('never touches the local server', () => {
    expect(tools(buildServer())).toEqual(expect.arrayContaining(TEMPLATE_TOOLS));
  });
});
