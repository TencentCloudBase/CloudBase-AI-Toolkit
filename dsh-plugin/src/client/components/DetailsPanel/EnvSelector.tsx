import * as React from "react";
import type { AuthStatus, CloudBaseData, EnvItem } from "../../../shared/types.js";
import { appendUserMessage } from "../../lib/typert.js";

/** 右侧面板顶部 header：登录后显示环境下拉（单行），选中后调用 auth set_env 切换当前环境。 */
export function EnvSelector(props: {
  data?: CloudBaseData;
  currentEnvId?: string;
  busy?: boolean;
  onChanged?: (status: AuthStatus) => void;
  onError?: (message: string) => void;
}): React.ReactElement {
  const [envs, setEnvs] = React.useState<EnvItem[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);
  // 与会话 MCP 联动的环境：模型在对话里调用 auth set_env 后，EnvBoundRow 派发
  // env-bound 事件，这里同步显示；手动下拉切换时也会派发，保证两侧一致。
  const [syncedEnvId, setSyncedEnvId] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!props.data) return;
    let cancelled = false;
    void props.data
      .listEnvironments()
      .then((items) => {
        if (!cancelled) setEnvs(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [props.data]);

  React.useEffect(() => {
    const onBound = (event: Event) => {
      const envId = (event as CustomEvent<string>).detail;
      if (envId) setSyncedEnvId(envId);
    };
    window.addEventListener("cloudbase-dsh:env-bound", onBound);
    return () => window.removeEventListener("cloudbase-dsh:env-bound", onBound);
  }, []);

  const selectEnv = async (envId: string) => {
    if (!props.data || !envId) return;
    setError(undefined);
    try {
      const status = await props.data.setEnvironment(envId);
      // 手动切换也广播给本面板（保持 select 与绑定一致）。
      window.dispatchEvent(new CustomEvent("cloudbase-dsh:env-bound", { detail: envId }));
      props.onChanged?.(status);
      // 反向联动：注入 user 消息让模型在会话里执行 set_env，
      // 使对话侧 MCP 与右侧面板绑定同一环境（用户"右边切了左边对话还是旧的"）。
      try {
        await appendUserMessage(
          props.data,
          `请调用 mcp__cloudbase__auth action=set_env envId=${envId}，绑定后无需解释，直接回复"已绑定"。`,
        );
      } catch (appendErr: unknown) {
        console.warn("[cloudbase] session append skipped:", appendErr instanceof Error ? appendErr.message : appendErr);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      props.onError?.(message);
    }
  };

  const effectiveEnvId = syncedEnvId ?? props.currentEnvId;
  const current = envs.find((env) => env.envId === effectiveEnvId);

  // header 单行布局：只渲染 select，错误/空态通过 title 提示，不撑开行高。
  return (
    <div className="cb-env-select">
      <select
        className="cb-select"
        value={effectiveEnvId ?? ""}
        disabled={Boolean(props.busy) || envs.length === 0}
        onChange={(event) => void selectEnv(event.target.value)}
        title={error ?? (envs.length === 0 ? "未获取到环境列表" : "当前环境")}
      >
        <option value="" disabled>
          {envs.length === 0
            ? "环境加载中…"
            : current
              ? `当前：${current.alias || current.envId}`
              : "选择环境…"}
        </option>
        {envs.map((env) => (
          <option key={env.envId} value={env.envId}>
            {env.alias ? `${env.alias} (${env.envId})` : env.envId}
            {env.region ? ` · ${env.region}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
