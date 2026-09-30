import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (to_regclass('public.bookmarks') is not null)::text as table_exists,
  coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='bookmarks'), false)::text as rls,
  (select count(*) from pg_policies where schemaname='public' and tablename='bookmarks' and cmd='SELECT')::text as select_policies
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'bookmarks-table-exists', passed: flag(row, 'table_exists') },
    { name: 'bookmarks-rls-stays-on', passed: flag(row, 'rls') },
    { name: 'bookmarks-have-select-policy', passed: flag(row, 'select_policies') }
  ]);
