import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (to_regclass('public.profiles') is not null)::text as profiles,
  (exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='display_name'
  ))::text as display_name
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'profiles-table-exists', passed: flag(row, 'profiles') },
    { name: 'display-name-column-exists', passed: flag(row, 'display_name') }
  ]);
