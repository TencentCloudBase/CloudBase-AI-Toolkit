import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ALL_IN_ONE_UPLOAD_TICKET_MAX_ATTEMPTS,
  buildPublishCommand,
  formatClawhubUploadTicketFailure,
  isClawhubUploadTicketError,
  isClawhubVersionExistsError,
  normalizeClawhubChangelog,
  publishToClawhub,
  supportsClawhubUploadTicketRetry,
} from '../scripts/publish-to-clawhub.mjs';

const tempDirs = [];

function createManifest(targets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawhub-publish-test-'));
  tempDirs.push(dir);
  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      targets: targets.map((target) => ({
        artifactDir: path.join(dir, target.targetKey),
        ...target,
      })),
    }),
  );
  return manifestPath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

  test('detects clawhub version-already-exists errors as idempotent', () => {
    expect(
      isClawhubVersionExistsError(
        new Error('Version 1.92.41 already exists. Increment the version number and try again.'),
      ),
    ).toBe(true);
    expect(isClawhubVersionExistsError(new Error('Uploaded file does not match its skill upload ticket'))).toBe(
      false,
    );
  });

  test('detects version-already-exists when text is only on stderr (CI regression)', () => {
    // execFileSync with stdio inherit left error.message as "Command failed: ..."
    // without stderr; production must capture stderr onto the error object.
    const error = new Error(
      'Command failed: clawhub skill publish /tmp/artifact/skills/cloudbase --slug cloudbase',
    );
    error.stderr =
      'Error: Version 1.92.48 already exists. Increment the version number and try again. (reset in 44s)\n';
    expect(isClawhubVersionExistsError(error)).toBe(true);
  });

  test('detects OK already-published messages as idempotent', () => {
    const error = new Error('Command failed: clawhub skill publish ...');
    error.stdout = 'OK. cloudbase@1.92.48 is already published\n';
    expect(isClawhubVersionExistsError(error)).toBe(true);
  });

  test('detects upload-ticket mismatch errors as retryable', () => {
    expect(
      isClawhubUploadTicketError(
        new Error('Skill upload ticket does not match this publish'),
      ),
    ).toBe(true);

    const stderrOnly = new Error('Command failed: clawhub skill publish ...');
    stderrOnly.stderr = 'Error: Uploaded file does not match its skill upload ticket\n';
    expect(isClawhubUploadTicketError(stderrOnly)).toBe(true);
    expect(isClawhubUploadTicketError(new Error('Version 1.92.48 already exists'))).toBe(false);
  });

  test('only all-in-one supports upload-ticket retry', () => {
    expect(supportsClawhubUploadTicketRetry({ targetKey: 'all-in-one' })).toBe(true);
    expect(supportsClawhubUploadTicketRetry({ targetKey: 'web-development' })).toBe(false);
  });

  test('formats upload-ticket exhaustion with attempt count and issue hint', () => {
    const message = formatClawhubUploadTicketFailure(
      { targetKey: 'all-in-one', registrySlug: 'cloudbase' },
      new Error('Skill upload ticket does not match this publish'),
      3,
    );

    expect(message).toContain('after 3 attempt(s)');
    expect(message).toContain('all-in-one');
    expect(message).toContain('cloudbase');
    expect(message).toContain('openclaw/clawhub#3394');
    expect(message).toContain('Skill upload ticket does not match this publish');
  });
});

describe('publish-to-clawhub all-in-one upload-ticket retry', () => {
  test('retries all-in-one on upload-ticket mismatch then succeeds', () => {
    const previousToken = process.env.CLAWDHUB_TOKEN;
    process.env.CLAWDHUB_TOKEN = 'test-token';

    try {
      const manifestPath = createManifest([
        { targetKey: 'all-in-one', registrySlug: 'cloudbase' },
      ]);
      let calls = 0;
      const sleepCalls = [];

      const results = publishToClawhub({
        manifestPath,
        changelog: 'retry test',
        runPublish: () => {
          calls += 1;
          if (calls < 2) {
            const error = new Error('Skill upload ticket does not match this publish');
            error.stderr = 'Skill upload ticket does not match this publish\n';
            throw error;
          }
          return { status: 'ok', output: '' };
        },
        sleepMs: (ms) => {
          sleepCalls.push(ms);
        },
      });

      expect(calls).toBe(2);
      expect(sleepCalls).toEqual([2000]);
      expect(results).toEqual([
        {
          targetKey: 'all-in-one',
          registrySlug: 'cloudbase',
          status: 'published',
          attempts: 2,
        },
      ]);
    } finally {
      if (previousToken === undefined) {
        delete process.env.CLAWDHUB_TOKEN;
      } else {
        process.env.CLAWDHUB_TOKEN = previousToken;
      }
    }
  });

  test('exhausts all-in-one upload-ticket retries with clear failure message', () => {
    const previousToken = process.env.CLAWDHUB_TOKEN;
    process.env.CLAWDHUB_TOKEN = 'test-token';

    try {
      const manifestPath = createManifest([
        { targetKey: 'all-in-one', registrySlug: 'cloudbase' },
      ]);
      let calls = 0;

      expect(() =>
        publishToClawhub({
          manifestPath,
          changelog: 'retry exhaust',
          runPublish: () => {
            calls += 1;
            const error = new Error('Skill upload ticket does not match this publish');
            error.stderr = 'Skill upload ticket does not match this publish\n';
            throw error;
          },
          sleepMs: () => {},
        }),
      ).toThrow(/Failed to publish 1 target/);

      expect(calls).toBe(ALL_IN_ONE_UPLOAD_TICKET_MAX_ATTEMPTS);
    } finally {
      if (previousToken === undefined) {
        delete process.env.CLAWDHUB_TOKEN;
      } else {
        process.env.CLAWDHUB_TOKEN = previousToken;
      }
    }
  });

  test('does not retry upload-ticket errors for non all-in-one targets', () => {
    const previousToken = process.env.CLAWDHUB_TOKEN;
    process.env.CLAWDHUB_TOKEN = 'test-token';

    try {
      const manifestPath = createManifest([
        { targetKey: 'web-development', registrySlug: 'cloudbase-web-development' },
      ]);
      let calls = 0;

      expect(() =>
        publishToClawhub({
          manifestPath,
          changelog: 'no retry',
          runPublish: () => {
            calls += 1;
            throw new Error('Skill upload ticket does not match this publish');
          },
          sleepMs: () => {
            throw new Error('sleep should not be called');
          },
        }),
      ).toThrow(/Failed to publish 1 target/);

      expect(calls).toBe(1);
    } finally {
      if (previousToken === undefined) {
        delete process.env.CLAWDHUB_TOKEN;
      } else {
        process.env.CLAWDHUB_TOKEN = previousToken;
      }
    }
  });
});
