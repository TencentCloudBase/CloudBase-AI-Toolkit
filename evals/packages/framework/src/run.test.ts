import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadScenario } from '../../core/src/load-scenario.ts';
import { parsePromptMarkdown } from '../../core/src/metadata.ts';
import { findExperiment } from '../../../experiments/presets.ts';
import { toCanonicalModelId, toCbcModelId } from './models.ts';
import { parseClaudeStepCount, parseClaudeStreamUsage } from './parsers.ts';
import { runScenario } from './run.ts';

const evalsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('PROMPT.md frontmatter rejects a missing interface', () => {
  assert.throws(
    () => parsePromptMarkdown('---\nstage: build\nproduct:\n  - auth\ntopic:\n  - sdk\n---\n\nTask\n'),
    /interface/,
  );
});

test('example scenario loads and names itself', async () => {
  const scenario = await loadScenario(evalsRoot, 'build-auth-001-username-signin');
  assert.equal(scenario.metadata.interface, 'mcp');
  assert.equal(scenario.metadata.stage, 'build');
  assert.deepEqual(scenario.metadata.product, ['auth', 'hosting']);
});

test('fixture-dry writes result.json without a cloud env', async () => {
  const scenario = await loadScenario(evalsRoot, 'build-auth-001-username-signin');
  const root = await mkdtemp(path.join(os.tmpdir(), 'cb-evals-'));
  try {
    const result = await runScenario({
      evalsRoot: root,
      scenario,
      experiment: findExperiment('fixture-dry'),
      run: 1,
      env: {},
    });
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.passed, false);
    assert.equal(result.checks.length, 4);
    const written = await readFile(
      path.join(root, 'results', 'fixture-dry', scenario.id, 'run-1', 'result.json'),
      'utf8',
    );
    assert.equal(JSON.parse(written).eval, scenario.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ioa channel ids normalize to canonical model names', () => {
  assert.equal(toCbcModelId('hy4'), 'hy4-preview-ioa');
  assert.equal(toCanonicalModelId('hy4-preview-ioa'), 'hy4');
  assert.equal(toCanonicalModelId('glm-5.2-ioa'), 'glm-5.2');
  assert.equal(toCbcModelId('hy4').includes('hy4'), true);
  assert.equal(toCanonicalModelId('glm-5.2-ioa').includes('ioa'), false);
});

test('claude stream-json usage sums assistant events only', () => {
  const raw = [
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 10, output_tokens: 4 } } }),
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 3, output_tokens: 2 } } }),
    JSON.stringify({ type: 'result', usage: { input_tokens: 1, output_tokens: 1 } }),
  ].join('\n');
  assert.deepEqual(parseClaudeStreamUsage(raw), { inputTokens: 14, outputTokens: 7 });
  assert.equal(parseClaudeStepCount(raw), 2);
});
