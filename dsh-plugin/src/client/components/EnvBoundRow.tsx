import * as React from "react";
import { IconCheck } from "../lib/icons.js";
import { ensureStyles } from "../styles.js";

interface EnvBoundNode {
  type?: string;
  toolName?: string;
  name?: string;
  block?: { args?: unknown };
}

/**
 * turnTail 一行：会话里模型调用 `auth set_env` 后渲染"已绑定环境"，
 * 并派发 cloudbase-dsh:env-bound 事件，让右侧 EnvSelector 与环境选择保持联动。
 */
export function EnvBoundRow(props: { matched?: unknown; nodes?: EnvBoundNode[] }): React.ReactElement | null {
  ensureStyles();
  const matchedNodes = Array.isArray(props.matched) ? (props.matched as EnvBoundNode[]) : [];
  const nodes = props.nodes ?? matchedNodes;
  const bound = [...nodes]
    .reverse()
    .find((node) => {
      const name = `${node.toolName ?? node.name ?? ""}`;
      if (!name.includes("auth")) return false;
      const args = (node.block?.args ?? {}) as Record<string, unknown>;
      return args.action === "set_env" && typeof args.envId === "string";
    });
  const envId = bound ? String((bound.block?.args as Record<string, unknown>).envId) : undefined;

  React.useEffect(() => {
    if (envId) {
      window.dispatchEvent(new CustomEvent("cloudbase-dsh:env-bound", { detail: envId }));
      window.dispatchEvent(new CustomEvent("cloudbase-dsh:env-changed", { detail: envId }));
    }
  }, [envId]);

  if (!envId) return null;

  return (
    <div className="cb-root">
      <div className="cb-deliverable">
        <IconCheck />
        <span>已绑定环境</span>
        <span className="f">{envId}</span>
      </div>
    </div>
  );
}
