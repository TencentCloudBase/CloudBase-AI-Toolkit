import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import type { RowPage } from "../../core/types.js";
import { runSqlStatement } from "../../utils/sql-read.js";
import { ConfirmDialog } from "../ConfirmDialog.js";

export interface SqlEditorPanelProps {
  provider?: PlatformProvider;
  runLabel: string;
  hintLabel: string;
  confirmWriteLabel: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function SqlEditorPanel(props: SqlEditorPanelProps): React.ReactElement {
  const [sql, setSql] = React.useState("SELECT 1 AS ok;");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [page, setPage] = React.useState<RowPage | undefined>();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const pendingRun = React.useRef(false);

  const run = React.useCallback(async (confirmed = false) => {
    setPending(true);
    setError(undefined);
    try {
      if (!props.provider) throw new Error("no provider");
      const result = await runSqlStatement(sql, props.provider, async () => {
        if (confirmed) return true;
        pendingRun.current = true;
        setConfirmOpen(true);
        return false;
      });
      if (result) setPage(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== "cancelled") setError(message);
    } finally {
      setPending(false);
    }
  }, [props.provider, sql]);

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
            void run(false);
          }
        }}
      />
      <div className="cb-kit-page-actions cb-kit-spread">
        <button type="button" className="cb-kit-btn" disabled={pending} onClick={() => void run(false)}>
          {props.runLabel}
        </button>
        <span className="cb-kit-hint">{props.hintLabel}</span>
      </div>
      {error ? <div className="cb-kit-error-banner">{error}</div> : null}
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
      <ConfirmDialog
        open={confirmOpen}
        title={props.confirmWriteLabel}
        body={sql}
        confirmLabel={props.confirmLabel ?? "Confirm"}
        cancelLabel={props.cancelLabel ?? "Cancel"}
        onCancel={() => {
          setConfirmOpen(false);
          pendingRun.current = false;
        }}
        onConfirm={() => {
          setConfirmOpen(false);
          if (pendingRun.current) {
            pendingRun.current = false;
            void run(true);
          }
        }}
      />
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
