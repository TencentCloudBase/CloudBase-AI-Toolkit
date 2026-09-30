import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (to_regclass('public.private_notes') is not null)::text as table_exists,
  coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='private_notes'), false)::text as rls,
  (select count(*) from pg_policies where schemaname='public' and tablename='private_notes')::text as policies
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'private-notes-exist', passed: flag(row, 'table_exists') },
    { name: 'private-notes-rls-on', passed: flag(row, 'rls') },
    { name: 'private-notes-have-policies', passed: flag(row, 'policies') }
  ]);
