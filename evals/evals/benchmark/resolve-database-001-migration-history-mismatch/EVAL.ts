import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='avatar_url'
  ))::text as avatar,
  (to_regclass('public.profiles') is not null)::text as profiles
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'profiles-table-exists', passed: flag(row, 'profiles') },
    { name: 'avatar-url-column-live', passed: flag(row, 'avatar') }
  ]);
