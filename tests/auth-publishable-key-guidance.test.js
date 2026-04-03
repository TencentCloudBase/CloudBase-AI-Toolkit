import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function readFile(...segments) {
  return fs.readFileSync(path.join(ROOT_DIR, ...segments), 'utf8');
}

describe('auth publishable-key guidance', () => {
  test('source skills avoid unsupported publishable-key API guidance', () => {
    const authTool = readFile('config', 'source', 'skills', 'auth-tool', 'SKILL.md');
    const authWeb = readFile('config', 'source', 'skills', 'auth-web', 'SKILL.md');

    expect(authTool).toContain('Do **not** guess `callCloudApi` actions');
    expect(authTool).not.toContain('"action": "DescribeApiKeyTokens"');
    expect(authTool).not.toContain('"action": "CreateApiKeyToken"');
    expect(authTool).toContain('ask the user to obtain the publishable key from the console');

    expect(authWeb).not.toContain('Automatically use `auth-tool-cloudbase` to get `publishable key`');
    expect(authWeb).toContain('does **not** currently expose a reliable MCP action for fetching or creating the publishable key');
    expect(authWeb).toContain('keep the auth form visible');
    expect(authWeb).toContain('do **not** replace the whole page with a setup-only gate');
    expect(authWeb).toContain('VITE_CLOUDBASE_PUBLISHABLE_KEY');
    expect(authWeb).toContain('const auth = app.auth()');
  });

  test('generated prompt and compat outputs stay aligned', () => {
    const promptAuthTool = readFile('doc', 'prompts', 'auth-tool.mdx');
    const promptAuthWeb = readFile('doc', 'prompts', 'auth-web.mdx');
    const compatAuthTool = readFile('.generated', 'compat-config', 'rules', 'auth-tool', 'rule.md');
    const compatAuthWeb = readFile('.generated', 'compat-config', 'rules', 'auth-web', 'rule.md');
    const codebuddyAuthWeb = readFile('.generated', 'compat-config', '.codebuddy', 'skills', 'auth-web', 'SKILL.md');

    for (const raw of [promptAuthTool, compatAuthTool]) {
      expect(raw).toContain('Do **not** guess `callCloudApi` actions');
      expect(raw).not.toContain('"action": "DescribeApiKeyTokens"');
      expect(raw).not.toContain('"action": "CreateApiKeyToken"');
    }

    for (const raw of [promptAuthWeb, compatAuthWeb, codebuddyAuthWeb]) {
      expect(raw).not.toContain('Automatically use `auth-tool-cloudbase` to get `publishable key`');
      expect(raw).toContain('does **not** currently expose a reliable MCP action for fetching or creating the publishable key');
      expect(raw).toContain('keep the auth form visible');
      expect(raw).toContain('do **not** replace the whole page with a setup-only gate');
    }
  });
});
