import * as React from "react";
import { parseAuthResult, type ToolBlock } from "../../lib/parse-tool-result.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface AuthStatusCardProps {
  toolName?: string;
  block?: ToolBlock;
}

export function AuthStatusCard(props: AuthStatusCardProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? "auth";
  const parsed = parseAuthResult(props.block);
  const signedIn = parsed.signedIn ?? parsed.ok;
  const statusLabel = signedIn ? "已登录" : "未登录 / 待认证";

  return (
    <ToolCardShell
      title={`${toolName} · ${parsed.action}`}
      subtitle={statusLabel}
      tone={signedIn ? "ok" : "warn"}
      warnings={signedIn ? [] : [parsed.message ?? "请先完成 CloudBase 认证"]}
    >
      <div className="cb-kv-grid">
        <div className="cb-kv">
          <div className="k">登录状态</div>
          <div className="v">{statusLabel}</div>
        </div>
        {parsed.envId ? (
          <div className="cb-kv">
            <div className="k">当前环境</div>
            <div className="v">{parsed.envId}</div>
          </div>
        ) : null}
        {parsed.code ? (
          <div className="cb-kv">
            <div className="k">Code</div>
            <div className="v">{parsed.code}</div>
          </div>
        ) : null}
        {parsed.message ? (
          <div className="cb-kv cb-kv-wide">
            <div className="k">消息</div>
            <div className="v">{parsed.message}</div>
          </div>
        ) : null}
      </div>
    </ToolCardShell>
  );
}
