import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import type { RowPage } from "../../core/types.js";
import { runSqlStatement } from "../../utils/sql-read.js";

export interface SqlEditorPanelProps {
  provider?: PlatformProvider;
  runLabel: string;
  hintLabel: string;
  confirmWriteLabel: string;
}

export function SqlEditorPanel(props: SqlEditorPanelProps): React.ReactElement {
  const [sql, setSql] = React.useState("SELECT 1 AS ok;");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [page, setPage] = React.useState<RowPage | undefined>();

  const run = React.useCallback(async () => {
    setPending(true);
    setError(undefined);
    try {
      if (!props.provider) throw new Error("no provider");
      const result = await runSqlStatement(sql, props.provider, () =>
        window.confirm(props.confirmWriteLabel),
      );
      setPage(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== "cancelled") setError(message);
    } finally {
      setPending(false);
    }
  }, [props.confirmWriteLabel, props.provider, sql]);

  return (
    <div>
      <textarea
        className="cb-kit-textarea"
        rows={8}
        value={sql}
        spellCheck={false}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void run();
          }
        }}
      />
      <div className="cb-kit-page-actions" style={{ margin: "8px 0 12px" }}>
        <button type="button" className="cb-kit-btn" disabled={pending} onClick={() => void run()}>
          {props.runLabel}
        </button>
        <span style={{ fontSize: 11, color: "var(--cb-text-3)" }}>{props.hintLabel}</span>
      </div>
      {error ? (
        <div style={{ color: "var(--cb-danger)", fontSize: 12, marginBottom: 8 }}>{error}</div>
      ) : null}
      {page ? (
        <div className="cb-kit-sql-wrap">
          <table>
            <thead>
              <tr>
                {page.columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, index) => (
                <tr key={index}>
                  {page.columns.map((col) => (
                    <td key={col}>{formatCell(row[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
