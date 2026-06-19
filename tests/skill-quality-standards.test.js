import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_SKILLS_DIR = path.join(ROOT_DIR, 'config', 'source', 'skills');
const SKILL_AUTHORING_DIR = path.join(ROOT_DIR, 'skills', 'skill-authoring');

function readFile(...segments) {
  return fs.readFileSync(path.join(ROOT_DIR, ...segments), 'utf8');
}

function readSourceSkill(skillName) {
  return readFile('config', 'source', 'skills', skillName, 'SKILL.md');
}

describe('skill quality standards', () => {
  test('every source skill declares a normalized version field', () => {
    const skillDirs = fs
      .readdirSync(SOURCE_SKILLS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const skillName of skillDirs) {
      const raw = readSourceSkill(skillName);
      expect(raw).toMatch(/^version:\s+\d+\.\d+\.\d+(?:-[^\s]+)?$/m);
      expect(raw).not.toMatch(/^version:\s+v/m);
    }
  });

  test('auth-web stays web-only and fixes the known snippet issues', () => {
    const raw = readSourceSkill('auth-web');

    expect(raw).toMatch(/const\s+auth\s*=\s*app\.auth\(/);
    expect(raw).not.toContain('const { data, error } = const { data, error } =');
    expect(raw).not.toContain('## WeChat Mini Program');
    expect(raw).not.toContain('auth.signInWithOpenId');
    expect(raw).not.toContain('auth.signInWithPhoneAuth');
    expect(raw).toMatch(/auth\.signUp\(\{\s*username,\s*password\s*\}\)/);
    expect(raw).toMatch(/auth\.signInWithPassword\(\{\s*username,\s*password\s*\}\)/);
    expect(raw).toMatch(/type="text"|type='text'/);
    expect(raw).toMatch(/username-style identifier|plain username string|username-style account/i);
    expect(raw).toMatch(/do not switch to email otp or phone otp unless/i);
  });

  test('cloud-storage-web documents exact-origin security-domain setup for local uploads', () => {
    const raw = readSourceSkill('cloud-storage-web');

    expect(raw).toContain('envQuery');
    expect(raw).toContain('envDomainManagement');
    expect(raw).toContain('127.0.0.1:4173');
    expect(raw).toContain('localhost:5173');
    expect(raw).toContain('app.uploadFile()');
    expect(raw).toContain('Browser origin `http://127.0.0.1:4173` -> whitelist entry `127.0.0.1:4173`');
  });

  test('cloudrun-development explains the MinNum cold-start tradeoff with a default of 1', () => {
    const raw = readSourceSkill('cloudrun-development');

    expect(raw).toContain('"MinNum": 1');
    expect(raw).toMatch(/cold start/i);
    expect(raw).toMatch(/cost/i);
  });

  test('cloudbase env guidance resolves aliases to canonical EnvId before binding or init', () => {
    const guideline = readFile('config', 'source', 'guideline', 'cloudbase', 'SKILL.md');
    const platform = readSourceSkill('cloudbase-platform');
    const editorGuide = readFile(
      'config',
      'source',
      'editor-config',
      'guides',
      'cloudbase-rules.mdc',
    );

    expect(guideline).toContain('aliasExact=true');
    expect(guideline).toMatch(/do not pass it directly/i);
    expect(guideline).toMatch(/canonical full `EnvId`/);

    expect(platform).toContain('aliasExact=true');
    expect(platform).toMatch(/short form/i);
    expect(platform).toMatch(/use the returned full `EnvId`/);

    expect(editorGuide).toContain('aliasExact=true');
    expect(editorGuide).toMatch(/Do not pass alias-like short forms directly/i);
  });

  test('cloud-functions http reference stays compatible with Express 5 wildcard syntax', () => {
    const raw = readFile(
      'config',
      'source',
      'skills',
      'cloud-functions',
      'references',
      'http-functions.md',
    );

    expect(raw).not.toContain('app.all("*")');
    expect(raw).not.toContain("app.all('/*')");
    expect(raw).toContain('app.all("/{*splat}", (req, res) => {');
    expect(raw).toMatch(/Express 5 note:/);
    expect(raw).toMatch(/path-to-regexp/);
  });

  test('cloudbase-agent does not force global activation by default', () => {
    const raw = readSourceSkill('cloudbase-agent');

    expect(raw).toContain('alwaysApply: false');
  });

  test('skill-authoring documents the repo-managed CloudBase skill review rules', () => {
    const mainSkill = readFile('skills', 'skill-authoring', 'SKILL.md');
    const reviewReference = readFile(
      'skills',
      'skill-authoring',
      'references',
      'cloudbase-skill-review.md',
    );

    expect(mainSkill).toContain('repo-managed CloudBase skill review');
    expect(reviewReference).toContain('frontmatter completeness');
    expect(reviewReference).toContain('examples stay in scope');
    expect(reviewReference).toContain('shared rules should have a single canonical source');
    expect(reviewReference).toContain('auth-nodejs');
  });
});
