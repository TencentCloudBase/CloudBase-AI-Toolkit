import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';

export const scorer = async (ctx?: EvalContext): Promise<CheckResult[]> => {
  if (!ctx?.live) {
    return [{ name: 'live-adapter', passed: false, detail: 'postgres adapter is not connected' }];
  }
  let raw = '';
  try {
    raw = await readFile(path.join(ctx.workspace ?? '', 'cloudbaserc.json'), 'utf8');
  } catch {
    raw = '';
  }
  let envId = '';
  try {
    envId = String(JSON.parse(raw).envId ?? '');
  } catch {
    envId = '';
  }
  return [
    { name: 'cloudbaserc-exists', passed: raw.length > 0 },
    { name: 'env-id-recorded', passed: envId.length > 0 },
  ];
};
