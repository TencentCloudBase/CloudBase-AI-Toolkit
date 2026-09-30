import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (to_regclass('public.customer_totals') is not null)::text as view_exists,
  (
    not has_table_privilege('anon', 'public.customers', 'SELECT')
    and not has_table_privilege('anon', 'public.orders', 'SELECT')
  )::text as anon_closed
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'customer-totals-exists', passed: flag(row, 'view_exists') },
    { name: 'anon-cannot-select-base-tables', passed: flag(row, 'anon_closed') }
  ]);
