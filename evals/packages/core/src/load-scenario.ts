import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parsePromptMarkdown, type EvalMetadata, type EvalSuite } from './metadata.ts';
import type { Scorer } from './types.ts';

export interface Scenario {
  id: string;
  suite: EvalSuite;
  dir: string;
  promptPath: string;
  evalPath: string;
  metadata: EvalMetadata;
  body: string;
  scorer: Scorer;
}

export async function loadScenario(evalsRoot: string, id: string): Promise<Scenario> {
  const suites: EvalSuite[] = ['benchmark', 'regression'];
  for (const suite of suites) {
    const dir = path.join(evalsRoot, 'evals', suite, id);
    try {
      await readFile(path.join(dir, 'PROMPT.md'), 'utf8');
      return await readScenario(dir, id, suite);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Unknown scenario: ${id}`);
}

export async function listScenarioIds(evalsRoot: string): Promise<string[]> {
  const ids: string[] = [];
  for (const suite of ['benchmark', 'regression'] as const) {
    const dir = path.join(evalsRoot, 'evals', suite);
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    for (const name of names) {
      try {
        await readFile(path.join(dir, name, 'PROMPT.md'), 'utf8');
        ids.push(name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  return ids.sort();
}

async function readScenario(dir: string, id: string, suite: EvalSuite): Promise<Scenario> {
  const promptPath = path.join(dir, 'PROMPT.md');
  const evalPath = path.join(dir, 'EVAL.ts');
  const markdown = await readFile(promptPath, 'utf8');
  const parsed = parsePromptMarkdown(markdown);
  const mod = (await import(pathToFileURL(evalPath).href)) as { scorer?: Scorer };
  if (typeof mod.scorer !== 'function') {
    throw new Error(`${evalPath} must export scorer()`);
  }
  return {
    id,
    suite,
    dir,
    promptPath,
    evalPath,
    metadata: parsed.metadata,
    body: parsed.body,
    scorer: mod.scorer,
  };
}
