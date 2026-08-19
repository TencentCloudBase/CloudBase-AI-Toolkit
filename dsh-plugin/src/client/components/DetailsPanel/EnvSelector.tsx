import * as React from "react";
import type { AuthStatus, CloudBaseData } from "../../../shared/types.js";
import { EnvSelect } from "../../kit/components/EnvSelect.js";
import { appendUserMessage } from "../../lib/typert.js";
import { KIT_EVENTS } from "../../kit/provider.js";

/**
 * CloudBase 环境选择器（cloudbase 专用包装）：基于通用 kit 组件 EnvSelect。
 *
 * 双向联动：
 * - 打开面板时从会话工具历史读取最近一次 auth set_env 的 envId（sessionBoundEnv），
 *   同步显示并让 bridge 数据通道也绑定，保证右侧与对话侧一致；
 * - 手动下拉切换后 appendToSession 注入消息让模型在会话里也 set_env。
 */
export function EnvSelector(props: {
  data?: CloudBaseData;
  currentEnvId?: string;
  busy?: boolean;
  sessionId?: string;
  onChanged?: (status: AuthStatus) => void;
  onError?: (message: string) => void;
}): React.ReactElement {
  const { data, sessionId } = props;

  // 打开时：从会话历史恢复绑定，避免"对话已绑定 mcp-pg 但面板仍显示选择环境"。
  React.useEffect(() => {
    if (!data?.sessionBoundEnv) return;
    let cancelled = false;
    void data
      .sessionBoundEnv(sessionId)
      .then(async (envId) => {
        if (!envId || cancelled) return;
        // 1. 广播给 EnvSelect 显示
        window.dispatchEvent(new CustomEvent(KIT_EVENTS.envBound, { detail: envId }));
        // 2. 同步 bridge 数据通道（若面板当前环境与会话不一致）
        if (envId !== props.currentEnvId) {
          try {
            const status = await data.setEnvironment(envId);
            if (!cancelled) props.onChanged?.(status);
          } catch {
            // bridge 绑定失败不阻塞显示，用户可手动下拉
          }
        }
      })
      .catch(() => {
        // 会话历史不可读时静默——保持现状
      });
    return () => {
      cancelled = true;
    };
  }, [data, sessionId, props.currentEnvId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <EnvSelect
      provider={data}
      currentEnvId={props.currentEnvId}
      busy={props.busy}
      onChanged={props.onChanged}
      onError={props.onError}
      onSwitched={(envId) => {
        if (!data) return;
        // 反向联动：让对话侧 MCP 与右侧面板绑定同一环境。
        void appendUserMessage(
          data,
          `请调用 mcp__cloudbase__auth action=set_env envId=${envId}，绑定后无需解释，直接回复"已绑定"。`,
        ).catch((err: unknown) => {
          console.warn("[cloudbase] session append skipped:", err instanceof Error ? err.message : err);
        });
      }}
    />
  );
}
