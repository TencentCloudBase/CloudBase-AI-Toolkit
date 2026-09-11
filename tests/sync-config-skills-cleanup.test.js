import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test } from 'vitest';
import { buildCompatConfig } from '../scripts/build-compat-config.mjs';
import {
  assertSkillsInSync,
  cleanStaleSkills,
  collectExpectedSkills,
  formatSkillSyncIssues,
} from '../scripts/sync-config.mjs';

// 与 sync-config.mjs 中 MINIPROGRAM_ONLY_SKILLS 保持一致的 web 模板过滤集合
const MINIPROGRAM_ONLY_SKILLS = new Set([
  'miniprogram-development',
  'auth-wechat-miniprogram',
  'ai-model-wechat',
  'cloudbase-document-database-in-wechat-miniprogram',
]);

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

function makeSkill(root, relSkillsDir, name) {
  const dir = path.join(root, relSkillsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}\n`);
}

function listEntries(root, relDir) {
  const dir = path.join(root, relDir);
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

test('collectExpectedSkills 只收集 skills 目录，并按 isExcludedSkill 复用复制语义', () => {
  const src = makeTempDir('cloudbase-sync-src-');
  makeSkill(src, '.claude/skills', 'alpha');
  makeSkill(src, '.claude/skills', 'beta');
  makeSkill(src, '.codebuddy/skills', 'alpha');
  makeSkill(src, '.codebuddy/skills', 'beta');
  makeSkill(src, '.agents/skills', 'alpha');
  makeSkill(src, '.agents/skills', 'beta');
  makeSkill(src, 'rules', 'alpha'); // 目录名不是 skills → 不参与清理/断言
  fs.mkdirSync(path.join(src, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(src, '.claude', 'skills', 'README.md'), '不是 skill 目录');

  const all = collectExpectedSkills(src);
  expect([...all.keys()].sort()).toEqual([
    '.agents/skills',
    '.claude/skills',
    '.codebuddy/skills',
  ]);
  expect([...all.get('.claude/skills')].sort()).toEqual(['alpha', 'beta']);

  const excluded = collectExpectedSkills(src, { excludedSkills: new Set(['beta']) });
  // .claude/.codebuddy 下被平台过滤的 skill 既不算缺失，也不会被误判为需删除
  expect([...excluded.get('.claude/skills')].sort()).toEqual(['alpha']);
  expect([...excluded.get('.codebuddy/skills')].sort()).toEqual(['alpha']);
  // .agents/skills 不在 isExcludedSkill 的覆盖范围内，复制逻辑同样不会过滤 → 期望集合保持一致
  expect([...excluded.get('.agents/skills')].sort()).toEqual(['alpha', 'beta']);

  const scoped = collectExpectedSkills(src, { includePatterns: ['.codebuddy'] });
  expect([...scoped.keys()]).toEqual(['.codebuddy/skills']);
});

test('cleanStaleSkills 只删除 skills/ 下源中不存在的子目录，其它一律不碰', () => {
  const target = makeTempDir('cloudbase-sync-target-');
  makeSkill(target, '.claude/skills', 'alpha');
  makeSkill(target, '.claude/skills', 'beta');
  makeSkill(target, '.claude/skills', 'ghost');
  makeSkill(target, '.agents/skills', 'orphan'); // 不在期望 map 里 → 不碰
  fs.writeFileSync(path.join(target, '.claude', 'skills', 'README.md'), 'keep');
  fs.writeFileSync(path.join(target, '.claude', 'settings.json'), '{"keep":true}');
  fs.mkdirSync(path.join(target, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(target, '.claude', 'commands', 'spec.md'), 'keep');

  const expected = new Map([['.claude/skills', new Set(['alpha', 'beta'])]]);
  const removed = cleanStaleSkills(target, expected, { log: () => {} });

  expect(removed).toEqual([{ relPath: '.claude/skills/ghost', skill: 'ghost' }]);
  expect(listEntries(target, '.claude/skills')).toEqual(['README.md', 'alpha', 'beta']);
  expect(listEntries(target, '.agents/skills')).toEqual(['orphan']);
  expect(fs.readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8')).toBe('{"keep":true}');
  expect(fs.readFileSync(path.join(target, '.claude', 'commands', 'spec.md'), 'utf8')).toBe('keep');
});

test('cleanStaleSkills 在 dry-run 下只报告不删除', () => {
  const target = makeTempDir('cloudbase-sync-dryrun-');
  makeSkill(target, '.claude/skills', 'alpha');
  makeSkill(target, '.claude/skills', 'ghost');

  const expected = new Map([['.claude/skills', new Set(['alpha'])]]);
  const removed = cleanStaleSkills(target, expected, { dryRun: true, log: () => {} });

  expect(removed.map(item => item.skill)).toEqual(['ghost']);
  expect(fs.existsSync(path.join(target, '.claude', 'skills', 'ghost', 'SKILL.md'))).toBe(true);
});

test('cleanStaleSkills 拒绝越界/非 skills 目标', () => {
  const target = makeTempDir('cloudbase-sync-guard-');
  makeSkill(target, '.claude/skills', 'ghost');

  // 目录名不是 skills → 直接拒绝，避免误删模板自身配置目录
  expect(() =>
    cleanStaleSkills(target, new Map([['.claude/commands', new Set()]]), { log: () => {} }),
  ).toThrow(/拒绝清理非 skills 目录/);

  // 名字虽为 skills，但路径逃逸到 targetDir 之外 → 拒绝
  expect(() =>
    cleanStaleSkills(target, new Map([['../../skills', new Set()]]), { log: () => {} }),
  ).toThrow(/越界/);

  // 目标 skills 目录不存在时直接跳过，不报错
  expect(
    cleanStaleSkills(target, new Map([['.codebuddy/skills', new Set()]]), { log: () => {} }),
  ).toEqual([]);
});

test('assertSkillsInSync 校验缺失与残留，并给出可读差异', () => {
  const target = makeTempDir('cloudbase-sync-assert-');
  makeSkill(target, '.claude/skills', 'alpha');
  makeSkill(target, '.claude/skills', 'beta');

  const matched = assertSkillsInSync(target, new Map([['.claude/skills', new Set(['alpha', 'beta'])]]));
  expect(matched.ok).toBe(true);
  expect(matched.issues).toEqual([]);

  makeSkill(target, '.claude/skills', 'ghost');
  const mismatched = assertSkillsInSync(
    target,
    new Map([['.claude/skills', new Set(['alpha', 'beta', 'missing-one'])]]),
  );
  expect(mismatched.ok).toBe(false);
  expect(mismatched.issues).toEqual([
    { relSkillsDir: '.claude/skills', missing: ['missing-one'], unexpected: ['ghost'] },
  ]);
  const text = formatSkillSyncIssues(mismatched.issues);
  expect(text).toContain('缺少: missing-one');
  expect(text).toContain('残留: ghost');

  // 目标端 skills 目录整体缺失也要报缺失
  const absent = assertSkillsInSync(target, new Map([['.codebuddy/skills', new Set(['alpha'])]]));
  expect(absent.ok).toBe(false);
  expect(absent.issues[0].missing).toEqual(['alpha']);
});

test('集成：真实 compat 产物中，web 模板的僵尸 skill 被清理且配置不被破坏', () => {
  const compat = makeTempDir('cloudbase-sync-compat-');
  const target = makeTempDir('cloudbase-sync-integration-');
  buildCompatConfig({ outputDir: compat });

  const expectedBySkillsDir = collectExpectedSkills(compat, {
    excludedSkills: MINIPROGRAM_ONLY_SKILLS,
  });
  const expectedClaudeSkills = expectedBySkillsDir.get('.claude/skills');
  expect(expectedClaudeSkills.size).toBeGreaterThan(0);
  // 小程序专属 skill 已被平台过滤，不应出现在 web 模板期望集合里
  expect(expectedClaudeSkills.has('miniprogram-development')).toBe(false);

  // 模拟已被同步过的 web 模板：应有 skill 都在，另外残留 2 个改名前的旧 skill
  for (const name of expectedClaudeSkills) makeSkill(target, '.claude/skills', name);
  makeSkill(target, '.claude/skills', 'auth-nodejs');
  makeSkill(target, '.claude/skills', 'no-sql-web-sdk');
  fs.mkdirSync(path.join(target, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(target, '.claude', 'commands', 'spec.md'), 'keep');
  fs.writeFileSync(path.join(target, '.claude', 'settings.json'), '{"keep":true}');

  const removed = cleanStaleSkills(target, expectedBySkillsDir, { log: () => {} });

  expect(removed.map(item => item.skill).sort()).toEqual(['auth-nodejs', 'no-sql-web-sdk']);
  expect(listEntries(target, '.claude/skills')).toEqual([...expectedClaudeSkills].sort());
  expect(fs.readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8')).toBe('{"keep":true}');
  expect(fs.readFileSync(path.join(target, '.claude', 'commands', 'spec.md'), 'utf8')).toBe('keep');

  // 断言只看实际存在的 skills 目录（其余目录由复制逻辑负责），此处限定 .claude/skills
  const claudeExpected = new Map([['.claude/skills', expectedClaudeSkills]]);
  expect(assertSkillsInSync(target, claudeExpected).ok).toBe(true);
});
