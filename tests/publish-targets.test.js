import { expect, test } from 'vitest';
import {
  CLAWHUB_PUBLISH_TARGETS,
  parseTargetInput,
  resolvePublishTargets,
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
    'miniprogram-development,cloudbase-wechat-integration,all-in-one,ui-design,web-development,spec-workflow,minimal-web-baas-demo',
  );

  expect(targets.map((target) => target.key)).toEqual([
    'miniprogram-development',
    'cloudbase-wechat-integration',
    'all-in-one',
    'ui-design',
    'web-development',
    'spec-workflow',
    'minimal-web-baas-demo',
  ]);
  expect(Object.keys(CLAWHUB_PUBLISH_TARGETS)).toEqual([
    'miniprogram-development',
    'cloudbase-wechat-integration',
    'all-in-one',
    'ui-design',
    'web-development',
    'spec-workflow',
    'minimal-web-baas-demo',
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
  expect(
    targets.find((target) => target.key === 'minimal-web-baas-demo')?.registrySlug,
  ).toBe('minimal-web-baas-demo');
});

test('every target exposes SkillHub marketplace metadata (displayName, summary, iconUrl)', () => {
  // SkillHub / ClawHub marketplace cards need a Chinese product name
  // (displayName), a short Tencent-docs-style summary, and the black-bg
  // CloudBase logo. Without these the cards fall back to the raw SKILL.md
  // `name` slug (e.g. "cloudbase") and the English agent-trigger description.
  for (const target of Object.values(CLAWHUB_PUBLISH_TARGETS)) {
    expect(target.displayName, `${target.key} missing displayName`).toBeTruthy();
    expect(target.displayName, `${target.key} displayName should mention 腾讯云`).toMatch(
      /腾讯云 CloudBase/,
    );
    expect(target.summary, `${target.key} missing summary`).toBeTruthy();
    expect(target.iconUrl, `${target.key} missing iconUrl`).toBeTruthy();
    expect(target.iconUrl, `${target.key} iconUrl should point to the black-bg logo`).toMatch(
      /logo-dark\.png$/,
    );
  }
});

test('all-in-one displayName matches the official Tencent CloudBase product name', () => {
  // SkillHub shows the displayName verbatim on the skill card. To match the
  // product name on docs.cloudbase.net (腾讯云 CloudBase) instead of the raw
  // `cloudbase` slug, all-in-one must use the bilingual product name.
  const allInOne = CLAWHUB_PUBLISH_TARGETS['all-in-one'];
  expect(allInOne.displayName).toBe('腾讯云 CloudBase / Tencent CloudBase');
  expect(allInOne.summary).toMatch(/后端一体化平台/);
  expect(allInOne.summary).toMatch(/数据库|云函数|云存储|身份认证/);
});
