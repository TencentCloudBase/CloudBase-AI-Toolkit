import type { LogSearchFilters } from "../core/types.js";

export type LogServicePreset = "" | "scf" | "cloudrun" | "hosting" | "database" | "gateway";
export type LogLevelFilter = "all" | "error" | "warn" | "info";
export type LogTimePreset = "4h" | "24h" | "3d" | "custom";

const SERVICE_QUERY: Record<Exclude<LogServicePreset, "">, { fragment: string; service?: "tcb" | "tcbr" }> = {
  scf: { fragment: "(src:app OR src:system)", service: "tcb" },
  cloudrun: { fragment: "service:cloudrun", service: "tcbr" },
  hosting: { fragment: "module:hosting", service: "tcb" },
  database: { fragment: "(module:database OR module:rdb)", service: "tcb" },
  gateway: { fragment: "logType:accesslog", service: "tcb" },
};

const LEVEL_QUERY: Record<Exclude<LogLevelFilter, "all">, string> = {
  error: "log:ERROR",
  warn: "log:WARN",
  info: "log:INFO",
};

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildTimeRange(preset: LogTimePreset, customStart?: string, customEnd?: string): {
  startTime?: string;
  endTime?: string;
} {
  if (preset === "custom") {
    return { startTime: customStart, endTime: customEnd };
  }
  const now = new Date();
  const endTime = formatTime(now);
  const hours = preset === "4h" ? 4 : preset === "24h" ? 24 : 72;
  const start = new Date(now.getTime() - hours * 3600000);
  return { startTime: formatTime(start), endTime };
}

export function buildLogQueryString(
  baseQuery: string,
  service: LogServicePreset,
  level: LogLevelFilter,
): string {
  const parts: string[] = [];
  if (service && SERVICE_QUERY[service]) {
    parts.push(SERVICE_QUERY[service].fragment);
  }
  const trimmed = baseQuery.trim();
  if (trimmed) parts.push(`(${trimmed})`);
  if (level !== "all") parts.push(LEVEL_QUERY[level]);
  return parts.join(" AND ");
}

export function buildLogSearchFilters(opts: {
  queryString: string;
  service: LogServicePreset;
  level: LogLevelFilter;
  timePreset: LogTimePreset;
  customStart?: string;
  customEnd?: string;
}): LogSearchFilters {
  const { startTime, endTime } = buildTimeRange(opts.timePreset, opts.customStart, opts.customEnd);
  const serviceMeta = opts.service ? SERVICE_QUERY[opts.service] : undefined;
  return {
    queryString: buildLogQueryString(opts.queryString, opts.service, opts.level),
    service: serviceMeta?.service,
    startTime,
    endTime,
    limit: 50,
    sort: "desc",
  };
}

export function exportLogsCsv(
  entries: Array<{ time?: string; service?: string; level?: string; message: string }>,
): void {
  if (typeof document === "undefined") return;
  const header = "time,service,level,message\n";
  const rows = entries
    .map((entry) => {
      const cols = [
        entry.time ?? "",
        entry.service ?? "",
        entry.level ?? "",
        entry.message.replace(/"/g, '""'),
      ];
      return cols.map((c) => `"${c}"`).join(",");
    })
    .join("\n");
  const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `logs-${Date.now()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
