import type { CheckResult, EvalContext } from '../../core/src/types.ts';
import { adminQuery, type LiveCreds } from './pg-live.ts';

export async function scoreSql(
  ctx: EvalContext | undefined,
  sql: string,
  map: (row: Record<string, string>) => CheckResult[],
): Promise<CheckResult[]> {
  if (!ctx?.live) {
    return [{ name: 'live-adapter', passed: false, detail: 'postgres adapter is not connected' }];
  }
  const rows = await adminQuery(ctx.live as LiveCreds, sql);
  return map(rows[0] ?? {});
}

export function flag(row: Record<string, string>, key: string): boolean {
  const value = (row[key] ?? '').toLowerCase();
  return value === 't' || value === 'true' || (value !== '' && value !== '0' && value !== 'f' && value !== 'false');
}
