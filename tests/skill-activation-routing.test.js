import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';
import { loadYamlModule } from '../scripts/lib/load-yaml-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const GUIDELINE_DIR = path.join(
  ROOT_DIR,
  'config',
  'source',
  'guideline',
  'cloudbase',
);
const GUIDELINE_FILE = path.join(GUIDELINE_DIR, 'SKILL.md');
const ACTIVATION_MAP_FILE = path.join(GUIDELINE_DIR, 'references', 'activation-map.yaml');
const MCP_SETUP_FILE = path.join(GUIDELINE_DIR, 'references', 'mcp-setup.md');

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

  test('keeps the source guideline routing table aligned with activation checks', () => {
    const source = fs.readFileSync(GUIDELINE_FILE, 'utf8');

    expect(source).toContain('| Scenario | Read first | Then read | Do NOT route to first | Must check before action |');
    expect(source).toContain('| Web login / registration / auth UI | `auth-tool` | auth-web, web-development | cloud-functions, http-api | Provider status and publishable key |');
    expect(source).toContain('| AI Agent (智能体开发) | `cloudbase-agent` | cloud-functions, cloudrun-development |');
    expect(source).not.toContain('| web-auth | `auth-tool` |');
  });

  test('keeps moved mcporter patch examples copy-pasteable', () => {
    const setup = fs.readFileSync(MCP_SETUP_FILE, 'utf8');
    const patchExamples = Array.from(setup.matchAll(/patch='([^']+)'/g));

    expect(patchExamples.length).toBeGreaterThan(0);
    for (const [, patch] of patchExamples) {
      expect(() => JSON.parse(patch)).not.toThrow();
    }
  });
});
