import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  classifySkillhubUploadError,
  formatSkillhubUploadError,
  isSkillhubAlreadyPublishedError,
  isSkillhubNetworkRetryError,
  isSkillhubVersionConflictError,
  publishToSkillhub,
  resolvePublishVersion,
  selectMarketplaceMetadata,
} from '../scripts/publish-to-skillhub.mjs';

const tempDirs = [];

function createSkillManifest(targets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillhub-publish-test-'));
  tempDirs.push(dir);

  const resolved = targets.map((target) => {
    const artifactDir = path.join(dir, target.targetKey);
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, 'SKILL.md'),
      [
        '---',
        `name: ${target.registrySlug}`,
        'description: test skill',
        `version: ${target.version || '1.0.0'}`,
        '---',
        '',
        '# Test',
        '',
      ].join('\n'),
      'utf8',
    );
    return {
      ...target,
      artifactDir,
    };
  });

  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ targets: resolved }));
  return manifestPath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('selectMarketplaceMetadata', () => {
  test('uses curated displayName / summary / iconUrl from manifest target', () => {
    const result = selectMarketplaceMetadata(
      {
        displayName: '腾讯云 CloudBase / Tencent CloudBase',
        summary: '腾讯云 CloudBase 是面向 AI Coding 的后端一体化平台。',
        iconUrl: 'https://raw.githubusercontent.com/TencentCloudBase/cloudbase-plugin/main/assets/logo-dark.png',
      },
      {
        name: 'cloudbase',
        description:
          'Use this skill when you develop, design, build, deploy, debug, migrate, or troubleshoot CloudBase (腾讯云开发)...',
      },
    );

    expect(result).toEqual({
      displayName: '腾讯云 CloudBase / Tencent CloudBase',
      summary: '腾讯云 CloudBase 是面向 AI Coding 的后端一体化平台。',
      iconUrl:
        'https://raw.githubusercontent.com/TencentCloudBase/cloudbase-plugin/main/assets/logo-dark.png',
    });
  });

  test('falls back to SKILL.md frontmatter when manifest target lacks curated values', () => {
    // If a future target forgets to set curated values, we still publish
    // something usable instead of dropping the skill from the marketplace.
    const result = selectMarketplaceMetadata(
      {},
      { name: 'miniprogram-development', description: 'WeChat Mini Program skill' },
    );

    expect(result.displayName).toBe('miniprogram-development');
    expect(result.summary).toBe('WeChat Mini Program skill');
    expect(result.iconUrl).toBe('');
  });

  test('returns empty strings when both target and frontmatter are missing', () => {
    const result = selectMarketplaceMetadata(undefined, undefined);

    expect(result).toEqual({ displayName: '', summary: '', iconUrl: '' });
  });

  test('prefers target.displayName over the raw `cloudbase` slug in SKILL.md', () => {
    // Regression: SkillHub previously rendered the raw SKILL.md `name` slug
    // (e.g. "cloudbase") on the card. Curated displayName must win so the
    // skill shows up as "腾讯云 CloudBase / Tencent CloudBase".
    const result = selectMarketplaceMetadata(
      { displayName: '腾讯云 CloudBase / Tencent CloudBase' },
      { name: 'cloudbase', description: 'raw English trigger description' },
    );

    expect(result.displayName).toBe('腾讯云 CloudBase / Tencent CloudBase');
    expect(result.displayName).not.toBe('cloudbase');
  });

  test('prefers target.summary over the long English SKILL.md description', () => {
    // The SKILL.md description is a long English agent-trigger paragraph
    // (full of keywords like "CloudBase", "腾讯云开发", "generateText"). The
    // curated summary is the short Tencent-docs-style blurb that should show
    // on the SkillHub card instead.
    const longEnglish =
      'Use this skill when you develop, design, build, deploy, debug, migrate, or troubleshoot CloudBase (腾讯云开发, 云开发, TCB, 微信云开发) projects. Covers Web, 微信小程序...';
    const shortChinese = '腾讯云 CloudBase 是面向 AI Coding 的后端一体化平台。';

    const result = selectMarketplaceMetadata(
      { summary: shortChinese },
      { name: 'cloudbase', description: longEnglish },
    );

    expect(result.summary).toBe(shortChinese);
    expect(result.summary).not.toMatch(/Use this skill when/);
  });
});

describe('resolvePublishVersion', () => {
  test('publishes local version when SkillHub is empty', () => {
    expect(resolvePublishVersion('1.2.3', [])).toEqual({
      action: 'publish',
      version: '1.2.3',
      reason: 'SkillHub empty, use local SKILL.md',
    });
  });

  test('skips when local version is not newer than SkillHub', () => {
    const result = resolvePublishVersion('1.2.3', ['1.2.3', '1.2.2']);
    expect(result.action).toBe('skip');
    expect(result.reason).toContain('<= SkillHub highest 1.2.3');
  });

  test('publishes when local version is strictly newer', () => {
    const result = resolvePublishVersion('1.3.0', ['1.2.9']);
    expect(result.action).toBe('publish');
    expect(result.version).toBe('1.3.0');
  });
});

describe('classifySkillhubUploadError', () => {
  test('treats version-already-exists / 409 as already-published', () => {
    expect(
      classifySkillhubUploadError(
        new Error('SkillHub API error (409): version already exists'),
      ),
    ).toBe('already-published');
    expect(
      isSkillhubAlreadyPublishedError(
        new Error('SkillHub API error (409): 版本号已存在'),
      ),
    ).toBe(true);
    expect(classifySkillhubUploadError(new Error('SkillHub API error (409): conflict'))).toBe(
      'already-published',
    );
  });

  test('treats must-be-higher 400 as version-conflict-retry', () => {
    expect(
      classifySkillhubUploadError(
        new Error('SkillHub API error (400): 版本号必须高于当前最新版本'),
      ),
    ).toBe('version-conflict-retry');
    expect(
      isSkillhubVersionConflictError(
        new Error('SkillHub API error (400): version must be higher than latest'),
      ),
    ).toBe(true);
  });

  test('does not treat unrelated 400 as version conflict', () => {
    expect(
      classifySkillhubUploadError(
        new Error('SkillHub API error (400): invalid payload: missing files'),
      ),
    ).toBe('fatal');
  });

  test('treats gateway / connection failures as network-retry', () => {
    const fetchFailed = new TypeError('fetch failed');
    fetchFailed.cause = new Error('HTTP/2 stream 1 was not closed cleanly: INTERNAL_ERROR');
    expect(classifySkillhubUploadError(fetchFailed)).toBe('network-retry');
    expect(isSkillhubNetworkRetryError(fetchFailed)).toBe(true);
    expect(
      classifySkillhubUploadError(
        new Error('SkillHub API error (522): Connection Timeout with Origin Server'),
      ),
    ).toBe('network-retry');
    expect(
      classifySkillhubUploadError(new Error('SkillHub API error (503): service unavailable')),
    ).toBe('network-retry');
  });

  test('keeps auth and payload errors fatal', () => {
    expect(
      classifySkillhubUploadError(new Error('SkillHub API error (401): invalid token')),
    ).toBe('fatal');
    expect(
      classifySkillhubUploadError(new Error('SkillHub API error (413): payload too large')),
    ).toBe('fatal');
  });
});

describe('formatSkillhubUploadError', () => {
  test('includes the nested cause so CI logs show the real reason', () => {
    const error = new TypeError('fetch failed');
    error.cause = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    const detail = formatSkillhubUploadError(error);
    expect(detail).toContain('fetch failed');
    expect(detail).toContain('ECONNRESET');
    expect(detail).toContain('connection reset');
  });
});

describe('publishToSkillhub idempotency', () => {
  test('treats already-published upload errors as success without bumping', async () => {
    const previousOrg = process.env.SKILLHUB_ORG_ID;
    const previousToken = process.env.SKILLHUB_API_TOKEN;
    process.env.SKILLHUB_ORG_ID = 'org-test';
    process.env.SKILLHUB_API_TOKEN = 'token-test';

    try {
      const manifestPath = createSkillManifest([
        { targetKey: 'web-development', registrySlug: 'web-development', version: '2.0.0' },
      ]);
      const uploadCalls = [];

      const results = await publishToSkillhub({
        manifestPath,
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ versions: [{ version: '1.9.0' }] }),
        }),
        uploadVersion: async (args) => {
          uploadCalls.push(args.version);
          throw new Error('SkillHub API error (409): version already exists');
        },
      });

      expect(uploadCalls).toEqual(['2.0.0']);
      expect(results).toEqual([
        expect.objectContaining({
          targetKey: 'web-development',
          slug: 'web-development',
          version: '2.0.0',
          status: 'already-published',
        }),
      ]);
    } finally {
      if (previousOrg === undefined) delete process.env.SKILLHUB_ORG_ID;
      else process.env.SKILLHUB_ORG_ID = previousOrg;
      if (previousToken === undefined) delete process.env.SKILLHUB_API_TOKEN;
      else process.env.SKILLHUB_API_TOKEN = previousToken;
    }
  });

  test('bumps and retries only on must-be-higher conflicts', async () => {
    const previousOrg = process.env.SKILLHUB_ORG_ID;
    const previousToken = process.env.SKILLHUB_API_TOKEN;
    process.env.SKILLHUB_ORG_ID = 'org-test';
    process.env.SKILLHUB_API_TOKEN = 'token-test';

    try {
      const manifestPath = createSkillManifest([
        { targetKey: 'web-development', registrySlug: 'web-development', version: '2.0.0' },
      ]);
      const uploadCalls = [];

      const results = await publishToSkillhub({
        manifestPath,
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ versions: [{ version: '1.9.0' }] }),
        }),
        uploadVersion: async (args) => {
          uploadCalls.push(args.version);
          if (uploadCalls.length === 1) {
            throw new Error('SkillHub API error (400): 版本号必须高于当前最新版本');
          }
          return { versionId: 'vid-1' };
        },
      });

      expect(uploadCalls[0]).toBe('2.0.0');
      expect(uploadCalls[1]).toBe('2.0.1-beta.1');
      expect(results[0].status).toBe('published');
      expect(results[0].version).toBe('2.0.1-beta.1');
    } finally {
      if (previousOrg === undefined) delete process.env.SKILLHUB_ORG_ID;
      else process.env.SKILLHUB_ORG_ID = previousOrg;
      if (previousToken === undefined) delete process.env.SKILLHUB_API_TOKEN;
      else process.env.SKILLHUB_API_TOKEN = previousToken;
    }
  });
});

describe('publishToSkillhub network retries', () => {
  function withCredentials(run) {
    const previousOrg = process.env.SKILLHUB_ORG_ID;
    const previousToken = process.env.SKILLHUB_API_TOKEN;
    process.env.SKILLHUB_ORG_ID = 'org-test';
    process.env.SKILLHUB_API_TOKEN = 'token-test';
    return Promise.resolve()
      .then(run)
      .finally(() => {
        if (previousOrg === undefined) delete process.env.SKILLHUB_ORG_ID;
        else process.env.SKILLHUB_ORG_ID = previousOrg;
        if (previousToken === undefined) delete process.env.SKILLHUB_API_TOKEN;
        else process.env.SKILLHUB_API_TOKEN = previousToken;
      });
  }

  const versionsResponse = {
    ok: true,
    json: async () => ({ versions: [{ version: '1.9.0' }] }),
  };

  test('retries a transient network error and publishes on the next attempt', async () => {
    await withCredentials(async () => {
      const manifestPath = createSkillManifest([
        { targetKey: 'web-development', registrySlug: 'web-development', version: '2.0.0' },
      ]);
      let calls = 0;

      const results = await publishToSkillhub({
        manifestPath,
        fetchImpl: async () => versionsResponse,
        networkRetryDelayMs: 0,
        uploadVersion: async () => {
          calls += 1;
          if (calls === 1) {
            const error = new TypeError('fetch failed');
            error.cause = new Error('ECONNRESET');
            throw error;
          }
          return { versionId: 'vid-2' };
        },
      });

      expect(calls).toBe(2);
      expect(results[0].status).toBe('published');
    });
  });

  test('stops after the bounded retry count and reports the underlying cause', async () => {
    await withCredentials(async () => {
      const manifestPath = createSkillManifest([
        { targetKey: 'all-in-one', registrySlug: 'cloudbase', version: '2.0.0' },
      ]);
      let calls = 0;

      await expect(
        publishToSkillhub({
          manifestPath,
          fetchImpl: async () => versionsResponse,
          networkRetryDelayMs: 0,
          maxNetworkRetries: 2,
          uploadVersion: async () => {
            calls += 1;
            const error = new TypeError('fetch failed');
            error.cause = new Error('HTTP/2 INTERNAL_ERROR');
            throw error;
          },
        }),
      ).rejects.toMatchObject({
        failures: [
          expect.objectContaining({
            targetKey: 'all-in-one',
            message: expect.stringContaining('HTTP/2 INTERNAL_ERROR'),
          }),
        ],
      });

      expect(calls).toBe(3);
    });
  });

  test('does not retry a deterministic payload error', async () => {
    await withCredentials(async () => {
      const manifestPath = createSkillManifest([
        { targetKey: 'all-in-one', registrySlug: 'cloudbase', version: '2.0.0' },
      ]);
      let calls = 0;

      await expect(
        publishToSkillhub({
          manifestPath,
          fetchImpl: async () => versionsResponse,
          networkRetryDelayMs: 0,
          uploadVersion: async () => {
            calls += 1;
            throw new Error('SkillHub API error (413): payload too large');
          },
        }),
      ).rejects.toMatchObject({
        failures: [expect.objectContaining({ targetKey: 'all-in-one' })],
      });

      expect(calls).toBe(1);
    });
  });
});
