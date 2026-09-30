import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (to_regclass('public.customer_totals') is not null)::text as view_exists,
  coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='orders'), false)::text as orders_rls
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'customer-totals-exists', passed: flag(row, 'view_exists') },
    { name: 'orders-not-world-readable', passed: flag(row, 'orders_rls') }
  ]);
