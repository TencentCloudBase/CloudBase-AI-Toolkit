import * as React from "react";
import type { AuthStatus, CloudBaseData, EnvItem } from "../../../shared/types.js";
import { IconCheck } from "../../lib/icons.js";

/** 右侧面板顶部：登录后显示环境下拉，选中后调用 auth set_env 切换当前环境。 */
export function EnvSelector(props: {
  data?: CloudBaseData;
  currentEnvId?: string;
  busy?: boolean;
  onChanged?: (status: AuthStatus) => void;
  onError?: (message: string) => void;
}): React.ReactElement {
  const [envs, setEnvs] = React.useState<EnvItem[]>([]);
  const [error, setError] = React.useState<string | undefined>(undefined);

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

  const selectEnv = async (envId: string) => {
    if (!props.data || !envId) return;
    setError(undefined);
    try {
      const status = await props.data.setEnvironment(envId);
      props.onChanged?.(status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      props.onError?.(message);
    }
  };

  const current = envs.find((env) => env.envId === props.currentEnvId);

  return (
    <div className="cb-env-select">
      {error ? <div className="cb-error">{error}</div> : null}
      {envs.length > 0 ? (
        <select
          className="cb-select"
          value={props.currentEnvId ?? ""}
          disabled={Boolean(props.busy)}
          onChange={(event) => void selectEnv(event.target.value)}
          title="当前环境"
        >
          <option value="" disabled>
            {current ? `当前：${current.alias || current.envId}` : "选择环境…"}
          </option>
          {envs.map((env) => (
            <option key={env.envId} value={env.envId}>
              {env.alias ? `${env.alias} (${env.envId})` : env.envId}
              {env.region ? ` · ${env.region}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <div className="cb-hint">未获取到环境列表，请先登录或检查网络。</div>
      )}
    </div>
  );
}
