import * as React from "react";
import type { CloudBaseData } from "../../shared/types.js";
import { buildRunQueryMessage, extractWriteOp } from "../../shared/write-op.js";
import { appendUserMessage } from "../lib/typert.js";
import type { ToolBlock } from "../lib/parse-tool-result.js";
import { DataTableCard } from "./DataTableCard.js";
import { WriteOpCard, type WriteOpDecision } from "../kit/components/WriteOpCard.js";
import { ensureStyles } from "../styles.js";

export interface WriteOpToolCardProps {
  callId?: string;
  toolName?: string;
  block?: ToolBlock;
  cloudbaseData?: CloudBaseData;
}

function argsRawFromBlock(block: ToolBlock | undefined): string | undefined {
  if (!block) return undefined;
  const settled = block as ToolBlock & { kind?: string; call?: { argsRaw?: string } };
  if (settled.kind !== undefined && settled.call?.argsRaw) return settled.call.argsRaw;
  return block.argsRaw ?? (typeof block.args === "string" ? block.args : undefined);
}

function needsUserGate(op: NonNullable<ReturnType<typeof extractWriteOp>>): boolean {
  return !op.confirmed || op.risk.requiresAck;
}

export function WriteOpToolCard(props: WriteOpToolCardProps): React.ReactElement {
  ensureStyles();
  const toolName = props.toolName ?? props.block?.toolName ?? props.block?.name ?? "tool";
  const argsRaw = argsRawFromBlock(props.block);
  const op = extractWriteOp(toolName, argsRaw);
  const settled = props.block?.kind !== undefined;
  const [decision, setDecision] = React.useState<WriteOpDecision>("pending");

  React.useEffect(() => {
    setDecision("pending");
  }, [props.callId, argsRaw]);

  if (!op) {
    return React.createElement(DataTableCard, props);
  }

  const gate = needsUserGate(op);
  const interactive = gate && decision === "pending";
  const displayDecision: WriteOpDecision = interactive
    ? "pending"
    : decision !== "pending"
      ? decision
      : settled && op.confirmed
        ? "confirmed"
        : "pending";

  const skip = () => setDecision("skipped");

  const run = () => {
    void appendUserMessage(props.cloudbaseData, buildRunQueryMessage(op)).then(() => {
      setDecision("confirmed");
    });
  };

  return (
    <div className="cb-toolcard cb-write-op-tool">
      <div className="cb-tc-head">
        <span className="cb-name">{op.label}</span>
        <span className="cb-spacer" />
        <span className="cb-st">{settled ? "Settled" : "Review required"}</span>
      </div>
      <WriteOpCard
        title={op.label}
        subtitle={op.action ? `action=${op.action}` : undefined}
        sql={op.sql}
        risk={op.risk}
        language={op.kind === "nosql" ? "json" : "sql"}
        decision={displayDecision}
        onSkip={interactive ? skip : undefined}
        onRun={interactive ? run : undefined}
      />
      {settled && op.confirmed ? (
        <div className="cb-write-op-result">{React.createElement(DataTableCard, props)}</div>
      ) : null}
    </div>
  );
}

export function makeWriteOpToolCard(data?: CloudBaseData): typeof WriteOpToolCard {
  return function BoundWriteOpToolCard(props: Omit<WriteOpToolCardProps, "cloudbaseData">) {
    return React.createElement(WriteOpToolCard, { ...props, cloudbaseData: data });
  };
}
