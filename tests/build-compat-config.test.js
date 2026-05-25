import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, expect, test } from 'vitest';
import { buildCompatConfig } from '../scripts/build-compat-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

test('buildCompatConfig generates compatibility artifacts from minimal sources', () => {
  const compatDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cloudbase-compat-config-'),
  );
  tempDirs.push(compatDir);

  const result = buildCompatConfig({ outputDir: compatDir });

  expect(result.skillCount).toBeGreaterThan(0);
  const compatGuide = fs.readFileSync(
    path.join(ROOT_DIR, 'config', 'source', 'editor-config', 'guides', 'cloudbase-rules.mdc'),
    'utf8',
  );
  const authWebSkill = fs.readFileSync(
    path.join(ROOT_DIR, 'config', 'source', 'skills', 'auth-web', 'SKILL.md'),
    'utf8',
  );

  expect(fs.readFileSync(path.join(compatDir, 'CLAUDE.md'), 'utf8')).toBe(
    compatGuide,
  );
  expect(
    fs.readFileSync(path.join(compatDir, '.cursor', 'rules', 'cloudbase-rules.mdc'), 'utf8'),
  ).toBe(compatGuide);
  expect(compatGuide).toContain('## Activation Contract');
  expect(compatGuide).toContain('Native App / raw HTTP');
  expect(compatGuide).toContain('Serialize the object first, then retry once with the serialized text');
  expect(compatGuide).toContain('actually passes the serialized string rather than the original object');

  expect(
    fs.readFileSync(path.join(compatDir, 'rules', 'auth-web', 'rule.md'), 'utf8'),
  ).toBe(authWebSkill);
  expect(
    fs.readFileSync(path.join(compatDir, '.cursor', 'rules', 'auth-web', 'rule.mdc'), 'utf8'),
  ).toBe(authWebSkill);
  expect(
    fs.readFileSync(path.join(compatDir, '.codebuddy', 'skills', 'auth-web', 'SKILL.md'), 'utf8'),
  ).toBe(authWebSkill);
  expect(authWebSkill).toContain('## Activation Contract');

  expect(fs.existsSync(path.join(compatDir, '.mcp.json'))).toBe(true);
  expect(fs.existsSync(path.join(compatDir, '.claude', 'commands', 'spec.md'))).toBe(true);
  expect(fs.existsSync(path.join(compatDir, '.kiro', 'steering', 'auth-web', 'rule.md'))).toBe(true);
});
