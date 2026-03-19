import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test } from 'vitest';
import { inspectSource } from '../skills/manage-local-skills/scripts/inspect-source.mjs';
import { isUniversalAgent, resolveAgentBaseDir } from '../skills/manage-local-skills/scripts/lib/agent-mappings.mjs';
import { installLocalSkill } from '../skills/manage-local-skills/scripts/lib/install-model.mjs';
import { sanitizeSkillName } from '../skills/manage-local-skills/scripts/lib/path-safety.mjs';
import { validateSkill } from '../skills/manage-local-skills/scripts/validate-skill.mjs';

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeStandardSkill(skillDir, skillName = 'demo-skill') {
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${skillName}`,
      'description: Demo skill',
      '---',
      '',
      'See [Guide](references/guide.md).',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(skillDir, 'references', 'guide.md'),
    '# guide\n',
    'utf8',
  );
}

test('inspectSource detects a standard skill', () => {
  const rootDir = makeTempDir('manage-local-skills-standard-');
  const skillDir = path.join(rootDir, 'demo-skill');
  fs.mkdirSync(skillDir, { recursive: true });
  writeStandardSkill(skillDir);
  fs.writeFileSync(
    path.join(skillDir, 'scripts-helper.mjs'),
    'export const ok = true;\n',
    'utf8',
  );

  const result = inspectSource({ input: skillDir });

  expect(result.sourceType).toBe('standard');
  expect(result.candidateSkillName).toBe('demo-skill');
  expect(result.suggestedReferences).toContain('references/guide.md');
  expect(result.suggestedScripts).toContain('scripts-helper.mjs');
});

test('inspectSource detects a nonstandard local source', () => {
  const rootDir = makeTempDir('manage-local-skills-nonstandard-');
  fs.writeFileSync(path.join(rootDir, 'rules.md'), '# rules\n', 'utf8');
  fs.writeFileSync(path.join(rootDir, 'setup.sh'), 'echo ok\n', 'utf8');

  const result = inspectSource({ input: rootDir });

  expect(result.sourceType).toBe('nonstandard');
  expect(result.suggestedReferences).toContain('rules.md');
  expect(result.suggestedScripts).toContain('setup.sh');
});

test('agent mappings distinguish universal and agent-specific directories', () => {
  const rootDir = makeTempDir('manage-local-skills-mappings-');

  expect(isUniversalAgent('cursor')).toBe(true);
  expect(isUniversalAgent('codex')).toBe(true);
  expect(isUniversalAgent('amp')).toBe(true);
  expect(isUniversalAgent('claude-code')).toBe(false);
  expect(isUniversalAgent('codebuddy')).toBe(false);
  expect(isUniversalAgent('opencode')).toBe(true);

  expect(resolveAgentBaseDir('cursor', 'project', rootDir)).toBe(
    path.join(rootDir, '.agents/skills'),
  );
  expect(resolveAgentBaseDir('amp', 'global', rootDir)).toBe(
    path.join(os.homedir(), '.agents/skills'),
  );
  expect(resolveAgentBaseDir('claude-code', 'project', rootDir)).toBe(
    path.join(rootDir, '.claude/skills'),
  );
  expect(resolveAgentBaseDir('codebuddy', 'project', rootDir)).toBe(
    path.join(rootDir, '.codebuddy/skills'),
  );
  expect(resolveAgentBaseDir('goose', 'global', rootDir)).toBe(
    path.join(os.homedir(), '.config/goose/skills'),
  );
});

test('sanitizeSkillName matches upstream-compatible character handling', () => {
  expect(sanitizeSkillName('Hello World')).toBe('hello-world');
  expect(sanitizeSkillName('../Skill.Name__Test')).toBe('skill.name__test');
  expect(sanitizeSkillName('***')).toBe('unnamed-skill');
});

test('installLocalSkill creates a canonical install and symlink target', () => {
  const rootDir = makeTempDir('manage-local-skills-install-');
  const sourceDir = path.join(rootDir, 'skills', 'demo-skill');
  fs.mkdirSync(sourceDir, { recursive: true });
  writeStandardSkill(sourceDir);

  const result = installLocalSkill({
    sourceDir,
    skillName: 'demo-skill',
    agentKey: 'claude-code',
    scope: 'project',
    mode: 'symlink',
    cwd: rootDir,
  });

  expect(result.success).toBe(true);
  expect(result.mode).toBe('symlink');
  expect(fs.existsSync(result.canonicalPath)).toBe(true);
  expect(fs.lstatSync(result.targetPath).isSymbolicLink()).toBe(true);
  expect(
    path.resolve(path.dirname(result.targetPath), fs.readlinkSync(result.targetPath)),
  ).toBe(result.canonicalPath);
});

test('installLocalSkill supports explicit copy mode', () => {
  const rootDir = makeTempDir('manage-local-skills-copy-');
  const sourceDir = path.join(rootDir, 'skills', 'demo-skill');
  fs.mkdirSync(sourceDir, { recursive: true });
  writeStandardSkill(sourceDir);

  const result = installLocalSkill({
    sourceDir,
    skillName: 'demo-skill',
    agentKey: 'claude-code',
    scope: 'project',
    mode: 'copy',
    cwd: rootDir,
  });

  expect(result.success).toBe(true);
  expect(result.mode).toBe('copy');
  expect(fs.existsSync(path.join(result.targetPath, 'SKILL.md'))).toBe(true);
  expect(fs.lstatSync(result.targetPath).isDirectory()).toBe(true);
});

test('validateSkill passes for a valid skill and fails for missing references', () => {
  const validDir = makeTempDir('manage-local-skills-validate-ok-');
  writeStandardSkill(validDir);

  const validResult = validateSkill({ skillDir: validDir });
  expect(validResult.valid).toBe(true);

  const invalidDir = makeTempDir('manage-local-skills-validate-bad-');
  fs.writeFileSync(
    path.join(invalidDir, 'SKILL.md'),
    [
      '---',
      'name: broken-skill',
      'description: Broken',
      '---',
      '',
      'See [Missing](references/missing.md).',
      '',
    ].join('\n'),
    'utf8',
  );

  const invalidResult = validateSkill({ skillDir: invalidDir });
  expect(invalidResult.valid).toBe(false);
  expect(
    invalidResult.errors.some((error) => error.includes('Missing referenced file')),
  ).toBe(true);
});
