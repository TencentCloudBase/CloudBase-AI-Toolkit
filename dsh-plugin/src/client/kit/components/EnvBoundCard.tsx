import * as React from "react";
import { IconCheck, IconWarn } from "../../lib/icons.js";
import type { EnvBoundSummary } from "../../lib/toolview-parsers.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface EnvBoundCardProps {
  title: string;
  summary: EnvBoundSummary;
}

export function EnvBoundCard(props: EnvBoundCardProps): React.ReactElement {
  const { summary } = props;
  const statusLabel =
    summary.status === "bound" ? "已绑定" : summary.status === "failed" ? "绑定失败" : "未绑定";

  return (
    <ToolCardShell
      title={props.title}
      badge="set_env"
      warning={summary.status === "failed"}
      statusLabel={statusLabel}
    >
      <div className="cb-auth-state">
        <div className="cb-auth-row">
          <span>Environment ID</span>
          <span className="v full">{summary.envId ?? "—"}</span>
        </div>
        {summary.alias ? (
          <div className="cb-auth-row">
            <span>Alias</span>
            <span>{summary.alias}</span>
          </div>
        ) : null}
        <div className="cb-auth-row">
          <span>Status</span>
          <span className="v">
            {summary.status === "bound" ? <IconCheck /> : <IconWarn />}
            {statusLabel}
          </span>
        </div>
        {summary.message ? (
          <div className="cb-auth-row">
            <span>Message</span>
            <span>{summary.message}</span>
          </div>
        ) : null}
      </div>
    </ToolCardShell>
  );
}
