import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  BASELINE_PATH,
  collectBaselineSyncState,
  evaluateBaselineSync,
  parseArgs,
  runCheck,
} from '../scripts/check-compat-baseline-sync.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'check-compat-baseline-sync.mjs');
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbase-baseline-sync-'));
  tempDirs.push(dir);
  return dir;
}

/** git 调用统一带上 -c，避免宿主的 hooksPath / gpgsign 干扰临时仓库。 */
function git(cwd, args) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=test',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ],
    { cwd, encoding: 'utf8' },
  );
}

function writeRepoFile(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

/** 造一个最小的仓库：一个 skill 入口、一份 baseline，两次提交形成一个 base..HEAD 区间。 */
function makeRepo({ changeVersion, refreshBaseline, touchContentWithoutVersion = false }) {
  const rootDir = makeTempDir();
  const skillPath = 'config/source/skills/demo-skill/SKILL.md';
  const skill = (version) => `---\nname: demo-skill\nversion: ${version}\n---\n\n# Demo\n`;

  git(rootDir, ['init', '-q']);
  writeRepoFile(rootDir, skillPath, skill('2.34.6'));
  writeRepoFile(rootDir, BASELINE_PATH, '{ "version": 2 }\n');
  git(rootDir, ['add', '-A']);
  git(rootDir, ['commit', '-q', '-m', 'base']);
  const base = git(rootDir, ['rev-parse', 'HEAD']).trim();

  if (changeVersion) {
    writeRepoFile(rootDir, skillPath, skill('2.34.7'));
  }
  if (touchContentWithoutVersion) {
    writeRepoFile(rootDir, skillPath, skill('2.34.6').replace('# Demo', '# Demo (rewritten prose)'));
  }
  if (refreshBaseline) {
    writeRepoFile(rootDir, BASELINE_PATH, '{ "version": 2, "generatedAt": "2026-09-23T00:00:00.000Z" }\n');
  }

  git(rootDir, ['add', '-A']);
  git(rootDir, ['commit', '-q', '-m', 'change']);

  return { rootDir, base };
}

function makeFakeGit({ versionDiff = '', baselineDiff = '', resolvable = true } = {}) {
  const calls = [];
  const gitRunner = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'rev-parse') {
      if (!resolvable) throw new Error('unknown revision');
      return 'deadbeef\n';
    }
    if (args[0] === 'diff' && args.includes(BASELINE_PATH)) return baselineDiff;
    if (args[0] === 'diff') return versionDiff;
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
  return { gitRunner, calls };
}

describe('compat baseline / version-bump sync check', () => {
  test('evaluateBaselineSync allows any change that leaves version declarations alone', () => {
    expect(evaluateBaselineSync({ versionChanged: false, baselineChanged: false })).toEqual({
      ok: true,
      reason: 'no-version-change',
    });
    expect(evaluateBaselineSync({ versionChanged: false, baselineChanged: true })).toEqual({
      ok: true,
      reason: 'no-version-change',
    });
  });

  test('evaluateBaselineSync allows a version change when the baseline moved with it', () => {
    expect(evaluateBaselineSync({ versionChanged: true, baselineChanged: true })).toEqual({
      ok: true,
      reason: 'baseline-refreshed',
    });
  });

  test('evaluateBaselineSync rejects a version change that left the baseline behind', () => {
    expect(evaluateBaselineSync({ versionChanged: true, baselineChanged: false })).toEqual({
      ok: false,
      reason: 'baseline-stale',
    });
  });

  test('detects frontmatter and JSON version lines, but not prose that mentions a version', () => {
    const { gitRunner: bump } = makeFakeGit({
      versionDiff: '-version: 2.34.6\n+version: 2.34.7',
    });
    expect(collectBaselineSyncState('base', { git: bump }).versionChanged).toBe(true);

    const { gitRunner: jsonBump } = makeFakeGit({
      versionDiff: '-  "version": "2.34.6",\n+  "version": "2.34.7",',
    });
    expect(collectBaselineSyncState('base', { git: jsonBump }).versionChanged).toBe(true);

    const { gitRunner: proseOnly } = makeFakeGit({
      versionDiff: '-the version is pinned in mcp/package.json\n+the version is pinned elsewhere',
    });
    expect(collectBaselineSyncState('base', { git: proseOnly }).versionChanged).toBe(false);
  });

  test('parseArgs accepts an empty base and rejects a dangling flag', () => {
    expect(parseArgs(['--base', ''])).toEqual({ base: '' });
    expect(parseArgs(['--base', 'origin/main', '--cwd', '/tmp'])).toEqual({
      base: 'origin/main',
      cwd: '/tmp',
    });
    expect(() => parseArgs(['--base'])).toThrow();
    expect(() => parseArgs(['--base', '--cwd', '/tmp'])).toThrow();
  });

  test('skips without failing when no base revision is available', () => {
    const lines = [];
    const { gitRunner, calls } = makeFakeGit({ resolvable: false });

    const code = runCheck({ base: undefined, git: gitRunner, log: (l) => lines.push(l), error: () => {} });
    expect(code).toBe(0);
    expect(calls).toHaveLength(0);
    expect(lines[0]).toContain('skipping');

    const lines2 = [];
    const code2 = runCheck({
      base: 'origin/main',
      git: gitRunner,
      log: (l) => lines2.push(l),
      error: () => {},
    });
    expect(code2).toBe(0);
    expect(lines2[0]).toContain('not available locally');
  });

  test('fails with an actionable message when the version moved without the baseline', () => {
    const { gitRunner } = makeFakeGit({
      versionDiff: '-version: 2.34.6\n+version: 2.34.7',
      baselineDiff: '',
    });
    const errors = [];

    const code = runCheck({
      base: 'base',
      git: gitRunner,
      log: () => {},
      error: (l) => errors.push(l),
    });

    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('compat baseline was not refreshed');
    expect(errors.join('\n')).toContain('npm run update:compat-baseline');
  });

  test('passes when the version moved together with the baseline', () => {
    const { gitRunner } = makeFakeGit({
      versionDiff: '-version: 2.34.6\n+version: 2.34.7',
      baselineDiff: `${BASELINE_PATH}\n`,
    });
    const lines = [];

    const code = runCheck({
      base: 'base',
      git: gitRunner,
      log: (l) => lines.push(l),
      error: () => {},
    });

    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('refreshed in the same change');
  });

  test('real git: a version bump without a baseline refresh fails the check', () => {
    const { rootDir, base } = makeRepo({ changeVersion: true, refreshBaseline: false });

    const result = runScript(rootDir, base);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('compat baseline was not refreshed');
  });

  test('real git: a version bump that refreshes the baseline passes', () => {
    const { rootDir, base } = makeRepo({ changeVersion: true, refreshBaseline: true });

    const result = runScript(rootDir, base);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('refreshed in the same change');
  });

  test('real git: prose-only edits are not treated as a version bump', () => {
    const { rootDir, base } = makeRepo({
      changeVersion: false,
      refreshBaseline: false,
      touchContentWithoutVersion: true,
    });

    const result = runScript(rootDir, base);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('does not apply');
  });
});

function runScript(cwd, base) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH, '--base', base], {
      cwd,
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}
