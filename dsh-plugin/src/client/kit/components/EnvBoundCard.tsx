import * as React from "react";
import { getBlockArgs, parseAuthResult, type ToolBlock } from "../../lib/parse-tool-result.js";
import { ToolCardShell } from "./ToolCardShell.js";

export interface EnvBoundCardProps {
  toolName?: string;
  block?: ToolBlock;
}

export function EnvBoundCard(props: EnvBoundCardProps): React.ReactElement {
  const toolName = props.toolName ?? props.block?.toolName ?? "auth";
  const args = getBlockArgs(props.block);
  const parsed = parseAuthResult(props.block);
  const envId = parsed.envId ?? (typeof args.envId === "string" ? args.envId : undefined);
  const statusLabel = parsed.ok ? "已绑定" : "绑定失败";
  const tone = parsed.ok ? "ok" : "error";

  React.useEffect(() => {
    if (parsed.ok && envId) {
      window.dispatchEvent(new CustomEvent("cloudbase-dsh:env-bound", { detail: envId }));
    }
  }, [parsed.ok, envId]);

  return (
    <ToolCardShell
      title={`${toolName} · set_env`}
      subtitle={statusLabel}
      tone={tone}
      warnings={parsed.ok ? [] : [parsed.message ?? "环境绑定未完成"]}
    >
      <div className="cb-kv-grid">
        <div className="cb-kv">
          <div className="k">环境 ID</div>
          <div className="v">{envId ?? "—"}</div>
        </div>
        <div className="cb-kv">
          <div className="k">别名</div>
          <div className="v">{parsed.alias ?? "—"}</div>
        </div>
        <div className="cb-kv">
          <div className="k">状态</div>
          <div className="v">{statusLabel}</div>
        </div>
        {parsed.code ? (
          <div className="cb-kv">
            <div className="k">Code</div>
            <div className="v">{parsed.code}</div>
          </div>
        ) : null}
      </div>
    </ToolCardShell>
  );
}
