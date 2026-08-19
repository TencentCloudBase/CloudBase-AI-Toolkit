import * as React from "react";
import type { DdlImpactSummary } from "../../../shared/sql-ident.js";
import { SqlCodeBlock } from "./SqlCodeBlock.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface DdlCardProps {
  title: string;
  sql: string;
  impact: DdlImpactSummary;
  elapsed?: string;
}

export function DdlCard(props: DdlCardProps): React.ReactElement {
  const { impact } = props;
  const counts = [
    impact.tablesCreated.length > 0 ? `${impact.tablesCreated.length} table(s) created` : null,
    impact.tablesAltered.length > 0 ? `${impact.tablesAltered.length} table(s) altered` : null,
    impact.tablesDropped.length > 0 ? `${impact.tablesDropped.length} table(s) dropped` : null,
    impact.indexesCreated.length > 0 ? `${impact.indexesCreated.length} index(es)` : null,
    impact.foreignKeys.length > 0 ? `${impact.foreignKeys.length} FK(s)` : null,
  ].filter(Boolean);

  return (
    <ToolCardShell
      title={props.title}
      badge="DDL"
      warning={impact.warning}
      elapsed={props.elapsed}
      showEnvBadge
    >
      {counts.length > 0 ? (
        <div className="cb-tv-impact-row">
          {counts.map((item) => (
            <span key={item} className="cb-tv-chip">
              {item}
            </span>
          ))}
        </div>
      ) : null}
      {impact.impacts.length > 0 ? (
        <ul className="cb-tv-impact-list">
          {impact.impacts.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <SqlCodeBlock sql={props.sql} />
    </ToolCardShell>
  );
}
