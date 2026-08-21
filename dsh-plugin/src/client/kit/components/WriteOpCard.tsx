import * as React from "react";
import type { SqlRiskAssessment } from "../../../shared/sql-ident.js";
import { IconWarn } from "../../lib/icons.js";
import { ensureStyles } from "../../styles.js";
import { SqlCodeBlock } from "./SqlCodeBlock.js";

export type WriteOpDecision = "pending" | "skipped" | "confirmed";

export interface WriteOpCardProps {
  title?: string;
  subtitle?: string;
  sql: string;
  risk: SqlRiskAssessment;
  language?: "sql" | "json";
  decision?: WriteOpDecision;
  onSkip?: () => void;
  onRun?: () => void;
  /** When true, renders as a centered modal overlay. */
  modal?: boolean;
}

function riskLabel(risk: SqlRiskAssessment): string | undefined {
  switch (risk.risk) {
    case "destructive":
      return "Destructive change";
    case "schema_change":
      return "Schema change (DDL)";
    case "security_change":
      return "Security / GRANT / RLS";
    case "normal_write":
      return "Data change (DML)";
    case "unknown_risk":
      return "Review carefully";
    default:
      return undefined;
  }
}

export function WriteOpCard(props: WriteOpCardProps): React.ReactElement {
  ensureStyles();
  const [ack, setAck] = React.useState(false);
  const decision = props.decision ?? "pending";
  const highRisk = props.risk.requiresAck;
  const runDisabled = decision !== "pending" || (highRisk && !ack);

  const body = (
    <div className={`cb-write-op${props.modal ? " modal" : ""}`}>
      <div className="cb-write-op-head">
        <strong>{props.title ?? "Write operation"}</strong>
        {props.subtitle ? <span className="cb-write-op-sub">{props.subtitle}</span> : null}
      </div>
      {highRisk ? (
        <div className="cb-write-op-warn" role="alert">
          <IconWarn />
          <div>
            <div className="cb-write-op-warn-title">{riskLabel(props.risk) ?? "High impact"}</div>
            <div className="cb-write-op-warn-body">This action cannot be undone.</div>
          </div>
        </div>
      ) : null}
      <SqlCodeBlock sql={props.sql} language={props.language} />
      {highRisk && decision === "pending" ? (
        <label className="cb-write-op-ack">
          <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
          <span>I understand this change may be irreversible.</span>
        </label>
      ) : null}
      {decision === "skipped" ? (
        <div className="cb-write-op-status skipped">Skipped — this write was not sent to the agent.</div>
      ) : null}
      {decision === "confirmed" ? (
        <div className="cb-write-op-status confirmed">Run Query sent — waiting for agent execution.</div>
      ) : null}
      {decision === "pending" ? (
        <div className="cb-write-op-actions">
          <button className="cb-btn" type="button" onClick={props.onSkip}>
            Skip
          </button>
          <button className="cb-btn primary" type="button" disabled={runDisabled} onClick={props.onRun}>
            Run Query
          </button>
        </div>
      ) : null}
    </div>
  );

  if (!props.modal) return body;

  return (
    <div className="cb-mask" role="dialog" aria-modal="true">
      <div className="cb-dialog cb-dialog-wide">{body}</div>
    </div>
  );
}
