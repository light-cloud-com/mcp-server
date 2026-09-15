#!/usr/bin/env node
/**
 * Builds the Claude Desktop extension: a `.mcpb` bundle (a zip with a
 * manifest.json, the compiled server and its production node_modules).
 *
 *   npm run bundle            → release/light-cloud-<version>.mcpb
 *
 * The manifest is generated here rather than kept by hand so the version
 * and the tool list can never drift from package.json and src/index.ts.
 * Tool and prompt descriptions are read from the running server by the host
 * (`tools_generated`), the names listed here are for the directory page.
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const source = readFileSync(join(root, 'src/index.ts'), 'utf8');

const toolNames = [...source.matchAll(/server\.tool\(\s*"([a-z-]+)"/g)].map((m) => m[1]);
const promptNames = [...source.matchAll(/server\.prompt\(\s*"([a-z-]+)"/g)].map((m) => m[1]);
if (toolNames.length === 0) throw new Error('No tools found in src/index.ts');

const build = join(root, 'mcpb-build');
const release = join(root, 'release');
rmSync(build, { recursive: true, force: true });
mkdirSync(join(build, 'server'), { recursive: true });
mkdirSync(release, { recursive: true });

execSync('npm run build', { cwd: root, stdio: 'inherit' });
cpSync(join(root, 'dist'), join(build, 'server'), { recursive: true });
cpSync(join(root, 'icon.png'), join(build, 'icon.png'));
cpSync(join(root, 'README.md'), join(build, 'README.md'));
cpSync(join(root, 'LICENSE'), join(build, 'LICENSE'));

// Production dependencies only, resolved fresh so the bundle carries exactly
// what package.json declares and nothing from the dev tree.
writeFileSync(
  join(build, 'package.json'),
  JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', private: true, dependencies: pkg.dependencies }, null, 2)
);
execSync('npm install --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error', { cwd: build, stdio: 'inherit' });

const manifest = {
  manifest_version: '0.3',
  name: 'light-cloud',
  display_name: 'Light Cloud',
  version: pkg.version,
  description: 'Sign up, deploy, run and pay for web apps, APIs and databases on Light Cloud from a conversation.',
  long_description: readFileSync(join(root, 'scripts/mcpb-long-description.md'), 'utf8').trim(),
  author: { name: 'Light Cloud', email: 'hello@light-cloud.com', url: 'https://www.light-cloud.com' },
  repository: { type: 'git', url: 'https://github.com/light-cloud-com/mcp-server' },
  homepage: 'https://www.light-cloud.com/deploy-with-ai',
  documentation: 'https://docs.light-cloud.com/deploy-with-ai/mcp-server',
  support: 'https://www.light-cloud.com/contact',
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'server/index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/index.js'],
      env: {
        LIGHT_CLOUD_API_URL: '${user_config.api_url}',
        LIGHT_CLOUD_CONSOLE_URL: '${user_config.console_url}',
      },
    },
  },
  tools: toolNames.map((name) => ({ name })),
  tools_generated: true,
  prompts: promptNames.map((name) => ({ name, text: `/${name}` })),
  prompts_generated: true,
  keywords: ['light-cloud', 'deploy', 'hosting', 'cloud', 'devops', 'database', 'billing', 'claude-code', 'mcp'],
  license: pkg.license,
  privacy_policies: ['https://www.light-cloud.com/privacy'],
  compatibility: {
    claude_desktop: '>=0.10.0',
    platforms: ['darwin', 'win32', 'linux'],
    runtimes: { node: '>=18.0.0' },
  },
  user_config: {
    api_url: {
      type: 'string',
      title: 'API endpoint',
      description: 'Light Cloud API to talk to. Leave the default unless you were given a staging or self-hosted endpoint.',
      default: 'https://api.light-cloud.com',
      required: false,
    },
    console_url: {
      type: 'string',
      title: 'Console URL',
      description: 'The Light Cloud console the sign-in links point at. Change only together with the API endpoint.',
      default: 'https://console.light-cloud.com',
      required: false,
    },
  },
};
writeFileSync(join(build, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// The committed copy: what the directory submission and the repository show.
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const out = join(release, `light-cloud-${pkg.version}.mcpb`);
rmSync(out, { force: true });
execSync(`npx --yes @anthropic-ai/mcpb validate "${join(build, 'manifest.json')}"`, { stdio: 'inherit' });
execSync(`npx --yes @anthropic-ai/mcpb pack "${build}" "${out}"`, { stdio: 'inherit' });
console.log(`\nBundle: ${out}`);
