import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (exists (
    select 1 from pg_publication_tables
    where schemaname='public' and tablename='orders'
  ))::text as orders_pub,
  (exists (
    select 1 from pg_publication_tables
    where schemaname='public' and tablename='courier_locations'
  ))::text as courier_pub
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'orders-in-publication', passed: flag(row, 'orders_pub') },
    { name: 'courier-locations-still-published', passed: flag(row, 'courier_pub') }
  ]);
