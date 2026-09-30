import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='edge_secret' and p.prosecdef
  ))::text as fn,
  (to_regclass('public.edge_secret') is null)::text as not_table
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'edge-secret-function-exists', passed: flag(row, 'fn') },
    { name: 'edge-secret-not-a-public-table', passed: flag(row, 'not_table') },
  ]);
