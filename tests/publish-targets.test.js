import { expect, test } from 'vitest';
import {
  CLAWHUB_PUBLISH_TARGETS,
  MAX_TOPICS,
  MAX_TOPIC_LENGTH,
  RESERVED_TOPICS,
  normalizeTopic,
  parseTargetInput,
  resolvePublishTargets,
  validateTargets,
} from '../scripts/clawhub-publish-targets.mjs';

test('parseTargetInput accepts explicit target list and de-duplicates order-preservingly', () => {
  expect(
    parseTargetInput(
      'miniprogram-development, cloudbase-wechat-integration, web-development, all-in-one, web-development',
    ),
  ).toEqual([
    'miniprogram-development',
    'cloudbase-wechat-integration',
    'web-development',
    'all-in-one',
  ]);
});

test('parseTargetInput rejects unknown publish targets', () => {
  expect(() => parseTargetInput('auth-web-cloudbase')).toThrow(/Unknown publish targets/);
});

test('resolvePublishTargets only returns whitelisted publish units', () => {
  const targets = resolvePublishTargets(
    'miniprogram-development,cloudbase-wechat-integration,all-in-one,ui-design,web-development,spec-workflow',
  );

  expect(targets.map((target) => target.key)).toEqual([
    'miniprogram-development',
    'cloudbase-wechat-integration',
    'all-in-one',
    'ui-design',
    'web-development',
    'spec-workflow',
  ]);
  expect(Object.keys(CLAWHUB_PUBLISH_TARGETS)).toEqual([
    'miniprogram-development',
    'cloudbase-wechat-integration',
    'all-in-one',
    'ui-design',
    'web-development',
    'spec-workflow',
  ]);
  expect(
    targets.find((target) => target.key === 'cloudbase-wechat-integration')?.registrySlug,
  ).toBe('cloudbase-wechat-integration');
  expect(targets.find((target) => target.key === 'ui-design')?.registrySlug).toBe(
    'ui-design-guide',
  );
  expect(
    targets.find((target) => target.key === 'spec-workflow')?.registrySlug,
  ).toBe('spec-workflow-guide');
});

test('every target exposes SkillHub marketplace metadata (displayName, summary, iconUrl)', () => {
  // SkillHub / ClawHub marketplace cards need a Chinese product name
  // (displayName), a short Tencent-docs-style summary, and the black-bg
  // CloudBase logo. Without these the cards fall back to the raw SKILL.md
  // `name` slug (e.g. "cloudbase") and the English agent-trigger description.
  for (const target of Object.values(CLAWHUB_PUBLISH_TARGETS)) {
    expect(target.displayName, `${target.key} missing displayName`).toBeTruthy();
    expect(target.summary, `${target.key} missing summary`).toBeTruthy();
    expect(target.iconUrl, `${target.key} missing iconUrl`).toBeTruthy();
    expect(target.iconUrl, `${target.key} iconUrl should point to the black-bg logo`).toMatch(
      /logo-dark\.png$/,
    );
  }
});

test('displayName follows the documented「中文能力名 · English」shape and never falls back to the slug', () => {
  // ClawHub search only matches displayName (summary / description are not
  // indexed), so a skill published without `--name` shows up as its raw slug and
  // becomes unfindable by Chinese keywords. Pin the curated shape here so the
  // fallback cannot silently come back.
  for (const target of Object.values(CLAWHUB_PUBLISH_TARGETS)) {
    expect(target.displayName, `${target.key} should not be the slug`).not.toBe(
      target.registrySlug,
    );
    expect(target.displayName, `${target.key} should use the " · " separator`).toContain(' · ');
    expect(target.displayName, `${target.key} should keep a Chinese capability name`).toMatch(
      /[\u4e00-\u9fff]/,
    );
    expect(target.displayName, `${target.key} should keep an English name`).toMatch(/[A-Za-z]/);
  }
});

test('every target carries topics within the registry limits', () => {
  // https://docs.openclaw.ai/clawhub/publishing — at most 5 topics per skill,
  // each at most 48 characters, none of the reserved names.
  const reserved = new Set(RESERVED_TOPICS);

  for (const target of Object.values(CLAWHUB_PUBLISH_TARGETS)) {
    expect(target.topics, `${target.key} missing topics`).toBeTruthy();

    const normalized = [...new Set((target.topics ?? []).map(normalizeTopic).filter(Boolean))];
    expect(normalized.length, `${target.key} exceeds ${MAX_TOPICS} topics`).toBeLessThanOrEqual(
      MAX_TOPICS,
    );
    expect(normalized.length, `${target.key} should carry at least one topic`).toBeGreaterThan(0);

    for (const topic of normalized) {
      expect(topic.length, `${target.key} topic too long`).toBeLessThanOrEqual(MAX_TOPIC_LENGTH);
      expect(reserved.has(topic), `${target.key} uses reserved topic "${topic}"`).toBe(false);
    }
  }
});

test('validateTargets reports out-of-spec topics instead of throwing at the call site', () => {
  expect(validateTargets(CLAWHUB_PUBLISH_TARGETS)).toEqual([]);

  const tooMany = validateTargets({
    demo: { key: 'demo', topics: ['a', 'b', 'c', 'd', 'e', 'f'] },
  });
  expect(tooMany.join('\n')).toMatch(/6 个 topics 超过上限 5/);

  const reserved = validateTargets({
    demo: { key: 'demo', topics: ['Official'] },
  });
  expect(reserved.join('\n')).toMatch(/保留词/);

  const tooLong = validateTargets({
    demo: { key: 'demo', topics: ['x'.repeat(MAX_TOPIC_LENGTH + 1)] },
  });
  expect(tooLong.join('\n')).toMatch(/超过上限 48/);
});

test('normalizeTopic mirrors the registry normalization (lowercase, spaces to hyphens)', () => {
  // "The check runs on the normalized form, so `Official` and `staff pick` are
  // rejected too."
  expect(normalizeTopic('Git Worktree')).toBe('git-worktree');
  expect(normalizeTopic('  Official ')).toBe('official');
  expect(normalizeTopic('staff pick')).toBe('staff-pick');
  expect(normalizeTopic(null)).toBe('');
});

test('all-in-one displayName matches the official Tencent CloudBase product name', () => {
  // SkillHub shows the displayName verbatim on the skill card. To match the
  // product name on docs.cloudbase.net (腾讯云 CloudBase) instead of the raw
  // `cloudbase` slug, all-in-one must use the bilingual product name.
  const allInOne = CLAWHUB_PUBLISH_TARGETS['all-in-one'];
  expect(allInOne.displayName).toBe('腾讯云 CloudBase · Tencent CloudBase');
  expect(allInOne.summary).toMatch(/后端一体化平台/);
  expect(allInOne.summary).toMatch(/数据库|云函数|云存储|身份认证/);
});
