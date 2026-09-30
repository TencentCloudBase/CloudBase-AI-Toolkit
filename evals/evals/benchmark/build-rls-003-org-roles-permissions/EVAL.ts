import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (to_regclass('public.documents') is not null)::text as table_exists,
  coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='documents'), false)::text as rls,
  (select count(*) from pg_policies where schemaname='public' and tablename='documents')::text as policies
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'documents-table-exists', passed: flag(row, 'table_exists') },
    { name: 'documents-rls-enabled', passed: flag(row, 'rls') },
    { name: 'documents-have-policies', passed: flag(row, 'policies') }
  ]);
