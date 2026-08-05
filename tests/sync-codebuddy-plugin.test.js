import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect, test } from 'vitest';
import {
  syncCodeBuddyPlugin,
  TOP_LEVEL_SKILL_IDS,
} from '../scripts/sync-codebuddy-plugin.ts';

test('sync-codebuddy-plugin copies generated all-in-one skill into the plugin skill directory', () => {
  const tempRootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cloudbase-codebuddy-sync-root-'),
  );
  const skillsRootDir = path.join(tempRootDir, 'plugin-skills');
  const destinationDir = path.join(skillsRootDir, 'cloudbase');

  try {
    const result = syncCodeBuddyPlugin({
      destinationDir,
      skillsRootDir,
      tempRootDir,
    });

    expect(result.destinationDir).toBe(destinationDir);
    expect(result.fileCount).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(destinationDir, 'SKILL.md'))).toBe(true);
    expect(
      fs.existsSync(path.join(destinationDir, 'references', 'auth-web-cloudbase', 'SKILL.md')),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(destinationDir, 'references', 'minimal-web-baas-demo', 'SKILL.md'),
      ),
    ).toBe(true);

    const mainSkill = fs.readFileSync(path.join(destinationDir, 'SKILL.md'), 'utf8');
    expect(mainSkill).toContain('name: cloudbase');
    expect(mainSkill).toContain('## Activation Contract');
    expect(mainSkill).toContain('Native App / Flutter / React Native');
    expect(mainSkill).toContain('minimal-web-baas-demo');

    expect(TOP_LEVEL_SKILL_IDS).toContain('minimal-web-baas-demo');
    expect(result.topLevelSkills).toContain('minimal-web-baas-demo');
    expect(
      fs.existsSync(path.join(skillsRootDir, 'minimal-web-baas-demo', 'SKILL.md')),
    ).toBe(true);
    const topLevel = fs.readFileSync(
      path.join(skillsRootDir, 'minimal-web-baas-demo', 'SKILL.md'),
      'utf8',
    );
    expect(topLevel).toContain('name: minimal-web-baas-demo');
  } finally {
    fs.rmSync(tempRootDir, { recursive: true, force: true });
  }
});
