import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, test } from 'vitest';
import { buildClawhubPublishArtifacts } from '../scripts/build-clawhub-publish-artifacts.mjs';
import { buildCompatConfig } from '../scripts/build-compat-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_SKILLS_DIR = path.join(ROOT_DIR, 'config', 'source', 'skills');
const CLOUD_GUIDELINES_FILE = path.join(
  ROOT_DIR,
  'config',
  'source',
  'guideline',
  'cloudbase',
  'SKILL.md',
);
const SKILLS_REPO_OUTPUT_DIR = path.join(ROOT_DIR, '.skills-repo-output');
const tempDirs = [];

const RAW_SKILLS_ROOT_URL =
  'https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills';
const MAIN_ENTRY_RAW_URL = `${RAW_SKILLS_ROOT_URL}/cloudbase/SKILL.md`;
const FALLBACK_SECTION_TITLE = '## Standalone Install Note';

function buildSiblingSkillRawUrl(skillId) {
  return `${RAW_SKILLS_ROOT_URL}/cloudbase/references/${skillId}/SKILL.md`;
}

afterEach(() => {
  fs.rmSync(SKILLS_REPO_OUTPUT_DIR, { recursive: true, force: true });
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('single skill fallback raw links', () => {
  test('every source skill declares the published CloudBase entry and its own standalone raw source', () => {
    const skillDirs = fs
      .readdirSync(SOURCE_SKILLS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const skillDir of skillDirs) {
      const raw = fs.readFileSync(
        path.join(SOURCE_SKILLS_DIR, skillDir, 'SKILL.md'),
        'utf8',
      );

      expect(raw).toContain(FALLBACK_SECTION_TITLE);
      expect(raw).toContain(MAIN_ENTRY_RAW_URL);
      expect(raw).toContain(buildSiblingSkillRawUrl(skillDir));
      expect(raw).not.toContain('/skills/cloudbase-guidelines/SKILL.md');
      expect(raw).not.toContain('/skills/<skill-dir>/SKILL.md');
    }
  });

  test('source skills with sibling skill references expose standalone fallback URLs next to those references', () => {
    const skillDirs = fs
      .readdirSync(SOURCE_SKILLS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const skillDir of skillDirs) {
      const raw = fs.readFileSync(
        path.join(SOURCE_SKILLS_DIR, skillDir, 'SKILL.md'),
        'utf8',
      );
      const siblingRefs = [...raw.matchAll(/`\.\.\/([a-z0-9-]+)\/SKILL\.md`/g)].map(
        (match) => match[1],
      );

      for (const siblingRef of siblingRefs) {
        expect(raw).toContain(buildSiblingSkillRawUrl(siblingRef));
      }
    }
  });

  test('cloudbase guideline explains the standalone raw-link fallback for the published cloudbase entry', () => {
    const raw = fs.readFileSync(CLOUD_GUIDELINES_FILE, 'utf8');

    expect(raw).toContain('### Standalone skill fallback');
    expect(raw).toContain(MAIN_ENTRY_RAW_URL);
    expect(raw).toContain(
      `${RAW_SKILLS_ROOT_URL}/cloudbase/references/<skill-id>/SKILL.md`,
    );
    expect(raw).not.toContain('/skills/cloudbase-guidelines/SKILL.md');
    expect(raw).toMatch(/mcporter/i);
  });

  test('build-skills-repo preserves fallback raw links in standalone skill outputs', () => {
    execFileSync('node', ['scripts/build-skills-repo.mjs'], {
      cwd: ROOT_DIR,
      stdio: 'pipe',
    });

    const outputSkill = fs.readFileSync(
      path.join(SKILLS_REPO_OUTPUT_DIR, 'skills', 'auth-web', 'SKILL.md'),
      'utf8',
    );

    expect(outputSkill).toContain(FALLBACK_SECTION_TITLE);
    expect(outputSkill).toContain(MAIN_ENTRY_RAW_URL);
    expect(outputSkill).toContain(buildSiblingSkillRawUrl('auth-web'));
    expect(outputSkill).toContain(buildSiblingSkillRawUrl('auth-tool'));
  });

  test('buildClawhubPublishArtifacts preserves fallback raw links in published skill artifacts', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawhub-fallback-'));
    tempDirs.push(outputDir);

    const manifest = buildClawhubPublishArtifacts({
      targets: 'web-development',
      outputDir,
    });

    const outputSkill = fs.readFileSync(
      path.join(manifest.targets[0].artifactDir, 'SKILL.md'),
      'utf8',
    );

    expect(outputSkill).toContain(FALLBACK_SECTION_TITLE);
    expect(outputSkill).toContain(MAIN_ENTRY_RAW_URL);
    expect(outputSkill).toContain(buildSiblingSkillRawUrl('web-development'));
    expect(outputSkill).toContain(buildSiblingSkillRawUrl('auth-tool'));
  });

  test('buildCompatConfig preserves fallback raw links in IDE compatibility outputs', () => {
    const compatDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'compat-fallback-links-'),
    );
    tempDirs.push(compatDir);

    buildCompatConfig({ outputDir: compatDir });

    const compatSkill = fs.readFileSync(
      path.join(compatDir, 'rules', 'auth-web', 'rule.md'),
      'utf8',
    );

    expect(compatSkill).toContain(FALLBACK_SECTION_TITLE);
    expect(compatSkill).toContain(MAIN_ENTRY_RAW_URL);
    expect(compatSkill).toContain(buildSiblingSkillRawUrl('auth-web'));
    expect(compatSkill).toContain(buildSiblingSkillRawUrl('auth-tool'));
  });
});
