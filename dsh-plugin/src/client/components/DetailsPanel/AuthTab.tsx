import * as React from "react";
import type { AppAuthConfig, AuthStatus, CloudBaseData } from "../../../shared/types.js";
import { appendUserMessage } from "../../lib/typert.js";
import { IconCheck, IconLock } from "../../lib/icons.js";
import { friendlyError } from "../../lib/parse-tool-result.js";

export function AuthTab(props: { data?: CloudBaseData }): React.ReactElement {
  const [status, setStatus] = React.useState<AuthStatus | undefined>(undefined);
  const [config, setConfig] = React.useState<AppAuthConfig | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!props.data) {
      setError("cloudbaseData 服务未注入。");
      return;
    }
    void Promise.all([props.data.authStatus(), props.data.appAuthConfig()])
      .then(([nextStatus, nextConfig]) => {
        setStatus(nextStatus);
        setConfig(nextConfig);
        setError(undefined);
      })
      .catch((err: unknown) => setError(friendlyError(err instanceof Error ? err.message : String(err))));
  }, [props.data]);

  const startLogin = async () => {
    await appendUserMessage(
      props.data,
      "请调用 mcp__cloudbase__auth action=start_auth authMode=device，并返回 verification URL 让我在浏览器完成授权。不要使用 API Key。",
    );
  };

  return (
    <div className="cb-dpanel">
      {error ? <div className="cb-error">{error}</div> : null}
      <div className="cb-auth-state">
        <div className="cb-auth-head">
          <IconLock />
          <span>认证状态</span>
          <span className="cb-spacer" />
          {status?.signedIn ? (
            <span className="cb-ok">
              <IconCheck />
              已登录
            </span>
          ) : (
            <button className="cb-btn primary" type="button" onClick={() => void startLogin()}>
              device-code 登录
            </button>
          )}
        </div>
        <div className="cb-auth-row">
          <span>当前环境</span>
          <span className="v">{status?.envId ?? "—"}</span>
        </div>
        <div className="cb-auth-row">
          <span>授权方式</span>
          <span className="v">
            {status?.authMode ?? "—"}
            {status?.persisted ? " · 已持久化" : ""}
          </span>
        </div>
        <div className="cb-auth-row">
          <span>临时密钥</span>
          <span className="v">{status?.tempCredentialsAvailable ? "可用（get_temp_credentials）" : "未获取"}</span>
        </div>
        {status?.verificationUrl ? (
          <div className="cb-auth-row">
            <span>授权链接</span>
            <a className="cb-link" href={status.verificationUrl} target="_blank" rel="noreferrer">
              打开
            </a>
          </div>
        ) : null}
      </div>
      <div className="cb-tree-sec">登录方式</div>
      <div className="cb-env-list" style={{ paddingTop: 4 }}>
        {(config?.providers ?? []).map((provider) => (
          <div className="cb-env-row" key={provider.name}>
            <span className="k">{provider.name}</span>
            <span className="v">{provider.enabled ? <span className="cb-ok">已启用</span> : "已停用"}</span>
          </div>
        ))}
        {(config?.providers?.length ?? 0) === 0 ? (
          <div className="cb-placeholder">未查询到登录方式配置（当前环境可能未启用应用认证）</div>
        ) : null}
      </div>
      {status && !status.signedIn ? (
        <div className="cb-placeholder">{status.message}</div>
      ) : null}
    </div>
  );
}
