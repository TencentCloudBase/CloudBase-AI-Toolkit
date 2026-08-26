import * as React from "react";
import { IconCheck, IconWarn } from "../../lib/icons.js";
import { ensureStyles } from "../../styles.js";
import { EnvBadge } from "./EnvBadge.js";

export interface ToolCardShellProps {
  title: string;
  badge?: string;
  statusLabel?: string;
  warning?: boolean;
  elapsed?: string;
  showEnvBadge?: boolean;
  children: React.ReactNode;
}

/** Shared header/body shell for action-specific MCP toolview cards. */
export function ToolCardShell(props: ToolCardShellProps): React.ReactElement {
  ensureStyles();
  return (
    <div className="cb-root">
      <div className="cb-toolcard">
        <div className="cb-tc-head">
          <span className={`cb-st${props.warning ? " cb-st-warn" : ""}`}>
            {props.warning ? <IconWarn /> : <IconCheck />}
          </span>
          <span className="cb-name">{props.title}</span>
          {props.badge ? <span className="cb-tv-badge">{props.badge}</span> : null}
          {props.showEnvBadge ? <EnvBadge /> : null}
          <span className="cb-spacer" />
          {props.statusLabel ? <span>{props.statusLabel}</span> : null}
          {props.elapsed ? <span>{props.elapsed}</span> : null}
        </div>
        <div className="cb-tv-body">{props.children}</div>
      </div>
    </div>
  );
}
