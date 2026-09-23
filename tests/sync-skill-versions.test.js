import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  checkSkillVersions,
  isDirectCliInvocation,
  syncSkillVersions,
  updateVersionInSkill,
} from '../scripts/sync-skill-versions.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function makeTempRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbase-skill-version-'));
  tempDirs.push(rootDir);
  return rootDir;
}

function writeSkill(file, version) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const versionLine = version ? `version: ${version}\n` : '';
  fs.writeFileSync(file, `---\nname: demo-skill\ndescription: demo\n${versionLine}---\n`);
}

function makeTempRepo() {
  const rootDir = makeTempRoot();
  const sourceSkillDir = path.join(rootDir, 'config', 'source', 'skills', 'demo-skill');
  const guidelineDir = path.join(rootDir, 'config', 'source', 'guideline', 'cloudbase');

  fs.mkdirSync(sourceSkillDir, { recursive: true });
  fs.mkdirSync(guidelineDir, { recursive: true });

  fs.writeFileSync(
    path.join(sourceSkillDir, 'SKILL.md'),
    `---
name: demo-skill
description: demo
version: 1.0.0
alwaysApply: false
---
`,
  );

  fs.writeFileSync(
    path.join(guidelineDir, 'SKILL.md'),
    `---
name: cloudbase
description: demo
version: 1.0.0
---
`,
  );

  return rootDir;
}

describe('sync skill versions', () => {
  test('updates source skills and guideline to the provided version', () => {
    const rootDir = makeTempRepo();

    const result = syncSkillVersions({
      rootDir,
      version: '2.15.5',
    });

    expect(result.updatedFiles).toHaveLength(2);
    expect(
      fs.readFileSync(
        path.join(rootDir, 'config', 'source', 'skills', 'demo-skill', 'SKILL.md'),
        'utf8',
      ),
    ).toContain('version: 2.15.5');
    expect(
      fs.readFileSync(
        path.join(rootDir, 'config', 'source', 'guideline', 'cloudbase', 'SKILL.md'),
        'utf8',
      ),
    ).toContain('version: 2.15.5');
  });

  test('covers the root entrypoint and nested lowercase skill.md files', () => {
    const rootDir = makeTempRoot();
    const rootSkill = path.join(rootDir, 'config', 'source', 'skills', 'SKILL.md');
    const nestedSkills = [
      path.join(rootDir, 'config', 'source', 'skills', 'cloudbase-agent', 'py', 'skill.md'),
      path.join(rootDir, 'config', 'source', 'skills', 'cloudbase-agent', 'ts', 'skill.md'),
    ];

    writeSkill(rootSkill, '2.21.1');
    for (const file of nestedSkills) {
      writeSkill(file, '2.21.1');
    }

    const result = syncSkillVersions({ rootDir, version: '2.34.6' });

    expect(result.updatedFiles).toHaveLength(3);
    expect(fs.readFileSync(rootSkill, 'utf8')).toContain('version: 2.34.6');
    for (const file of nestedSkills) {
      expect(fs.readFileSync(file, 'utf8')).toContain('version: 2.34.6');
    }
  });

  test('checkSkillVersions reports drift without writing', () => {
    const rootDir = makeTempRoot();
    const staleSkill = path.join(
      rootDir,
      'config',
      'source',
      'skills',
      'demo-skill',
      'SKILL.md',
    );
    const freshSkill = path.join(
      rootDir,
      'config',
      'source',
      'skills',
      'other-skill',
      'SKILL.md',
    );

    writeSkill(staleSkill, '2.21.1');
    writeSkill(freshSkill, '2.34.6');

    const { version, stale } = checkSkillVersions({ rootDir, version: '2.34.6' });

    expect(version).toBe('2.34.6');
    expect(stale).toHaveLength(1);
    expect(stale[0].file).toBe(staleSkill);
    expect(stale[0].current).toBe('2.21.1');
    expect(fs.readFileSync(staleSkill, 'utf8')).toContain('version: 2.21.1');
  });

  test('checkSkillVersions reports a missing version field', () => {
    const rootDir = makeTempRoot();
    const skillFile = path.join(rootDir, 'config', 'source', 'skills', 'demo-skill', 'SKILL.md');
    writeSkill(skillFile, null);

    const { stale } = checkSkillVersions({ rootDir, version: '2.34.6' });

    expect(stale).toHaveLength(1);
    expect(stale[0].current).toBeNull();
  });

  test('resolves the expected version from mcp/package.json', () => {
    const rootDir = makeTempRoot();
    fs.mkdirSync(path.join(rootDir, 'mcp'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, 'mcp', 'package.json'),
      JSON.stringify({ name: 'cloudbase-mcp', version: '9.9.9' }),
    );
    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ name: 'cloudbase-ai-toolkit', version: '1.0.0' }),
    );

    expect(checkSkillVersions({ rootDir }).version).toBe('9.9.9');
  });

  test('release workflow documents the sync script after version bump', () => {
    const workflow = fs.readFileSync(
      path.join(
        ROOT_DIR,
        'skills',
        'git-workflows',
        'references',
        'source-commands.md',
      ),
      'utf8',
    );

    expect(workflow).toContain('node scripts/sync-skill-versions.mjs --version X.Y.Z');
    expect(workflow).toContain('npm run check:skill-versions');
  });

  test('updateVersionInSkill accepts CRLF frontmatter when version is missing', () => {
    const raw = [
      '---',
      'name: demo-skill',
      'description: demo',
      'alwaysApply: false',
      '---',
      '',
      '# Demo',
      '',
    ].join('\r\n');

    const updated = updateVersionInSkill(raw, '2.15.5');

    expect(updated).toContain('version: 2.15.5');
    expect(updated).toContain('alwaysApply: false\r\nversion: 2.15.5\r\n---');
  });

  test('isDirectCliInvocation compares resolved filesystem paths', () => {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'sync-skill-versions.mjs');

    expect(
      isDirectCliInvocation({
        argv: [process.execPath, scriptPath],
        moduleUrl: pathToFileURL(scriptPath).href,
      }),
    ).toBe(true);
  });
});
