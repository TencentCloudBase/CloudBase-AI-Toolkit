import * as React from "react";
import type { LogLevelFilter, LogServicePreset, LogTimePreset } from "../../utils/log-filters.js";

export type { LogServicePreset, LogLevelFilter, LogTimePreset };
export { buildLogQueryString, buildLogSearchFilters, buildTimeRange, exportLogsCsv } from "../../utils/log-filters.js";

export interface LogFiltersBarProps {
  service: LogServicePreset;
  level: LogLevelFilter;
  timePreset: LogTimePreset;
  queryString: string;
  customStart?: string;
  customEnd?: string;
  labels: Record<string, string>;
  onChange: (patch: Partial<LogFiltersBarProps>) => void;
  onSearch: () => void;
}

function toDatetimeLocalValue(value?: string): string {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

export function LogFiltersBar(props: LogFiltersBarProps): React.ReactElement {
  return (
    <div className="cb-kit-filters">
      <select
        className="cb-kit-select"
        value={props.service}
        onChange={(e) => props.onChange({ service: e.target.value as LogServicePreset })}
      >
        <option value="">{props.labels["logs.service.all"]}</option>
        <option value="scf">{props.labels["logs.service.scf"]}</option>
        <option value="cloudrun">{props.labels["logs.service.cloudrun"]}</option>
        <option value="hosting">{props.labels["logs.service.hosting"]}</option>
        <option value="database">{props.labels["logs.service.database"]}</option>
        <option value="gateway">{props.labels["logs.service.gateway"]}</option>
      </select>
      <select
        className="cb-kit-select"
        value={props.level}
        onChange={(e) => props.onChange({ level: e.target.value as LogLevelFilter })}
      >
        <option value="all">{props.labels["logs.level.all"]}</option>
        <option value="error">{props.labels["logs.level.error"]}</option>
        <option value="warn">{props.labels["logs.level.warn"]}</option>
        <option value="info">{props.labels["logs.level.info"]}</option>
      </select>
      <select
        className="cb-kit-select"
        value={props.timePreset}
        onChange={(e) => props.onChange({ timePreset: e.target.value as LogTimePreset })}
      >
        <option value="4h">{props.labels["logs.time.4h"]}</option>
        <option value="24h">{props.labels["logs.time.24h"]}</option>
        <option value="3d">{props.labels["logs.time.3d"]}</option>
        <option value="custom">{props.labels["logs.time.custom"]}</option>
      </select>
      {props.timePreset === "custom" ? (
        <>
          <input
            className="cb-kit-input"
            type="datetime-local"
            value={toDatetimeLocalValue(props.customStart)}
            onChange={(e) => props.onChange({ customStart: e.target.value })}
          />
          <input
            className="cb-kit-input"
            type="datetime-local"
            value={toDatetimeLocalValue(props.customEnd)}
            onChange={(e) => props.onChange({ customEnd: e.target.value })}
          />
        </>
      ) : null}
      <input
        className="cb-kit-input flex"
        value={props.queryString}
        onChange={(e) => props.onChange({ queryString: e.target.value })}
        spellCheck={false}
      />
      <button type="button" className="cb-kit-btn" onClick={props.onSearch}>
        {props.labels["logs.search"]}
      </button>
    </div>
  );
}
