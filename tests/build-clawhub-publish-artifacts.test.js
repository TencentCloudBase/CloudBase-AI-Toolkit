import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, expect, test } from 'vitest';
import { buildClawhubPublishArtifacts } from '../scripts/build-clawhub-publish-artifacts.mjs';

const TEST_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(TEST_FILE), '..');

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function readSourceSkillName(targetKey) {
  const raw = fs.readFileSync(
    path.join(
      REPO_ROOT,
      'config',
      'source',
      'skills',
      targetKey,
      'SKILL.md',
    ),
    'utf8',
  );
  const match = raw.match(/^name:\s*(.+)$/m);
  if (!match) {
    throw new Error(`Expected ${targetKey} source skill to declare a name`);
  }
  return match[1].trim();
}

test('buildClawhubPublishArtifacts builds miniprogram-development artifact', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawhub-publish-'));
  tempDirs.push(outputDir);

  const manifest = buildClawhubPublishArtifacts({
    targets: 'miniprogram-development',
    outputDir,
  });

  expect(manifest.targets).toHaveLength(1);
  expect(manifest.targets[0].targetKey).toBe('miniprogram-development');
  expect(
    fs.existsSync(
      path.join(
        outputDir,
        'miniprogram-development',
        'skills',
        'miniprogram-development',
        'SKILL.md',
      ),
    ),
  ).toBe(true);
  expect(fs.existsSync(path.join(outputDir, 'manifest.json'))).toBe(true);
});

test('buildClawhubPublishArtifacts builds all-in-one artifact', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawhub-allinone-'));
  tempDirs.push(outputDir);

  const manifest = buildClawhubPublishArtifacts({
    targets: 'all-in-one',
    outputDir,
  });

  expect(manifest.targets).toHaveLength(1);
  expect(manifest.targets[0].registrySlug).toBe('cloudbase');
  const mainSkillPath = path.join(outputDir, 'all-in-one', 'skills', 'cloudbase', 'SKILL.md');
  expect(fs.existsSync(mainSkillPath)).toBe(true);
  expect(
    fs.existsSync(
      path.join(
        outputDir,
        'all-in-one',
        'skills',
        'cloudbase',
        'references',
        'auth-web',
        'SKILL.md',
      ),
    ),
  ).toBe(true);

  // Generated routing table must wrap every skill id in backticks so the
  // downstream agent sees a strong identifier signal, and must preserve
  // the activation trigger vocabulary block from activation-map.yaml.
  const mainSkillContent = fs.readFileSync(mainSkillPath, 'utf8');
  expect(mainSkillContent).toContain('<!-- DO NOT EDIT: auto-generated from references/activation-map.yaml -->');
  expect(mainSkillContent).toContain('| `auth-tool` | `auth-web`, `web-development` |');
  expect(mainSkillContent).toContain('#### Activation triggers (derived from `references/activation-map.yaml`)');
  expect(mainSkillContent).toContain('CloudBase Web 登录');
  expect(mainSkillContent).toContain('wx.cloud');
  expect(mainSkillContent).toContain('巡检');
});

test.each([
  'ui-design',
  'web-development',
  'spec-workflow',
])('buildClawhubPublishArtifacts builds %s local skill artifact', (targetKey) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), `clawhub-${targetKey}-`));
  tempDirs.push(outputDir);

  const manifest = buildClawhubPublishArtifacts({
    targets: targetKey,
    outputDir,
  });

  expect(manifest.targets).toHaveLength(1);
  expect(manifest.targets[0].targetKey).toBe(targetKey);
  if (targetKey === 'ui-design') {
    expect(manifest.targets[0].registrySlug).toBe('ui-design-guide');
  } else if (targetKey === 'spec-workflow') {
    expect(manifest.targets[0].registrySlug).toBe('spec-workflow-guide');
  } else {
    expect(manifest.targets[0].registrySlug).toBe(targetKey);
  }
  if (targetKey === 'ui-design') {
    expect(readSourceSkillName(targetKey)).toBe('ui-design');
    expect(manifest.targets[0].metadata.name).toBe('ui-design-guide');
  }
  if (targetKey === 'spec-workflow') {
    expect(readSourceSkillName(targetKey)).toBe('spec-workflow');
    expect(manifest.targets[0].metadata.name).toBe('spec-workflow-guide');
  }
  expect(
    fs.existsSync(
      path.join(
        outputDir,
        targetKey,
        'skills',
        manifest.targets[0].registrySlug,
        'SKILL.md',
      ),
    ),
  ).toBe(true);
});

test('buildClawhubPublishArtifacts rejects invalid targets', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawhub-invalid-'));
  tempDirs.push(outputDir);

  expect(() =>
    buildClawhubPublishArtifacts({
      targets: 'auth-web',
      outputDir,
    }),
  ).toThrow(/Unknown publish targets/);
});
