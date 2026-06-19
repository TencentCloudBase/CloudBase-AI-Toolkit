import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test } from 'vitest';
import {
  checkClaudeSkillsMirror,
  syncClaudeSkillsMirror,
} from '../scripts/sync-claude-skills-mirror.mjs';

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

test('syncClaudeSkillsMirror copies skills and removes stale files', () => {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cloudbase-claude-skills-source-'),
  );
  tempDirs.push(rootDir);

  const sourceDir = path.join(rootDir, 'skills');
  const targetDir = path.join(rootDir, 'config', '.claude', 'skills');

  fs.mkdirSync(path.join(sourceDir, 'foo'), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'foo', 'SKILL.md'), '# foo\n');
  fs.writeFileSync(path.join(sourceDir, 'foo', 'extra.md'), 'extra\n');
  fs.mkdirSync(path.join(targetDir, 'stale'), { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'stale', 'SKILL.md'), '# stale\n');

  const result = syncClaudeSkillsMirror({ sourceDir, targetDir });

  expect(result.skillNames).toEqual(['foo']);
  expect(fs.existsSync(path.join(targetDir, 'foo', 'SKILL.md'))).toBe(true);
  expect(fs.existsSync(path.join(targetDir, 'foo', 'extra.md'))).toBe(true);
  expect(fs.existsSync(path.join(targetDir, 'stale'))).toBe(false);
});

test('checkClaudeSkillsMirror reports drift against source skills', () => {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cloudbase-claude-skills-check-'),
  );
  tempDirs.push(rootDir);

  const sourceDir = path.join(rootDir, 'skills');
  const targetDir = path.join(rootDir, 'config', '.claude', 'skills');

  fs.mkdirSync(path.join(sourceDir, 'foo'), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'foo', 'SKILL.md'), '# foo\n');

  fs.mkdirSync(path.join(targetDir, 'foo'), { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'foo', 'SKILL.md'), '# stale\n');
  fs.writeFileSync(path.join(targetDir, 'foo', 'extra.md'), 'extra\n');

  const result = checkClaudeSkillsMirror({ sourceDir, targetDir });

  expect(result.hasDiff).toBe(true);
  expect(result.extraFiles).toContain(path.join('foo', 'extra.md'));
  expect(result.changedFiles).toContain(path.join('foo', 'SKILL.md'));
});
