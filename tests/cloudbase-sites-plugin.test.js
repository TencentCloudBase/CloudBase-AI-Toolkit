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
