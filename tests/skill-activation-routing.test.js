import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';
import { loadYamlModule } from '../scripts/lib/load-yaml-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ACTIVATION_MAP_FILE = path.join(
  ROOT_DIR,
  'config',
  'source',
  'guideline',
  'cloudbase',
  'activation-map.yaml',
);

const SKILL_SOURCE_DIR = path.join(ROOT_DIR, 'config', 'source', 'skills');

function getSkillNames() {
  return fs
    .readdirSync(SKILL_SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(SKILL_SOURCE_DIR, entry.name, 'SKILL.md')))
    .map((entry) => entry.name);
}

describe('skill activation routing contract', async () => {
  const yaml = await loadYamlModule(ROOT_DIR);
  const activationMap = yaml.load(fs.readFileSync(ACTIVATION_MAP_FILE, 'utf8'));
  const skillNames = new Set(getSkillNames());
  skillNames.add('cloudbase');

  test('uses stable skill ids instead of repo-specific source paths', () => {
    const raw = fs.readFileSync(ACTIVATION_MAP_FILE, 'utf8');
    expect(raw).not.toContain('config/source/skills/');
    expect(raw).not.toContain('config/source/guideline/cloudbase/SKILL.md');
  });

  test('declares complete routing fields for every scenario', () => {
    expect(Array.isArray(activationMap.scenarios)).toBe(true);
    expect(activationMap.scenarios.length).toBeGreaterThan(0);

    for (const scenario of activationMap.scenarios) {
      expect(typeof scenario.id).toBe('string');
      expect(typeof scenario.firstRead).toBe('string');
      expect(Array.isArray(scenario.thenRead)).toBe(true);
      expect(Array.isArray(scenario.beforeAction)).toBe(true);
      expect(Array.isArray(scenario.doNotUse)).toBe(true);
      expect(Array.isArray(scenario.commonMistakes)).toBe(true);
      expect(scenario.beforeAction.length).toBeGreaterThan(0);
      expect(scenario.doNotUse.length).toBeGreaterThan(0);
    }
  });

  test('references only known skill ids', () => {
    for (const scenario of activationMap.scenarios) {
      expect(skillNames.has(scenario.firstRead)).toBe(true);
      for (const skillId of scenario.thenRead) {
        expect(skillNames.has(skillId)).toBe(true);
      }
      for (const skillId of scenario.doNotUse) {
        expect(skillNames.has(skillId)).toBe(true);
      }
    }
  });

  test('locks critical routing boundaries', () => {
    const byId = new Map(activationMap.scenarios.map((scenario) => [scenario.id, scenario]));

    expect(byId.get('web-auth').firstRead).toBe('auth-tool');
    expect(byId.get('web-auth').doNotUse).toContain('cloud-functions');
    expect(byId.get('native-http-api').firstRead).toBe('http-api');
    expect(byId.get('native-http-api').doNotUse).toContain('auth-web');
    expect(byId.get('cloud-functions').doNotUse).toContain('cloudrun-development');
    expect(byId.get('ui-first').firstRead).toBe('ui-design');
  });
});
