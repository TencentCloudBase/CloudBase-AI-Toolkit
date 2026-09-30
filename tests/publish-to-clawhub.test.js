import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ALL_IN_ONE_UPLOAD_TICKET_MAX_ATTEMPTS,
  DEFAULT_UPLOAD_TICKET_MAX_ATTEMPTS,
  buildPublishCommand,
  clawhubUploadTicketMaxAttempts,
  formatClawhubUploadTicketFailure,
  isClawhubAlreadyPublishedOutput,
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

  test('omits --owner when neither the target nor the options set one', () => {
    const command = buildPublishCommand(
      { artifactDir: '/tmp/artifact/skills/cloudbase', registrySlug: 'cloudbase' },
      { tags: 'latest', changelog: 'x', owner: '' },
    );

    expect(command.args).not.toContain('--owner');
    expect(command.args[command.args.indexOf('--slug') + 1]).toBe('cloudbase');
  });

  test('passes --owner through without changing the registry slug', () => {
    const command = buildPublishCommand(
      { artifactDir: '/tmp/artifact/skills/cloudbase', registrySlug: 'cloudbase' },
      { tags: 'latest', changelog: 'x', owner: 'example-org' },
    );

    expect(command.args[command.args.indexOf('--owner') + 1]).toBe('example-org');
    // 换主体不能改 slug：已发布条目的持续更新必须落在同一个 slug 上
    expect(command.args[command.args.indexOf('--slug') + 1]).toBe('cloudbase');
  });

  test('lets a target-level owner override the --owner default', () => {
    const command = buildPublishCommand(
      {
        artifactDir: '/tmp/artifact/skills/web-development',
        registrySlug: 'web-development',
        owner: 'target-org',
      },
      { tags: 'latest', changelog: 'x', owner: 'cli-default-org' },
    );

    expect(command.args.filter((arg) => arg === '--owner')).toHaveLength(1);
    expect(command.args[command.args.indexOf('--owner') + 1]).toBe('target-org');
  });

  test('passes --name from the target displayName (ClawHub 的检索面只有它)', () => {
    const command = buildPublishCommand(
      {
        artifactDir: '/tmp/artifact/skills/miniprogram-development',
        registrySlug: 'miniprogram-development',
        displayName: '微信小程序开发 · WeChat Mini Program Development',
      },
      { tags: 'latest', changelog: 'x' },
    );

    expect(command.args[command.args.indexOf('--name') + 1]).toBe(
      '微信小程序开发 · WeChat Mini Program Development',
    );
    // 名字（--name）不能顶掉 slug 身份
    expect(command.args[command.args.indexOf('--slug') + 1]).toBe('miniprogram-development');
  });

  test('omits --name when the target has no displayName', () => {
    const command = buildPublishCommand(
      { artifactDir: '/tmp/artifact/skills/cloudbase', registrySlug: 'cloudbase' },
      { tags: 'latest', changelog: 'x' },
    );

    expect(command.args).not.toContain('--name');
  });

  test('passes --topics as a comma-separated list and drops empty entries', () => {
    const command = buildPublishCommand(
      {
        artifactDir: '/tmp/artifact/skills/web-development',
        registrySlug: 'web-development',
        topics: ['cloudbase', '腾讯云开发', '', '   '],
      },
      { tags: 'latest', changelog: 'x' },
    );

    expect(command.args[command.args.indexOf('--topics') + 1]).toBe('cloudbase,腾讯云开发');
  });

  test('omits --topics when the target has none', () => {
    const command = buildPublishCommand(
      { artifactDir: '/tmp/artifact/skills/cloudbase', registrySlug: 'cloudbase' },
      { tags: 'latest', changelog: 'x' },
    );

    expect(command.args).not.toContain('--topics');
  });

  test('threads --owner through publishToClawhub into the actual publish command', () => {
    const manifestPath = createManifest([
      { targetKey: 'web-development', registrySlug: 'web-development' },
    ]);
    const publishCalls = [];
    const previousToken = process.env.CLAWDHUB_TOKEN;
    process.env.CLAWDHUB_TOKEN = 'test-token';

    try {
      publishToClawhub({
        manifestPath,
        owner: 'example-org',
        runPublish: (_command, args) => {
          publishCalls.push(args);
          return { status: 'ok', output: 'OK. web-development@1.0.0 published\n' };
        },
        sleepMs: () => {},
      });
    } finally {
      if (previousToken === undefined) {
        delete process.env.CLAWDHUB_TOKEN;
      } else {
        process.env.CLAWDHUB_TOKEN = previousToken;
      }
    }

    expect(publishCalls).toHaveLength(1);
    expect(publishCalls[0][publishCalls[0].indexOf('--owner') + 1]).toBe('example-org');
    expect(publishCalls[0][publishCalls[0].indexOf('--slug') + 1]).toBe('web-development');
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

  // Fingerprint version-already-exists from Actions run 30897797886 (main@95a75f82):
  // CLI printed the Version line, but failure aggregation only kept "Command failed: ...".
  test('detects version-already-exists from Actions run 30897797886 log shape', () => {
    const error = new Error(
      'Command failed: clawhub skill publish /home/runner/work/CloudBase-AI-Toolkit/CloudBase-AI-Toolkit/.clawhub-publish-output/web-development/skills/web-development --slug web-development --changelog Recent commits --tags latest',
    );
    error.stderr = [
      'Version 1.27.25 already exists. Increment the version number and try again.',
      '    at handler (../../convex/skills.ts:13078:8)',
      '    at async handler (../../node_modules/convex-helpers/server/customFunctions.js:268:27) (reset in 42s)',
      'Error: Version 1.27.25 already exists. Increment the version number and try again.',
      '    at handler (../../convex/skills.ts:13078:8)',
      '    at async handler (../../node_modules/convex-helpers/server/customFunctions.js:268:27) (reset in 42s)',
      '',
    ].join('\n');
    expect(isClawhubVersionExistsError(error)).toBe(true);
  });

  test('detects OK already-published messages as idempotent', () => {
    const error = new Error('Command failed: clawhub skill publish ...');
    error.stdout = 'OK. cloudbase@1.92.48 is already published\n';
    expect(isClawhubVersionExistsError(error)).toBe(true);
    expect(isClawhubAlreadyPublishedOutput('OK. cloudbase@1.92.48 is already published\n')).toBe(true);
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

  test('all targets support upload-ticket retry; all-in-one gets more attempts', () => {
    expect(supportsClawhubUploadTicketRetry({ targetKey: 'all-in-one' })).toBe(true);
    expect(supportsClawhubUploadTicketRetry({ targetKey: 'web-development' })).toBe(true);
    expect(clawhubUploadTicketMaxAttempts({ targetKey: 'all-in-one' })).toBe(
      ALL_IN_ONE_UPLOAD_TICKET_MAX_ATTEMPTS,
    );
    expect(clawhubUploadTicketMaxAttempts({ targetKey: 'web-development' })).toBe(
      DEFAULT_UPLOAD_TICKET_MAX_ATTEMPTS,
    );
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

describe('publish-to-clawhub version-exists idempotency', () => {
  test('treats stderr-only Version already exists as already-published and continues', () => {
    const previousToken = process.env.CLAWDHUB_TOKEN;
    process.env.CLAWDHUB_TOKEN = 'test-token';

    try {
      const manifestPath = createManifest([
        { targetKey: 'all-in-one', registrySlug: 'cloudbase' },
        { targetKey: 'web-development', registrySlug: 'web-development' },
      ]);
      const publishCalls = [];

      const results = publishToClawhub({
        manifestPath,
        changelog: 'idempotency regression',
        runPublish: (_command, args) => {
          publishCalls.push(args);
          const slugIndex = args.indexOf('--slug');
          const slug = slugIndex >= 0 ? args[slugIndex + 1] : '';
          if (slug === 'cloudbase') {
            // Mimic CI: Command failed message has no Version text; stderr does.
            const error = new Error(
              'Command failed: clawhub skill publish /tmp/artifact/skills/cloudbase --slug cloudbase',
            );
            error.stderr =
              'Error: Version 1.92.48 already exists. Increment the version number and try again. (reset in 44s)\n';
            throw error;
          }
          return { status: 'ok', output: 'OK. web-development@1.0.0 published\n' };
        },
        sleepMs: () => {
          throw new Error('sleep should not be called for version-exists');
        },
      });

      expect(publishCalls).toHaveLength(2);
      expect(results).toEqual([
        {
          targetKey: 'all-in-one',
          registrySlug: 'cloudbase',
          status: 'already-published',
          attempts: 1,
        },
        {
          targetKey: 'web-development',
          registrySlug: 'web-development',
          status: 'published',
          attempts: 1,
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

  test('classifies exit-0 already-published stdout as already-published', () => {
    const previousToken = process.env.CLAWDHUB_TOKEN;
    process.env.CLAWDHUB_TOKEN = 'test-token';

    try {
      const manifestPath = createManifest([
        { targetKey: 'web-development', registrySlug: 'web-development' },
      ]);

      const results = publishToClawhub({
        manifestPath,
        runPublish: () => ({
          status: 'ok',
          output: 'OK. web-development@1.27.30 is already published\n',
        }),
      });

      expect(results).toEqual([
        {
          targetKey: 'web-development',
          registrySlug: 'web-development',
          status: 'already-published',
          attempts: 1,
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

  // Actions run 30893435418 (main@a9444bef): ATO fingerprinted already-published, but the
  // job-killing error was all-in-one upload-ticket under stdio inherit (no retry). Peers
  // printed "OK. … is already published" with exit 0 and were not the failure cause.
  test('run 30893435418: peers already-published + all-in-one upload-ticket retries to success', () => {
    const previousToken = process.env.CLAWDHUB_TOKEN;
    process.env.CLAWDHUB_TOKEN = 'test-token';

    try {
      const manifestPath = createManifest([
        { targetKey: 'miniprogram-development', registrySlug: 'miniprogram-development' },
        { targetKey: 'cloudbase-wechat-integration', registrySlug: 'cloudbase-wechat-integration' },
        { targetKey: 'all-in-one', registrySlug: 'cloudbase' },
        { targetKey: 'ui-design', registrySlug: 'ui-design-guide' },
        { targetKey: 'web-development', registrySlug: 'web-development' },
        { targetKey: 'spec-workflow', registrySlug: 'spec-workflow-guide' },
      ]);
      const alreadyPublished = {
        'miniprogram-development': '1.28.21',
        'cloudbase-wechat-integration': '1.2.21',
        'ui-design-guide': '1.18.21',
        'web-development': '1.27.24',
        'spec-workflow-guide': '1.18.21',
      };
      let allInOneCalls = 0;

      const results = publishToClawhub({
        manifestPath,
        changelog: 'Actions run 30893435418 regression',
        runPublish: (_command, args) => {
          const slug = args[args.indexOf('--slug') + 1];
          if (slug === 'cloudbase') {
            allInOneCalls += 1;
            if (allInOneCalls === 1) {
              // Mimic CI: inherit left only "Command failed"; stderr held upload-ticket.
              const error = new Error(
                'Command failed: clawhub skill publish /home/runner/work/CloudBase-AI-Toolkit/CloudBase-AI-Toolkit/.clawhub-publish-output/all-in-one/skills/cloudbase --slug cloudbase',
              );
              error.stderr = [
                'Uncaught Error: Uploaded file does not match its skill upload ticket',
                '    at handler (../../convex/skillPublishUploads.ts:109:14)',
                'Error: Uncaught Error: Uploaded file does not match its skill upload ticket',
                '',
              ].join('\n');
              throw error;
            }
            return { status: 'ok', output: 'OK. cloudbase@1.92.48 published\n' };
          }
          const version = alreadyPublished[slug];
          return {
            status: 'ok',
            output: `OK. ${slug}@${version} is already published\n`,
          };
        },
        sleepMs: () => {},
      });

      expect(allInOneCalls).toBe(2);
      expect(results).toEqual([
        {
          targetKey: 'miniprogram-development',
          registrySlug: 'miniprogram-development',
          status: 'already-published',
          attempts: 1,
        },
        {
          targetKey: 'cloudbase-wechat-integration',
          registrySlug: 'cloudbase-wechat-integration',
          status: 'already-published',
          attempts: 1,
        },
        {
          targetKey: 'all-in-one',
          registrySlug: 'cloudbase',
          status: 'published',
          attempts: 2,
        },
        {
          targetKey: 'ui-design',
          registrySlug: 'ui-design-guide',
          status: 'already-published',
          attempts: 1,
        },
        {
          targetKey: 'web-development',
          registrySlug: 'web-development',
          status: 'already-published',
          attempts: 1,
        },
        {
          targetKey: 'spec-workflow',
          registrySlug: 'spec-workflow-guide',
          status: 'already-published',
          attempts: 1,
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
});

describe('publish-to-clawhub upload-ticket retry', () => {
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

  test('retries upload-ticket errors for non all-in-one targets with default attempts', () => {
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
          changelog: 'retry small skill',
          runPublish: () => {
            calls += 1;
            throw new Error('Uploaded file does not match its skill upload ticket');
          },
          sleepMs: () => {},
        }),
      ).toThrow(/Failed to publish 1 target/);

      expect(calls).toBe(DEFAULT_UPLOAD_TICKET_MAX_ATTEMPTS);
    } finally {
      if (previousToken === undefined) {
        delete process.env.CLAWDHUB_TOKEN;
      } else {
        process.env.CLAWDHUB_TOKEN = previousToken;
      }
    }
  });

  test('retries every target when all hit Uploaded file does not match its skill upload ticket', () => {
    // Regression for Actions run 30894334622: clawhub@latest systemic upload-ticket
    // failure hit all six publish targets (not only all-in-one).
    const previousToken = process.env.CLAWDHUB_TOKEN;
    process.env.CLAWDHUB_TOKEN = 'test-token';

    try {
      const targets = [
        { targetKey: 'miniprogram-development', registrySlug: 'miniprogram-development' },
        { targetKey: 'cloudbase-wechat-integration', registrySlug: 'cloudbase-wechat-integration' },
        { targetKey: 'all-in-one', registrySlug: 'cloudbase' },
        { targetKey: 'ui-design', registrySlug: 'ui-design-guide' },
        { targetKey: 'web-development', registrySlug: 'web-development' },
        { targetKey: 'spec-workflow', registrySlug: 'spec-workflow-guide' },
      ];
      const manifestPath = createManifest(targets);
      const callsBySlug = Object.fromEntries(targets.map((t) => [t.registrySlug, 0]));

      expect(() =>
        publishToClawhub({
          manifestPath,
          changelog: 'multi-target upload-ticket regression',
          runPublish: (_command, args) => {
            const slug = args[args.indexOf('--slug') + 1];
            callsBySlug[slug] += 1;
            const error = new Error(
              'Command failed: clawhub skill publish ...',
            );
            error.stderr =
              'Uncaught Error: Uploaded file does not match its skill upload ticket\n';
            throw error;
          },
          sleepMs: () => {},
        }),
      ).toThrow(/Failed to publish 6 target/);

      expect(callsBySlug.cloudbase).toBe(ALL_IN_ONE_UPLOAD_TICKET_MAX_ATTEMPTS);
      for (const target of targets) {
        if (target.targetKey === 'all-in-one') {
          continue;
        }
        expect(callsBySlug[target.registrySlug]).toBe(DEFAULT_UPLOAD_TICKET_MAX_ATTEMPTS);
      }
    } finally {
      if (previousToken === undefined) {
        delete process.env.CLAWDHUB_TOKEN;
      } else {
        process.env.CLAWDHUB_TOKEN = previousToken;
      }
    }
  });
});
