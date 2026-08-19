import * as React from "react";
import { cellText, parseExecuteResult, type ToolBlock } from "../../lib/parse-tool-result.js";
import { parseDdlImpact } from "../../../shared/sql-ident.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface MutationCardProps {
  toolName?: string;
  block?: ToolBlock;
}

export function MutationCard(props: MutationCardProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? "managePgDatabase";
  const parsed = parseExecuteResult(props.block);
  const impact = parseDdlImpact(parsed.sql);
  const preview = parsed.previewRows;
  const columns =
    preview.length > 0
      ? Object.keys(preview[0] ?? {})
      : [];

  return (
    <ToolCardShell
      title={`${toolName} · ${impact.verb || "DML"}`}
      subtitle={impact.summary}
      warnings={impact.warnings}
      tone={impact.verb === "DELETE" ? "warn" : "ok"}
    >
      <div className="cb-kv-grid">
        {typeof parsed.rowCount === "number" ? (
          <div className="cb-kv">
            <div className="k">影响行数</div>
            <div className="v">{parsed.rowCount}</div>
          </div>
        ) : null}
        {parsed.targetTable ? (
          <div className="cb-kv">
            <div className="k">目标表</div>
            <div className="v">{parsed.targetTable}</div>
          </div>
        ) : null}
      </div>
      <pre className="cb-sql-block">{parsed.sql.trim() || "—"}</pre>
      {columns.length > 0 ? (
        <div className="cb-tbl-wrap">
          <table className="cb-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={index}>
                  {columns.map((col) => (
                    <td key={col}>{cellText(row[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cb-placeholder">无预览行。执行成功但未返回 sample rows。</div>
      )}
    </ToolCardShell>
  );
}
