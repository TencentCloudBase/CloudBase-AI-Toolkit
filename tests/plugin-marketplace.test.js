import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('CloudBase plugin marketplace', () => {
  test('exposes Codex plugins from the repository root', () => {
    const marketplacePath = path.join(ROOT_DIR, 'marketplace.json');
    expect(fs.existsSync(marketplacePath)).toBe(true);

    const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
    expect(marketplace.name).toBe('tencent-cloudbase');
    expect(marketplace.interface.displayName).toBe('Tencent CloudBase');

    const expectedPlugins = new Map([
      // Client marketplaces serve the Codex variant: Codex drops plugin hooks
      // for packages carrying the Agent Plugins root manifest, so the mounted
      // package is the generated `-codex` copy. The portable package remains at
      // ./plugin/<name> for OPS repo sync and `npx plugins`.
      ['cloudbase', './plugin/cloudbase-codex'],
      ['cloudbase-sites', './plugin/cloudbase-sites-codex'],
    ]);

    for (const [name, sourcePath] of expectedPlugins) {
      const entry = marketplace.plugins.find((plugin) => plugin.name === name);
      expect(entry).toBeTruthy();
      expect(entry.source).toEqual({
        source: 'local',
        path: sourcePath,
      });
      expect(entry.policy).toEqual({
        installation: 'AVAILABLE',
        authentication: 'ON_INSTALL',
      });
      expect(entry.category).toBe('Developer Tools');

      const pluginRoot = path.join(ROOT_DIR, sourcePath);
      expect(fs.existsSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'))).toBe(true);
    }
  });

  test('exposes Codex-preferred marketplace under .agents/plugins', () => {
    const marketplacePath = path.join(ROOT_DIR, '.agents', 'plugins', 'marketplace.json');
    expect(fs.existsSync(marketplacePath)).toBe(true);

    const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
    const rootMarketplace = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, 'marketplace.json'), 'utf8'),
    );
    expect(marketplace).toEqual(rootMarketplace);
  });

  test('exposes Claude Code plugins from .claude-plugin marketplace', () => {
    const marketplacePath = path.join(ROOT_DIR, '.claude-plugin', 'marketplace.json');
    expect(fs.existsSync(marketplacePath)).toBe(true);

    const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
    expect(marketplace.name).toBe('tencent-cloudbase');
    expect(marketplace.owner.name).toBe('Tencent CloudBase');

    const expectedPlugins = new Map([
      // Client marketplaces serve the Codex variant: Codex drops plugin hooks
      // for packages carrying the Agent Plugins root manifest, so the mounted
      // package is the generated `-codex` copy. The portable package remains at
      // ./plugin/<name> for OPS repo sync and `npx plugins`.
      ['cloudbase', './plugin/cloudbase-codex'],
      ['cloudbase-sites', './plugin/cloudbase-sites-codex'],
    ]);

    for (const [name, sourcePath] of expectedPlugins) {
      const entry = marketplace.plugins.find((plugin) => plugin.name === name);
      expect(entry).toBeTruthy();
      expect(entry.source).toBe(sourcePath);
      expect(entry.category).toBe('Developer Tools');
      expect(entry.description).toContain('CloudBase');

      const pluginRoot = path.join(ROOT_DIR, sourcePath);
      expect(fs.existsSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'))).toBe(true);
    }
  });

  test('exposes single-plugin marketplaces for sparse-path installs', () => {
    const sparseMarketplaces = [
      {
        marketplacePath: path.join(ROOT_DIR, 'plugin', 'cloudbase', 'marketplace.json'),
        name: 'cloudbase',
      },
      {
        marketplacePath: path.join(ROOT_DIR, 'plugin', 'cloudbase-sites', 'marketplace.json'),
        name: 'cloudbase-sites',
      },
    ];

    for (const { marketplacePath, name } of sparseMarketplaces) {
      const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
      expect(marketplace.plugins).toHaveLength(1);
      expect(marketplace.plugins[0].name).toBe(name);
      expect(marketplace.plugins[0].source).toEqual({
        source: 'local',
        path: './',
      });
      expect(
        fs.existsSync(path.join(path.dirname(marketplacePath), '.codex-plugin', 'plugin.json')),
      ).toBe(true);
    }
  });

  test('exposes single-plugin Claude Code marketplaces for local path installs', () => {
    const sparseMarketplaces = [
      {
        marketplacePath: path.join(ROOT_DIR, 'plugin', 'cloudbase', '.claude-plugin', 'marketplace.json'),
        name: 'cloudbase',
      },
      {
        marketplacePath: path.join(ROOT_DIR, 'plugin', 'cloudbase-sites', '.claude-plugin', 'marketplace.json'),
        name: 'cloudbase-sites',
      },
    ];

    for (const { marketplacePath, name } of sparseMarketplaces) {
      const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
      expect(marketplace.plugins).toHaveLength(1);
      expect(marketplace.plugins[0].name).toBe(name);
      expect(marketplace.plugins[0].source).toBe('./');
      expect(
        fs.existsSync(path.join(path.dirname(marketplacePath), 'plugin.json')),
      ).toBe(true);
    }
  });
});
