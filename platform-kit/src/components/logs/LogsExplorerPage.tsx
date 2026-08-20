import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useKit } from "../../hooks/use-menu.js";
import { useLogsSearch, useLogServiceCheck } from "../../hooks/use-logs-search.js";
import { isClsUnavailableError } from "../../utils/cls-errors.js";
import {
  LogFiltersBar,
  buildLogSearchFilters,
  exportLogsCsv,
  type LogLevelFilter,
  type LogServicePreset,
  type LogTimePreset,
} from "./LogFiltersBar.js";
import { LogResultsTable } from "./LogResultsTable.js";

export interface LogsExplorerPageProps {
  provider?: PlatformProvider;
}

export function LogsExplorerPage(props: LogsExplorerPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const [service, setService] = React.useState<LogServicePreset>("");
  const [level, setLevel] = React.useState<LogLevelFilter>("all");
  const [timePreset, setTimePreset] = React.useState<LogTimePreset>("4h");
  const [queryString, setQueryString] = React.useState("");
  const [customStart, setCustomStart] = React.useState<string>();
  const [customEnd, setCustomEnd] = React.useState<string>();
  const [searchTick, setSearchTick] = React.useState(0);
  const [expandedId, setExpandedId] = React.useState<string | undefined>();

  const filters = React.useMemo(
    () =>
      buildLogSearchFilters({
        queryString,
        service,
        level,
        timePreset,
        customStart,
        customEnd,
      }),
    [queryString, service, level, timePreset, customStart, customEnd, searchTick],
  );

  const clsCheck = useLogServiceCheck(provider);
  const logsEnabled = searchTick > 0 && clsCheck.data === true;
  const logs = useLogsSearch(provider, filters, logsEnabled);
  const clsDown = clsCheck.data === false || isClsUnavailableError(logs.error);

  const labels = React.useMemo(
    () => ({
      "logs.service.all": kit.tr("logs.service.all"),
      "logs.service.scf": kit.tr("logs.service.scf"),
      "logs.service.cloudrun": kit.tr("logs.service.cloudrun"),
      "logs.service.hosting": kit.tr("logs.service.hosting"),
      "logs.service.database": kit.tr("logs.service.database"),
      "logs.service.gateway": kit.tr("logs.service.gateway"),
      "logs.level.all": kit.tr("logs.level.all"),
      "logs.level.error": kit.tr("logs.level.error"),
      "logs.level.warn": kit.tr("logs.level.warn"),
      "logs.level.info": kit.tr("logs.level.info"),
      "logs.time.4h": kit.tr("logs.time.4h"),
      "logs.time.24h": kit.tr("logs.time.24h"),
      "logs.time.3d": kit.tr("logs.time.3d"),
      "logs.time.custom": kit.tr("logs.time.custom"),
      "logs.search": kit.tr("logs.search"),
    }),
    [kit],
  );

  React.useEffect(() => {
    setSearchTick(1);
  }, []);

  return (
    <div className="cb-kit-page">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("logs.title")}</h2>
        <div className="cb-kit-page-actions">
          <button
            type="button"
            className="cb-kit-btn ghost"
            onClick={() => exportLogsCsv(logs.data?.entries ?? [])}
            disabled={(logs.data?.entries.length ?? 0) === 0}
          >
            {kit.tr("logs.export")}
          </button>
          <button type="button" className="cb-kit-btn ghost" onClick={() => logs.reload()}>
            {kit.tr("common.refresh")}
          </button>
        </div>
      </div>

      {clsDown ? (
        <div className="cb-kit-banner warn">{kit.tr("logs.cls.disabled")}</div>
      ) : null}

      <LogFiltersBar
        service={service}
        level={level}
        timePreset={timePreset}
        queryString={queryString}
        customStart={customStart}
        customEnd={customEnd}
        labels={labels}
        onChange={(patch) => {
          if (patch.service !== undefined) setService(patch.service);
          if (patch.level !== undefined) setLevel(patch.level);
          if (patch.timePreset !== undefined) setTimePreset(patch.timePreset);
          if (patch.queryString !== undefined) setQueryString(patch.queryString);
          if (patch.customStart !== undefined) setCustomStart(patch.customStart);
          if (patch.customEnd !== undefined) setCustomEnd(patch.customEnd);
        }}
        onSearch={() => setSearchTick((v) => v + 1)}
      />

      {logs.error && !clsDown ? (
        <div style={{ color: "var(--cb-danger)", fontSize: 12, marginBottom: 8 }}>{logs.error}</div>
      ) : null}

      <LogResultsTable
        entries={logs.data?.entries ?? []}
        loading={logs.loading}
        expandedId={expandedId}
        onToggle={(id) => setExpandedId((prev) => (prev === id ? undefined : id))}
        emptyLabel={kit.tr("logs.empty")}
        expandLabel={kit.tr("logs.details")}
        columnLabels={{
          time: kit.tr("logs.col.time"),
          service: kit.tr("logs.col.service"),
          level: kit.tr("logs.col.level"),
          message: kit.tr("logs.col.message"),
        }}
      />

      {logs.hasMore ? (
        <button type="button" className="cb-kit-btn ghost" style={{ marginTop: 8 }} onClick={() => logs.loadMore()}>
          {kit.tr("logs.loadMore")}
        </button>
      ) : null}
    </div>
  );
}

/** @deprecated use LogsExplorerPage */
export const LogsPage = LogsExplorerPage;
