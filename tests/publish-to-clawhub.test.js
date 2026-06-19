import { describe, expect, test } from 'vitest';
import {
  buildPublishCommand,
  normalizeClawhubChangelog,
} from '../scripts/publish-to-clawhub.mjs';

describe('publish-to-clawhub command construction', () => {
  test('normalizes multiline changelog for clawhub CLI arguments', () => {
    const changelog = [
      'Recent commits / 最近提交:',
      '- Merge pull request #757 from TencentCloudBase/feature/pg-skill-guidance-hardening',
      '- fix(tests): 🧪 restore PR verification',
      '',
      '- chore(deps): 🔒 refresh pnpm lockfile',
    ].join('\n');

    const normalized = normalizeClawhubChangelog(changelog);

    expect(normalized).toBe(
      'Recent commits / 最近提交: | - Merge pull request #757 from TencentCloudBase/feature/pg-skill-guidance-hardening | - fix(tests): 🧪 restore PR verification | - chore(deps): 🔒 refresh pnpm lockfile',
    );
    expect(normalized).not.toMatch(/[\r\n]/);
  });

  test('publishes a single skill folder with a single-line changelog', () => {
    const command = buildPublishCommand(
      {
        artifactDir: '/tmp/artifact/skills/cloudbase',
        registrySlug: 'cloudbase',
        targetKey: 'all-in-one',
      },
      {
        bump: 'minor',
        tags: 'latest',
        changelog: 'Recent commits / 最近提交:\n- first\n- second',
      },
    );

    const changelogIndex = command.args.indexOf('--changelog') + 1;

    expect(command.command).toBe('clawhub');
    expect(command.args.slice(0, 3)).toEqual(['skill', 'publish', '/tmp/artifact/skills/cloudbase']);
    expect(command.args).toContain('--slug');
    expect(command.args[command.args.indexOf('--slug') + 1]).toBe('cloudbase');
    expect(command.args).not.toContain('sync');
    expect(command.args).not.toContain('--all');
    expect(command.args[changelogIndex]).toBe('Recent commits / 最近提交: | - first | - second');
    expect(command.args[changelogIndex]).not.toMatch(/[\r\n]/);
  });
});
