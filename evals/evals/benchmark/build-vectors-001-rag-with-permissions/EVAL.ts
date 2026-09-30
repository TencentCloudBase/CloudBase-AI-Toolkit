import type { CheckResult, EvalContext } from '../../../packages/core/src/types.ts';
import { flag, scoreSql } from '../../../packages/sandbox/src/live-score.ts';

const SQL = `select
  (exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='document_sections' and column_name='embedding'
  ))::text as col,
  (exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='document_sections' and indexdef ilike '%hnsw%'
  ))::text as hnsw,
  coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='document_sections'), false)::text as rls
`;

export const scorer = (ctx?: EvalContext): Promise<CheckResult[]> =>
  scoreSql(ctx, SQL, (row) => [
    { name: 'embedding-column-exists', passed: flag(row, 'col') },
    { name: 'hnsw-index-exists', passed: flag(row, 'hnsw') },
    { name: 'sections-rls-on', passed: flag(row, 'rls') }
  ]);
