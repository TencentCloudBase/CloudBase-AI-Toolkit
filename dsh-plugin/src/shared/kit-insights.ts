import type { AppUser, LogEntry, TableSummary } from "./types.js";

export function bucketUserGrowth(users: AppUser[], days = 14): number[] {
  const buckets = Array.from({ length: days }, () => 0);
  const now = Date.now();
  for (const user of users) {
    if (!user.createdAt) continue;
    const created = Date.parse(user.createdAt);
    if (!Number.isFinite(created)) continue;
    const dayIndex = days - 1 - Math.floor((now - created) / 86400000);
    if (dayIndex >= 0 && dayIndex < days) {
      buckets[dayIndex] = (buckets[dayIndex] ?? 0) + 1;
    }
  }
  let running = 0;
  return buckets.map((count) => {
    running += count;
    return running;
  });
}

export interface SuggestionItem {
  title: string;
  detail: string;
}

export function buildSuggestions(opts: {
  tables: TableSummary[];
  errors: LogEntry[];
}): SuggestionItem[] {
  const items: SuggestionItem[] = [];
  if (opts.tables.length === 0) {
    items.push({
      title: "尚未发现数据表",
      detail: "确认环境已开通 PostgreSQL 或文档库，并完成登录与 set_env。",
    });
  }
  for (const table of opts.tables.filter((item) => (item.rowCount ?? 0) === 0).slice(0, 3)) {
    items.push({
      title: `${table.name} 为空表`,
      detail: "可插入样例行验证 RLS/权限，或删除未使用的表减少噪音。",
    });
  }
  if (opts.errors.length > 0) {
    items.push({
      title: `最近 ${opts.errors.length} 条错误日志`,
      detail: opts.errors[0]?.title ?? "查看分析 tab 的 queryLogs 结果并按函数名过滤。",
    });
  }
  if (items.length === 0) {
    items.push({
      title: "环境看起来健康",
      detail: "表与日志均无异常信号。可继续用 SQL 编辑器做只读探查。",
    });
  }
  return items;
}
