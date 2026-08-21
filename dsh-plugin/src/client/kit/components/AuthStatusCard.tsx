import * as React from "react";
import { IconCheck, IconWarn } from "../../lib/icons.js";
import type { AuthStatusSummary } from "../../lib/toolview-parsers.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface AuthStatusCardProps {
  title: string;
  summary: AuthStatusSummary;
}

export function AuthStatusCard(props: AuthStatusCardProps): React.ReactElement {
  const { summary } = props;
  const statusLabel = summary.signedIn ? "已登录" : summary.action === "start_auth" ? "待授权" : "未登录";

  return (
    <ToolCardShell
      title={props.title}
      badge={summary.action}
      warning={!summary.signedIn && summary.action !== "start_auth"}
      statusLabel={statusLabel}
    >
      <div className="cb-auth-state">
        <div className="cb-auth-row">
          <span>Auth</span>
          <span className="v">
            {summary.signedIn ? <IconCheck /> : <IconWarn />}
            {statusLabel}
          </span>
        </div>
        {summary.envId ? (
          <div className="cb-auth-row">
            <span>Environment</span>
            <span className="v full">{summary.envId}</span>
          </div>
        ) : null}
        {summary.authMode ? (
          <div className="cb-auth-row">
            <span>Mode</span>
            <span>{summary.authMode}</span>
          </div>
        ) : null}
        {summary.verificationUrl ? (
          <div className="cb-auth-row">
            <span>Verification URL</span>
            <a className="cb-link v full" href={summary.verificationUrl} target="_blank" rel="noreferrer">
              {summary.verificationUrl}
            </a>
          </div>
        ) : null}
        {summary.userCode ? (
          <div className="cb-auth-row">
            <span>User code</span>
            <span className="v full">{summary.userCode}</span>
          </div>
        ) : null}
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
