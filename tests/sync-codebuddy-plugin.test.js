import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect, test } from 'vitest';
import { syncCodeBuddyPlugin } from '../scripts/sync-codebuddy-plugin.ts';

test('sync-codebuddy-plugin copies generated all-in-one skill into the plugin skill directory', () => {
  const tempRootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cloudbase-codebuddy-sync-root-'),
  );
  const destinationDir = path.join(tempRootDir, 'plugin-skills', 'cloudbase');

  try {
    const result = syncCodeBuddyPlugin({
      destinationDir,
      tempRootDir,
    });

    expect(result.destinationDir).toBe(destinationDir);
    expect(result.fileCount).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(destinationDir, 'SKILL.md'))).toBe(true);
    expect(
      fs.existsSync(path.join(destinationDir, 'references', 'auth-web', 'SKILL.md')),
    ).toBe(true);

    const mainSkill = fs.readFileSync(path.join(destinationDir, 'SKILL.md'), 'utf8');
    expect(mainSkill).toContain('name: cloudbase');
    expect(mainSkill).toContain('## Activation Contract');
    expect(mainSkill).toContain('Native App / Flutter / React Native');
  } finally {
    fs.rmSync(tempRootDir, { recursive: true, force: true });
  }
});
