import * as React from "react";
import { parseExecuteResult, type ToolBlock } from "../../lib/parse-tool-result.js";
import { parseDdlImpact } from "../../../shared/sql-ident.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface DdlCardProps {
  toolName?: string;
  block?: ToolBlock;
}

export function DdlCard(props: DdlCardProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? "managePgDatabase";
  const parsed = parseExecuteResult(props.block);
  const impact = parseDdlImpact(parsed.sql);
  const warnings = [...impact.warnings];
  if (parsed.warning) warnings.unshift(parsed.warning);

  const facts: Array<{ label: string; value: string }> = [];
  if (impact.details.table) facts.push({ label: "对象", value: impact.details.table });
  if (impact.details.column) facts.push({ label: "列", value: impact.details.column });
  if (impact.details.index) facts.push({ label: "索引", value: impact.details.index });
  if (typeof parsed.rowCount === "number") facts.push({ label: "影响行数", value: String(parsed.rowCount) });

  return (
    <ToolCardShell
      title={`${toolName} · DDL`}
      subtitle={impact.summary}
      warnings={warnings}
      tone={warnings.length > 0 ? "warn" : "ok"}
    >
      <pre className="cb-sql-block">{parsed.sql.trim() || "—"}</pre>
      {facts.length > 0 ? (
        <div className="cb-kv-grid">
          {facts.map((item) => (
            <div key={item.label} className="cb-kv">
              <div className="k">{item.label}</div>
              <div className="v">{item.value}</div>
            </div>
          ))}
        </div>
      ) : null}
    </ToolCardShell>
  );
}
