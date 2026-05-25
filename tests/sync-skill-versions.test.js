import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { afterEach, describe, expect, test } from 'vitest';
import {
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

function makeTempRepo() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbase-skill-version-'));
  tempDirs.push(rootDir);

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
    expect(workflow).toContain('config/source/skills/*/SKILL.md');
    expect(workflow).toContain('npx bumpp');
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
