import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (to_regclass('public.secrets_notes') is not null)::text as table_exists,
  coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='secrets_notes'), false)::text as rls,
  (select count(*) from pg_policies where schemaname='public' and tablename='secrets_notes')::text as policies
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'secrets-notes-exist', passed: flag(row, 'table_exists') },
    { name: 'secrets-notes-rls-on', passed: flag(row, 'rls') },
    { name: 'secrets-notes-have-policies', passed: flag(row, 'policies') }
  ]);
