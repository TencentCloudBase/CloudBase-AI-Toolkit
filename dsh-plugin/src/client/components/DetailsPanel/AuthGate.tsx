import * as React from "react";
import type { AuthStatus, CloudBaseData, LoginMethod } from "../../../shared/types.js";
import { IconLock } from "../../lib/icons.js";
import { friendlyError } from "../../lib/parse-tool-result.js";
import { Toast } from "../../kit/components/Toast.js";

type AuthPhase = "unknown" | "unsigned" | "pending" | "signed-in";

function resolvePhase(status: AuthStatus | undefined): AuthPhase {
  if (!status) return "unknown";
  if (status.signedIn) return "signed-in";
  if (status.verificationUrl) return "pending";
  return "unsigned";
}

/**
 * Right panel auth gate with spec §2 state machine:
 * UNKNOWN → unsigned (pick method) → pending (device-code poll) → signed-in.
 * Never marks signed-in without valid credentials (server-side probe).
 */
export function AuthGate(props: {
  data?: CloudBaseData;
  children: (render: { status: AuthStatus; setStatus: (s: AuthStatus) => void }) => React.ReactNode;
}): React.ReactElement {
  const [status, setStatus] = React.useState<AuthStatus | undefined>(undefined);
  const [phase, setPhase] = React.useState<AuthPhase>("unknown");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [apiKeyForm, setApiKeyForm] = React.useState({ envId: "", apiKey: "" });

  const refresh = React.useCallback(async () => {
    if (!props.data) {
      setLoading(false);
      return;
    }
    try {
      const next = await props.data.authStatus();
      setStatus(next);
      setPhase(resolvePhase(next));
      setError(undefined);
    } catch (err: unknown) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, [props.data]);

  const startLogin = React.useCallback(
    async (method: LoginMethod, params?: { envId?: string; apiKey?: string }) => {
      if (!props.data?.startLogin) {
        if (method === "device-code" && props.data?.startAuth) {
          const next = await props.data.startAuth();
          setStatus(next);
          setPhase(resolvePhase(next));
          return;
        }
        setError("登录接口不可用");
        return;
      }
      setLoading(true);
      setError(undefined);
      try {
        const next = await props.data.startLogin(method, params);
        setStatus(next);
        setPhase(resolvePhase(next));
      } catch (err: unknown) {
        setError(friendlyError(err instanceof Error ? err.message : String(err)));
      } finally {
        setLoading(false);
      }
    },
    [props.data],
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!props.data?.authStateChange) return;
    return props.data.authStateChange((next) => {
      setStatus(next);
      setPhase(resolvePhase(next));
    });
  }, [props.data]);

  React.useEffect(() => {
    if (phase !== "pending") return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [phase, refresh]);

  if (loading && phase === "unknown") {
    return (
      <div className="cb-root" style={{ height: "100%" }}>
        <div className="cb-dpanel">
          <div className="cb-placeholder">正在检查登录状态…</div>
        </div>
      </div>
    );
  }

  if (phase !== "signed-in") {
    const options = status?.loginOptions ?? [
      { method: "device-code" as const, title: "Device code" },
      { method: "apikey" as const, title: "API Key" },
    ];
    return (
      <div className="cb-root" style={{ height: "100%" }}>
        <div className="cb-dpanel">
          <div className="cb-auth-head">
            <IconLock />
            <span>需要登录</span>
          </div>
          <div className="cb-placeholder" style={{ margin: "8px 0" }}>
            {status?.message ?? "未登录。请选择登录方式访问 CloudBase。"}
          </div>
          {phase === "pending" && status?.verificationUrl ? (
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
            <div className="cb-auth-methods" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {options.map((opt) => (
                <button
                  key={opt.method}
                  className="cb-btn primary"
                  type="button"
                  disabled={loading}
                  onClick={() => void startLogin(opt.method)}
                >
                  {opt.title}
                </button>
              ))}
              <details className="cb-hint">
                <summary>API Key 登录</summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  <input
                    className="cb-input"
                    placeholder="EnvId"
                    value={apiKeyForm.envId}
                    onChange={(e) => setApiKeyForm((s) => ({ ...s, envId: e.target.value }))}
                  />
                  <input
                    className="cb-input"
                    placeholder="API Key"
                    type="password"
                    value={apiKeyForm.apiKey}
                    onChange={(e) => setApiKeyForm((s) => ({ ...s, apiKey: e.target.value }))}
                  />
                  <button
                    className="cb-btn"
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void startLogin("apikey", {
                        envId: apiKeyForm.envId.trim(),
                        apiKey: apiKeyForm.apiKey.trim(),
                      })
                    }
                  >
                    使用 API Key 登录
                  </button>
                </div>
              </details>
            </div>
          )}
          {error ? <div className="cb-error" style={{ marginTop: 8 }}>{error}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <>
      {status?.envId ? (
        <React.Fragment key={status.envId}>
          {props.children({ status: status!, setStatus })}
        </React.Fragment>
      ) : (
        props.children({ status: status!, setStatus })
      )}
      {error ? (
        <Toast
          message={error}
          tone="error"
          autoCloseMs={5000}
          onClose={() => setError(undefined)}
        />
      ) : null}
    </>
  );
}
