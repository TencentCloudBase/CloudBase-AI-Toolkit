import * as React from "react";
import type { MutationSummary } from "../../lib/toolview-parsers.js";
import { SqlCodeBlock } from "./SqlCodeBlock.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface MutationCardProps {
  title: string;
  summary: MutationSummary;
}

export function MutationCard(props: MutationCardProps): React.ReactElement {
  const { summary } = props;
  return (
    <ToolCardShell
      title={props.title}
      badge="DML"
      warning={summary.verb === "DELETE"}
      elapsed={summary.elapsed}
      showEnvBadge
    >
      <div className="cb-tv-impact-row">
        <span className="cb-tv-chip">{summary.verb}</span>
        {summary.rowCount !== undefined ? (
          <span className="cb-tv-chip accent">
            {summary.rowCount} row{summary.rowCount === 1 ? "" : "s"} affected
          </span>
        ) : (
          <span className="cb-tv-chip muted">Row count pending</span>
        )}
      </div>
      <SqlCodeBlock sql={summary.sql} />
    </ToolCardShell>
  );
}
