import * as React from "react";
import type { PlatformProvider } from "../core/provider.js";
import { useRecentLogs } from "../hooks/use-platform.js";
import { useKit } from "../hooks/use-menu.js";

export interface LogsPageProps {
  provider?: PlatformProvider;
}

export function LogsPage(props: LogsPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const logs = useRecentLogs(provider);
  const [query, setQuery] = React.useState("log:ERROR");

  return (
    <div className="cb-kit-page">
      <h2 className="cb-kit-page-title">{kit.tr("logs.title")}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            font: "inherit",
            fontSize: 12,
            padding: "6px 8px",
            border: "1px solid var(--cb-border)",
            borderRadius: 6,
            fontFamily: "var(--cb-mono)",
          }}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => logs.reload()}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            border: "1px solid var(--cb-border-strong)",
            borderRadius: 6,
            background: "var(--cb-panel)",
            cursor: "pointer",
          }}
        >
          {kit.tr("logs.search")}
        </button>
      </div>
      {logs.error ? <div style={{ color: "var(--cb-danger)", fontSize: 12 }}>{logs.error}</div> : null}
      <div className="cb-kit-card">
        {(logs.data ?? []).map((entry, index) => (
          <div
            key={`${entry.time ?? index}:${entry.title}`}
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--cb-border)",
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <span
                className={`cb-kit-badge ${entry.level === "error" ? "failed" : entry.level === "warn" ? "pending" : "unknown"}`}
              >
                {entry.level}
              </span>
              {entry.time ? (
                <span style={{ fontSize: 10.5, color: "var(--cb-text-3)", fontFamily: "var(--cb-mono)" }}>
                  {entry.time}
                </span>
              ) : null}
            </div>
            <div style={{ fontFamily: "var(--cb-mono)", fontSize: 11.5, wordBreak: "break-all" }}>{entry.title}</div>
          </div>
        ))}
        {!logs.loading && (logs.data ?? []).length === 0 ? (
          <div className="cb-kit-restricted" style={{ margin: 0, border: "none" }}>—</div>
        ) : null}
      </div>
    </div>
  );
}
