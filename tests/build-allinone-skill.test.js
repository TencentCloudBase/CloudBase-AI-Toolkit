import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { afterEach, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const NVM_SH = path.join(os.homedir(), '.nvm', 'nvm.sh');
const tempDirs = [];

function hasNode24ViaNvm() {
  if (!fs.existsSync(NVM_SH)) {
    return false;
  }

  try {
    const version = execFileSync(
      '/bin/zsh',
      ['-lc', `source "${NVM_SH}" && nvm version 24`],
      {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        encoding: 'utf8',
      },
    ).trim();

    return version.startsWith('v24.');
  } catch {
    return false;
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

test.skipIf(!hasNode24ViaNvm())(
  'build-allinone-skill bundles guideline and references from minimal sources',
  () => {
    const targetDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cloudbase-allinone-build-'),
    );
    tempDirs.push(targetDir);

    execFileSync(
      '/bin/zsh',
      [
        '-lc',
        `source "${NVM_SH}" && nvm use 24 >/dev/null && node scripts/build-allinone-skill.ts --dir "${targetDir}"`,
      ],
      {
        cwd: ROOT_DIR,
        stdio: 'pipe',
      },
    );

    const outputDir = path.join(targetDir, 'cloudbase');
    expect(fs.existsSync(path.join(outputDir, 'SKILL.md'))).toBe(true);
    expect(
      fs.existsSync(path.join(outputDir, 'references', 'auth-web', 'SKILL.md')),
    ).toBe(true);

    const mainSkill = fs.readFileSync(path.join(outputDir, 'SKILL.md'), 'utf8');
    expect(mainSkill).toContain('name: cloudbase');
    expect(mainSkill).toContain('references/auth-web/SKILL.md');
    expect(mainSkill).toContain('## Activation Contract');
    expect(mainSkill).toContain('Provider status and publishable key');
  },
);
