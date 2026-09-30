import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects'), false)::text as rls,
  (select count(*) from pg_policies where schemaname='storage' and tablename='objects')::text as policies
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'storage-objects-rls-on', passed: flag(row, 'rls') },
    { name: 'storage-objects-have-policies', passed: flag(row, 'policies') }
  ]);
