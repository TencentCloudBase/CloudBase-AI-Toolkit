import type { PlatformProvider } from "../core/provider.js";
import type { RowPage } from "../core/types.js";

/** SELECT / SHOW / EXPLAIN are treated as read SQL (no confirm dialog). */
export function isReadSql(sql: string): boolean {
  return /^\s*(select|show|explain)\b/i.test(sql);
}

/**
 * Minimal SQL runner: reads use runReadSql; writes require confirm then runPgDDL.
 */
export async function runSqlStatement(
  sql: string,
  provider: Pick<PlatformProvider, "runReadSql" | "runPgDDL">,
  confirmWrite: () => boolean | Promise<boolean>,
): Promise<RowPage | undefined> {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error("empty sql");
  }
  if (isReadSql(trimmed)) {
    return provider.runReadSql(trimmed);
  }
  const confirmed = await confirmWrite();
  if (!confirmed) {
    throw new Error("cancelled");
  }
  const result = await provider.runPgDDL(trimmed, true);
  if (!result.ok) {
    throw new Error(result.message || "SQL failed");
  }
  return {
    columns: ["message"],
    rows: [{ message: result.message }],
  };
}
