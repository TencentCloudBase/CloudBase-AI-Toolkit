import * as React from "react";
import { parseExecuteResult, type ToolBlock } from "../../lib/parse-tool-result.js";
import { parseDdlImpact } from "../../../shared/sql-ident.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface PrivilegesCardProps {
  toolName?: string;
  block?: ToolBlock;
}

export function PrivilegesCard(props: PrivilegesCardProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? "managePgDatabase";
  const parsed = parseExecuteResult(props.block);
  const impact = parseDdlImpact(parsed.sql);
  const warnings = [...impact.warnings];
  if (parsed.warning) warnings.unshift(parsed.warning);

  const matrix = [
    {
      role: impact.details.role ?? "—",
      object: impact.details.table ?? parsed.targetTable ?? "—",
      privileges: impact.details.privileges?.join(", ") ?? impact.details.operation ?? impact.verb,
      policy: impact.details.policy,
    },
  ];

  return (
    <ToolCardShell
      title={`${toolName} · 权限`}
      subtitle={impact.summary}
      warnings={warnings}
      tone="warn"
    >
      <pre className="cb-sql-block">{parsed.sql.trim() || "—"}</pre>
      <div className="cb-tbl-wrap">
        <table className="cb-table">
          <thead>
            <tr>
              <th>角色</th>
              <th>对象</th>
              <th>权限 / 策略</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, index) => (
              <tr key={index}>
                <td>{row.role}</td>
                <td>{row.object}</td>
                <td>{row.policy ? `${row.policy} (${row.privileges})` : row.privileges}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ToolCardShell>
  );
}
