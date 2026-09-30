import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (to_regclass('public.posts') is not null)::text as table_exists,
  coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='posts'), false)::text as rls,
  (select count(*) from pg_policies where schemaname='public' and tablename='posts')::text as policies
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'posts-table-exists', passed: flag(row, 'table_exists') },
    { name: 'posts-rls-enabled', passed: flag(row, 'rls') },
    { name: 'posts-have-policies', passed: flag(row, 'policies') }
  ]);
