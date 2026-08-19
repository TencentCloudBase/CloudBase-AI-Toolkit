import * as React from "react";
import { IconCheck, IconWarn } from "../../lib/icons.js";
import { ensureStyles } from "../../styles.js";

export interface ToolCardShellProps {
  title: string;
  subtitle?: string;
  elapsed?: string;
  warnings?: string[];
  children: React.ReactNode;
  tone?: "ok" | "warn" | "error";
}

export function ToolCardShell(props: ToolCardShellProps): React.ReactElement {
  ensureStyles();
  const tone = props.tone ?? "ok";
  return (
    <div className="cb-root">
      <div className="cb-toolcard">
        <div className="cb-tc-head">
          <span className={tone === "ok" ? "cb-st" : "cb-st cb-st-warn"}>
            {tone === "warn" || tone === "error" ? <IconWarn /> : <IconCheck />}
          </span>
          <span className="cb-name">{props.title}</span>
          {props.subtitle ? <span className="cb-card-sub">{props.subtitle}</span> : null}
          <span className="cb-spacer" />
          {props.elapsed ? <span>{props.elapsed}</span> : null}
        </div>
        {props.warnings && props.warnings.length > 0 ? (
          <div className="cb-warn-list">
            {props.warnings.map((warning) => (
              <div key={warning} className="cb-warn-chip">
                <IconWarn />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="cb-card-body">{props.children}</div>
      </div>
    </div>
  );
}
