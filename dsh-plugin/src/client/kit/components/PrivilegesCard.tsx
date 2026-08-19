import * as React from "react";
import type { DdlImpactSummary } from "../../../shared/sql-ident.js";
import { SqlCodeBlock } from "./SqlCodeBlock.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface PrivilegesCardProps {
  title: string;
  sql: string;
  impact: DdlImpactSummary;
  elapsed?: string;
}

export function PrivilegesCard(props: PrivilegesCardProps): React.ReactElement {
  const { impact } = props;
  const entries = [...impact.grants, ...impact.revokes];

  return (
    <ToolCardShell
      title={props.title}
      badge="GRANT / RLS"
      warning
      elapsed={props.elapsed}
      showEnvBadge
    >
      {entries.length > 0 ? (
        <div className="cb-tbl-wrap">
          <table className="cb-table cb-tv-matrix">
            <thead>
              <tr>
                <th>Role</th>
                <th>Privilege</th>
                <th>Object</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={`${entry.role}-${entry.object}-${index}`}>
                  <td>{entry.role}</td>
                  <td>{entry.privilege}</td>
                  <td>{entry.object}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {impact.rlsChanges.length > 0 ? (
        <ul className="cb-tv-impact-list">
          {impact.rlsChanges.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <SqlCodeBlock sql={props.sql} />
    </ToolCardShell>
  );
}
