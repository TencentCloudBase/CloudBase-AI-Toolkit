import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (to_regclass('public.teams') is not null)::text as teams,
  (to_regclass('public.members') is not null)::text as members,
  (to_regclass('public.tasks') is not null)::text as tasks
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'teams-table-exists', passed: flag(row, 'teams') },
    { name: 'members-table-exists', passed: flag(row, 'members') },
    { name: 'tasks-table-exists', passed: flag(row, 'tasks') }
  ]);
