import { describe, expect, test } from 'vitest';
import {
  buildSyncCommand,
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

  test('passes a single-line changelog to clawhub sync', () => {
    const command = buildSyncCommand(
      { artifactRootDir: '/tmp/artifact', targetKey: 'all-in-one' },
      {
        bump: 'minor',
        tags: 'latest',
        changelog: 'Recent commits / 最近提交:\n- first\n- second',
      },
    );

    const changelogIndex = command.args.indexOf('--changelog') + 1;

    expect(command.command).toBe('clawhub');
    expect(command.args).toContain('--all');
    expect(command.args[changelogIndex]).toBe('Recent commits / 最近提交: | - first | - second');
    expect(command.args[changelogIndex]).not.toMatch(/[\r\n]/);
  });
});
