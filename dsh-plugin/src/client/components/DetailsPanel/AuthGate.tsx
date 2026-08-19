import * as React from "react";
import type { AuthStatus, CloudBaseData } from "../../../shared/types.js";
import { IconLock } from "../../lib/icons.js";
import { EnvSelector } from "./EnvSelector.js";

/**
 * 右侧面板登录门：
 * - 未登录：显示 device-code 登录引导（调用 start_auth 后展示 verification URL + user code），
 *   面板其余 tab 不渲染（避免空/报错状态）。
 * - 已登录：顶部显示环境选择器，下方渲染真实 tab 内容。
 */
export function AuthGate(props: {
  data?: CloudBaseData;
  children: React.ReactNode;
}): React.ReactElement {
  const [status, setStatus] = React.useState<AuthStatus | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [polling, setPolling] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const refresh = React.useCallback(async () => {
    if (!props.data) {
      setLoading(false);
      return;
    }
    try {
      const next = await props.data.authStatus();
      setStatus(next);
      setError(undefined);
      setPolling(!next.signedIn && Boolean(next.verificationUrl));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [props.data]);

  const startLogin = React.useCallback(async () => {
    if (!props.data) {
      setError("数据通道不可用");
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const next = await props.data.startAuth();
      setStatus(next);
      setPolling(Boolean(next.verificationUrl));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [props.data]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // 授权进行中（PENDING）：轮询 status 直到登录完成，自动切换为已登录视图。
  React.useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [polling, refresh]);

  if (loading) {
    return (
      <div className="cb-root" style={{ height: "100%" }}>
        <div className="cb-dpanel">
          <div className="cb-placeholder">正在检查登录状态…</div>
        </div>
      </div>
    );
  }

  if (!status?.signedIn) {
    return (
      <div className="cb-root" style={{ height: "100%" }}>
        <div className="cb-dpanel">
          <div className="cb-auth-head">
            <IconLock />
            <span>需要登录</span>
          </div>
          {error ? <div className="cb-error">{error}</div> : null}
          <div className="cb-placeholder" style={{ margin: "8px 0" }}>
            {status?.message ?? "未登录。请通过 device-code 授权访问 CloudBase。"}
          </div>
          {status?.verificationUrl ? (
            <div className="cb-auth-state">
              <div className="cb-auth-row">
                <span>授权链接</span>
                <a className="cb-link" href={status.verificationUrl} target="_blank" rel="noreferrer">
                  在浏览器中打开
                </a>
              </div>
              {status.userCode ? (
                <div className="cb-auth-row">
                  <span>验证码</span>
                  <span className="v cb-mono">{status.userCode}</span>
                </div>
              ) : null}
              <div className="cb-hint">完成浏览器授权后，本面板会自动刷新。</div>
            </div>
          ) : (
            <button
              className="cb-btn"
              type="button"
              onClick={() => void startLogin()}
            >
              开始 device-code 登录
            </button>
          )}
          <div className="cb-hint" style={{ marginTop: 8 }}>
            授权后可用本面板直接查询数据库、存储、云函数与部署状态，无需在对话中逐条提问。
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <EnvSelector data={props.data} currentEnvId={status.envId} onChanged={setStatus} onError={setError} />
      {/* key=envId：切换环境后强制 remount 各 tab，重新拉取新环境的数据 */}
      {props.children && status.envId ? (
        <React.Fragment key={status.envId}>{props.children}</React.Fragment>
      ) : (
        props.children
      )}
    </>
  );
}
