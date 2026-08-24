import * as React from "react";
import type { AuthStatus, EnvItem } from "../../../shared/types.js";
import { KIT_EVENTS, type PlatformProvider } from "../provider.js";
import { friendlyError } from "../../lib/parse-tool-result.js";

export interface EnvSelectProps {
  provider?: PlatformProvider;
  currentEnvId?: string;
  busy?: boolean;
  onChanged?: (status: AuthStatus) => void;
  onError?: (message: string) => void;
  /** 手动切换环境成功后的回调（业务侧可注入反向联动，如让会话模型 set_env）。 */
  onSwitched?: (envId: string) => void;
}

/**
 * 通用环境选择器（kit 组件）：从 provider.listEnvironments() 拉取环境，
 * 选中后 provider.setEnvironment() 切换。通过 KIT_EVENTS.envBound 与其他
 * kit 组件（认证面板等）保持联动；不绑定具体云实现。
 */
export function EnvSelect(props: EnvSelectProps): React.ReactElement {
  const [envs, setEnvs] = React.useState<EnvItem[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [syncedEnvId, setSyncedEnvId] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!props.provider) return;
    let cancelled = false;
    void props.provider
      .listEnvironments()
      .then((items) => {
        if (!cancelled) setEnvs(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(friendlyError(err instanceof Error ? err.message : String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [props.provider]);

  React.useEffect(() => {
    const onBound = (event: Event) => {
      const envId = (event as CustomEvent<string>).detail;
      if (envId) setSyncedEnvId(envId);
    };
    window.addEventListener(KIT_EVENTS.envBound, onBound);
    return () => window.removeEventListener(KIT_EVENTS.envBound, onBound);
  }, []);

  const selectEnv = async (envId: string) => {
    if (!props.provider || !envId) return;
    setError(undefined);
    window.dispatchEvent(new CustomEvent(KIT_EVENTS.envChanging));
    try {
      const status = await props.provider.setEnvironment(envId);
      window.dispatchEvent(new CustomEvent(KIT_EVENTS.envBound, { detail: envId }));
      window.dispatchEvent(new CustomEvent(KIT_EVENTS.envChanged, { detail: envId }));
      props.onSwitched?.(envId);
      props.onChanged?.(status);
    } catch (err: unknown) {
      const message = friendlyError(err instanceof Error ? err.message : String(err));
      setError(message);
      props.onError?.(message);
    }
  };

  const effectiveEnvId = syncedEnvId ?? props.currentEnvId;
  const current = envs.find((env) => env.envId === effectiveEnvId);
  // When the active env is missing from listEnvironments(), browsers fall back to
  // highlighting envs[0] while the EnvId card still shows the real id — inject it.
  const envCandidates: EnvItem[] =
    effectiveEnvId && !current
      ? [
          {
            envId: effectiveEnvId,
            alias: "非列表中的活跃环境",
          },
          ...envs,
        ]
      : envs;

  // 单行布局：只渲染 select，错误/空态通过 title 提示，不撑开行高。
  return (
    <div className="cb-env-select">
      <select
        className="cb-select"
        value={effectiveEnvId ?? ""}
        disabled={Boolean(props.busy) || envCandidates.length === 0}
        onChange={(event) => void selectEnv(event.target.value)}
        title={
          error ??
          (envCandidates.length === 0
            ? "未获取到环境列表"
            : !current && effectiveEnvId
              ? `活跃环境不在列表中：${effectiveEnvId}`
              : "当前环境")
        }
      >
        <option value="" disabled>
          {envCandidates.length === 0
            ? "环境加载中…"
            : current
              ? `当前：${current.alias || current.envId}`
              : effectiveEnvId
                ? `当前：非列表中的活跃环境 (${effectiveEnvId})`
                : "选择环境…"}
        </option>
        {envCandidates.map((env) => (
          <option key={env.envId} value={env.envId}>
            {env.alias ? `${env.alias} (${env.envId})` : env.envId}
            {env.region ? ` · ${env.region}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
