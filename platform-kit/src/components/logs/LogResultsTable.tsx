import * as React from "react";
import type { LogEntry } from "../../core/types.js";

export interface LogResultsTableProps {
  entries: LogEntry[];
  loading?: boolean;
  expandedId?: string;
  onToggle: (id: string) => void;
  emptyLabel?: string;
  expandLabel?: string;
}

function entryId(entry: LogEntry, index: number): string {
  return entry.id ?? `${entry.time ?? index}:${entry.message.slice(0, 24)}`;
}

export function LogResultsTable(props: LogResultsTableProps): React.ReactElement {
  if (!props.loading && props.entries.length === 0) {
    return <div className="cb-kit-restricted">{props.emptyLabel ?? "—"}</div>;
  }
  return (
    <div className="cb-kit-card cb-kit-table">
      <div className="cb-kit-table-head">
        <span>Time</span>
        <span>Service</span>
        <span>Level</span>
        <span>Message</span>
      </div>
      {props.entries.map((entry, index) => {
        const id = entryId(entry, index);
        const expanded = props.expandedId === id;
        return (
          <React.Fragment key={id}>
            <button
              type="button"
              className="cb-kit-table-row"
              onClick={() => props.onToggle(id)}
            >
              <span className="mono">{entry.time ?? "—"}</span>
              <span>{entry.service ?? "—"}</span>
              <span>
                <span className={`cb-kit-badge ${entry.level === "error" ? "failed" : entry.level === "warn" ? "pending" : "unknown"}`}>
                  {entry.level}
                </span>
              </span>
              <span className="mono truncate">{entry.message}</span>
            </button>
            {expanded ? (
              <div className="cb-kit-log-detail">
                <div style={{ fontSize: 10.5, color: "var(--cb-text-3)", marginBottom: 4 }}>
                  {props.expandLabel ?? "Details"}
                </div>
                <pre>{entry.raw ? JSON.stringify(entry.raw, null, 2) : entry.message}</pre>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}
