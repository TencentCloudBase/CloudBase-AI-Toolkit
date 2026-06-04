import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { afterEach, describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT_DIR, 'plugin', 'cloudbase-sites');
const BIN = path.join(PLUGIN_DIR, 'bin', 'cloudbase-sites');
const SESSION_HOOK = path.join(PLUGIN_DIR, 'hooks', 'on-session-start.sh');

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbase-sites-test-'));
  const realDir = fs.realpathSync(dir);
  tempDirs.push(realDir);
  return realDir;
}

function writeAppJson(cwd, app) {
  const stateDir = path.join(cwd, '.cloudbase-sites');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'app.json'), JSON.stringify(app, null, 2));
}

async function importPluginModule(relativePath, cwd) {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    const url = pathToFileURL(path.join(PLUGIN_DIR, relativePath));
    url.search = `?t=${Date.now()}-${Math.random()}`;
    return await import(url.href);
  } finally {
    process.chdir(previous);
  }
}

describe('CloudBase Sites Codex plugin packaging', () => {
  test('provides a Codex plugin manifest that references skills and MCP config', () => {
    const manifestPath = path.join(PLUGIN_DIR, '.codex-plugin', 'plugin.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.name).toBe('cloudbase-sites');
    expect(manifest.skills).toBe('./skills/');
    expect(manifest.mcpServers).toBe('./.mcp.json');
    expect(manifest.interface.displayName).toBe('CloudBase Sites');
    expect(manifest.interface.defaultPrompt.length).toBeLessThanOrEqual(3);
  });

  test('post-tool hook matcher includes Codex apply_patch edits', () => {
    const hooksPath = path.join(PLUGIN_DIR, 'hooks', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const matcher = hooks.hooks.PostToolUse[0].matcher;

    expect(matcher).toContain('Edit');
    expect(matcher).toContain('Write');
    expect(matcher).toContain('MultiEdit');
    expect(matcher).toContain('apply_patch');
  });
});

describe('CloudBase Sites runtime state paths', () => {
  test('uses .cloudbase-sites for project-local state', async () => {
    const cwd = makeTempDir();
    const state = await importPluginModule('lib/preview-state.mjs', cwd);

    expect(state.STATE_DIR).toBe(path.join(cwd, '.cloudbase-sites'));
    expect(state.LOG_DIR).toBe(path.join(cwd, '.cloudbase-sites', 'logs'));
    expect(state.PREVIEW_JSON).toBe(path.join(cwd, '.cloudbase-sites', 'preview.json'));
  });

  test('uses ~/.cloudbase-sites for machine-level registry state', async () => {
    const cwd = makeTempDir();
    const registry = await importPluginModule('lib/registry.mjs', cwd);

    expect(registry.GLOBAL_DIR).toBe(path.join(os.homedir(), '.cloudbase-sites'));
    expect(registry.REGISTRY_PATH).toBe(path.join(os.homedir(), '.cloudbase-sites', 'registry.json'));
    expect(registry.SUPERVISOR_STATE_PATH).toBe(path.join(os.homedir(), '.cloudbase-sites', 'supervisor.json'));
  });
});

describe('CloudBase Sites CLI behavior', () => {
  test('status is a non-recursive alias for preview --status', () => {
    const cwd = makeTempDir();
    const result = spawnSync(process.execPath, [BIN, 'status'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(5);
    const payload = JSON.parse(result.stdout.trim().split('\n')[0]);
    expect(payload.ok).toBe(true);
    expect(payload.running).toBe(false);
    expect(result.stderr).toContain('no preview');
  });
});

describe('CloudBase Sites SessionStart hook guidance', () => {
  test('stays passive in empty directories by default', () => {
    const cwd = makeTempDir();

    const result = spawnSync('bash', [SESSION_HOOK], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, CLOUDBASE_SITES_AUTO_INIT: '' },
      input: '',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    const context = payload.hookSpecificOutput.additionalContext;
    expect(context).toContain('hook result:** passive');
    expect(context).toContain(`${BIN} init --start`);
    expect(context).toContain('CLOUDBASE_SITES_AUTO_INIT=1');
    expect(fs.existsSync(path.join(cwd, 'package.json'))).toBe(false);
    expect(fs.existsSync(path.join(cwd, 'src'))).toBe(false);
  });

  test('injects absolute CLI fallback when cwd is a Vite project', () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
      dependencies: {
        react: '1.0.0',
        vite: '1.0.0',
      },
    }, null, 2));
    fs.mkdirSync(path.join(cwd, 'node_modules'), { recursive: true });

    const result = spawnSync('bash', [SESSION_HOOK], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env },
      input: '',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    const context = payload.hookSpecificOutput.additionalContext;
    expect(context).toContain('CLI availability fallback');
    expect(context).toContain(BIN);
    expect(context).toContain(`${BIN} preview --status`);
  });

  test('explains non-Vite skip and gives next action for later template downloads', () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'notes.txt'), 'not a Vite project yet');

    const result = spawnSync('bash', [SESSION_HOOK], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      input: '',
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    const context = payload.hookSpecificOutput.additionalContext;
    expect(context).toContain('hook result:** skipped');
    expect(context).toContain('SessionStart runs only once');
    expect(context).toContain(`${BIN} preview --status`);
    expect(context).toContain(`${BIN} preview`);
  });
});

describe('CloudBase Sites save git setup', () => {
  test('save initializes git automatically for CloudBase Sites projects', () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        build: 'echo build',
      },
      dependencies: {
        react: '1.0.0',
        vite: '1.0.0',
      },
    }, null, 2));
    fs.writeFileSync(path.join(cwd, 'src.txt'), 'first version');

    const result = spawnSync(process.execPath, [BIN, 'save', '-m', 'first'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim().split('\n')[0]);
    expect(payload.ok).toBe(true);
    expect(payload.version.n).toBe(1);
    expect(fs.existsSync(path.join(cwd, '.git'))).toBe(true);
    const gitStatus = spawnSync('git', ['status', '--short'], { cwd, encoding: 'utf8' });
    expect(gitStatus.status).toBe(0);
    expect(fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8')).toContain('.cloudbase-sites/');
  });

  test('save preserves a failing exit code when automatic git init fails', () => {
    const cwd = makeTempDir();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
      dependencies: {
        react: '1.0.0',
        vite: '1.0.0',
      },
    }, null, 2));
    const emptyPathDir = path.join(cwd, 'empty-path');
    fs.mkdirSync(emptyPathDir);

    const result = spawnSync(process.execPath, [BIN, 'save', '-m', 'first'], {
      cwd,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, PATH: emptyPathDir },
    });

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout.trim().split('\n')[0]);
    expect(payload.ok).toBe(false);
    expect(payload.message).toContain('automatic `git init` failed');
    expect(payload.nextActions[0]).toMatchObject({
      tool: 'shell',
      action: 'git init',
    });
  });
});

describe('CloudBase Sites deploy version isolation', () => {
  test('deploy stashes dirty edits even when HEAD already matches the saved version', () => {
    const cwd = makeTempDir();
    spawnSync('git', ['init'], { cwd, encoding: 'utf8' });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd, encoding: 'utf8' });
    spawnSync('git', ['config', 'user.name', 'CloudBase Sites Test'], { cwd, encoding: 'utf8' });
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
      scripts: {
        build: 'node -e "require(\'fs\').mkdirSync(\'dist\', { recursive: true }); require(\'fs\').copyFileSync(\'src.txt\', \'dist/index.html\')"',
      },
      dependencies: {
        react: '1.0.0',
        vite: '1.0.0',
      },
    }, null, 2));
    fs.writeFileSync(path.join(cwd, 'src.txt'), 'saved version');
    fs.writeFileSync(path.join(cwd, '.gitignore'), '.cloudbase-sites/\ndist/\n');
    spawnSync('git', ['add', '.'], { cwd, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'initial'], { cwd, encoding: 'utf8' });
    const commitSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).stdout.trim();
    writeAppJson(cwd, {
      siteName: 'demo-site',
      cwd,
      versions: [{ n: 1, commitSha, label: 'saved', savedAt: 'now', status: 'saved' }],
      deployments: [],
      currentVersion: 1,
      currentDeploy: null,
    });

    fs.writeFileSync(path.join(cwd, 'src.txt'), 'unsaved edit');
    fs.mkdirSync(path.join(cwd, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'dist', 'index.html'), 'previous build');
    const result = spawnSync(
      process.execPath,
      [BIN, 'deploy', '--version', '1', '--skip-build'],
      { cwd, encoding: 'utf8', timeout: 5000 },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim().split('\n')[0]);
    expect(payload.ok).toBe(true);
    expect(payload.checkout).toMatchObject({
      checked: true,
      dirty: true,
      stashed: true,
      commitSha,
    });
    expect(fs.readFileSync(path.join(cwd, 'src.txt'), 'utf8')).toBe('saved version');
    const stashList = spawnSync('git', ['stash', 'list'], { cwd, encoding: 'utf8' }).stdout;
    expect(stashList).toContain('cloudbase-sites pre-deploy version 1');
  });
});

describe('CloudBase Sites deployment metadata', () => {
  test('deploy --post rejects guessed CloudBase service domains', async () => {
    const cwd = makeTempDir();
    writeAppJson(cwd, {
      siteName: 'demo-site',
      cwd,
      versions: [{ n: 1, commitSha: 'abc1234', label: 'first', savedAt: 'now', status: 'saved' }],
      deployments: [],
      currentVersion: 1,
      currentDeploy: null,
    });

    const result = spawnSync(
      process.execPath,
      [BIN, 'deploy', '--post', '--version', '1', '--access-url', 'https://demo-site.service.tcloudbase.com', '--build-id', 'build-123'],
      { cwd, encoding: 'utf8', timeout: 5000 },
    );

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout.trim().split('\n')[0]);
    expect(payload.ok).toBe(false);
    expect(payload.message).toContain('queryApps(action="getApp")');
    expect(payload.message).toContain('.webapps.tcloudbase.com');
  });

  test('deploy --post accepts CloudBase Sites app domains', async () => {
    const cwd = makeTempDir();
    writeAppJson(cwd, {
      siteName: 'demo-site',
      cwd,
      versions: [{ n: 1, commitSha: 'abc1234', label: 'first', savedAt: 'now', status: 'saved' }],
      deployments: [],
      currentVersion: 1,
      currentDeploy: null,
    });

    const result = spawnSync(
      process.execPath,
      [BIN, 'deploy', '--post', '--version', '1', '--access-url', 'https://demo-site-env.webapps.tcloudbase.com/', '--build-id', 'build-123'],
      { cwd, encoding: 'utf8', timeout: 5000 },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout.trim().split('\n')[0]);
    expect(payload.ok).toBe(true);
    expect(payload.accessUrl).toBe('https://demo-site-env.webapps.tcloudbase.com');
  });

  test('records CloudBase build metadata in deployment entries', async () => {
    const cwd = makeTempDir();
    const appStore = await importPluginModule('lib/app-store.mjs', cwd);
    appStore.writeApp({
      siteName: 'demo-site',
      cwd,
      versions: [{ n: 1, commitSha: 'abc1234', label: 'first', savedAt: 'now', status: 'saved' }],
      deployments: [],
      currentVersion: 1,
      currentDeploy: null,
    });

    const deployment = appStore.appendDeployment({
      version: 1,
      accessUrl: 'https://demo.example.com',
      buildId: 'build-123',
      versionName: 'v-001',
      buildStatus: 'SUCCESS',
      finalUrl: 'https://demo.example.com?v=abc123',
    });

    expect(deployment.buildId).toBe('build-123');
    expect(deployment.versionName).toBe('v-001');
    expect(deployment.buildStatus).toBe('SUCCESS');

    const saved = appStore.readApp();
    expect(saved.deployments[0]).toMatchObject({
      buildId: 'build-123',
      versionName: 'v-001',
      buildStatus: 'SUCCESS',
    });
  });
});
