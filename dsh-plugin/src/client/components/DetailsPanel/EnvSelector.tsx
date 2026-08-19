import * as React from "react";
import type { AuthStatus, CloudBaseData } from "../../../shared/types.js";
import { EnvSelect } from "../../kit/components/EnvSelect.js";
import { appendUserMessage } from "../../lib/typert.js";

/**
 * CloudBase 环境选择器（cloudbase 专用包装）：基于通用 kit 组件 EnvSelect，
 * 注入会话反向联动 —— 面板下拉切换后 appendToSession 让模型在会话里也 set_env。
 */
export function EnvSelector(props: {
  data?: CloudBaseData;
  currentEnvId?: string;
  busy?: boolean;
  onChanged?: (status: AuthStatus) => void;
  onError?: (message: string) => void;
}): React.ReactElement {
  return (
    <EnvSelect
      provider={props.data}
      currentEnvId={props.currentEnvId}
      busy={props.busy}
      onChanged={props.onChanged}
      onError={props.onError}
      onSwitched={(envId) => {
        if (!props.data) return;
        // 反向联动：让对话侧 MCP 与右侧面板绑定同一环境。
        void appendUserMessage(
          props.data,
          `请调用 mcp__cloudbase__auth action=set_env envId=${envId}，绑定后无需解释，直接回复"已绑定"。`,
        ).catch((err: unknown) => {
          console.warn("[cloudbase] session append skipped:", err instanceof Error ? err.message : err);
        });
      }}
    />
  );
}
