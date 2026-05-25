import { expect, test } from 'vitest';
import {
  CLAWHUB_PUBLISH_TARGETS,
  parseTargetInput,
  resolvePublishTargets,
} from '../scripts/clawhub-publish-targets.mjs';

test('parseTargetInput accepts explicit target list and de-duplicates order-preservingly', () => {
  expect(
    parseTargetInput(
      'miniprogram-development, web-development, all-in-one, web-development',
    ),
  ).toEqual(['miniprogram-development', 'web-development', 'all-in-one']);
});

test('parseTargetInput rejects unknown publish targets', () => {
  expect(() => parseTargetInput('auth-web')).toThrow(/Unknown publish targets/);
});

test('resolvePublishTargets only returns whitelisted publish units', () => {
  const targets = resolvePublishTargets(
    'miniprogram-development,all-in-one,ui-design,web-development,spec-workflow',
  );

  expect(targets.map((target) => target.key)).toEqual([
    'miniprogram-development',
    'all-in-one',
    'ui-design',
    'web-development',
    'spec-workflow',
  ]);
  expect(Object.keys(CLAWHUB_PUBLISH_TARGETS)).toEqual([
    'miniprogram-development',
    'all-in-one',
    'ui-design',
    'web-development',
    'spec-workflow',
  ]);
  expect(targets.find((target) => target.key === 'ui-design')?.registrySlug).toBe(
    'ui-design-guide',
  );
  expect(
    targets.find((target) => target.key === 'spec-workflow')?.registrySlug,
  ).toBe('spec-workflow-guide');
});
