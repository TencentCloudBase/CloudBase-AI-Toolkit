import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='products' and column_name='description'
  ))::text as has_description,
  (to_regclass('public.products') is not null)::text as table_exists
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'products-table-exists', passed: flag(row, 'table_exists') },
    { name: 'description-column-live', passed: flag(row, 'has_description') }
  ]);
