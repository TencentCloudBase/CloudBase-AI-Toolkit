import * as React from "react";
import type { AuthStatus, CloudBaseData, EnvInfoView } from "../../../shared/types.js";
import {
  IconChart,
  IconCloudBase,
  IconCloudRun,
  IconDb,
  IconFolder,
  IconFunction,
  IconGateway,
  IconGear,
  IconGithub,
  IconGlobe,
  IconHosting,
  IconLock,
  IconLogs,
} from "../../lib/icons.js";
import { ensureStyles } from "../../styles.js";
import { AuthGate } from "./AuthGate.js";
import { EnvSelector } from "./EnvSelector.js";
import { PreviewTab } from "./PreviewTab.js";
import {
  AuthUsersPage,
  DatabasePage,
  GatewayPage,
  LogsPage,
  ManagerShell,
  OverviewPage,
  FunctionsPage,
  CloudRunPage,
  HostingPage,
  StoragePage,
  SettingsPage,
  type MenuRouteId,
  resolvePostgresEnv,
  detectLocale,
  type Locale,
} from "@cloudbase/platform-kit";

type ViewId = "backend" | "preview";

/** Kept for reference; renderRoute now uses real page components. */
export function NotImplementedRoute({ route }: { route: string }): React.ReactElement {
  return (
    <div className="cb-kit-page">
      <div className="cb-kit-empty">
        <strong>{route}</strong> 模块正在开发中，后续版本提供
      </div>
    </div>
  );
}

const GITHUB_URL = "https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/tree/main/dsh-plugin";

export interface DetailsPanelProps {
  cloudbaseData?: CloudBaseData;
  openDetails?: () => void;
  sessionId?: string;
}

type FeatureCtxState = { runtimeMode?: string; isPostgresEnv?: boolean };

/** Unwrap typert / RPC wrappers so runtimeMode / isPostgresEnv are readable. */
function unwrapEnvInfoPayload(raw: unknown): EnvInfoView {
  const root =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const nested =
    root.data !== null && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : undefined;
  const pick =
    nested &&
    ("envId" in nested ||
      "runtimeMode" in nested ||
      "RuntimeMode" in nested ||
      "isPostgresEnv" in nested)
      ? nested
      : root;
  return {
    envId: String(pick.envId ?? pick.EnvId ?? ""),
    regionLabel: String(pick.regionLabel ?? pick.Region ?? ""),
    functionCount: Number(pick.functionCount ?? 0),
    hostingDomainCount: Number(pick.hostingDomainCount ?? 0),
    timezone: String(pick.timezone ?? "Asia/Shanghai"),
    alias: typeof pick.alias === "string" ? pick.alias : undefined,
    runtimeMode:
      typeof pick.runtimeMode === "string"
        ? pick.runtimeMode
        : typeof pick.RuntimeMode === "string"
          ? pick.RuntimeMode
          : undefined,
    isPostgresEnv:
      typeof pick.isPostgresEnv === "boolean"
        ? pick.isPostgresEnv
        : typeof pick.IsPostgresEnv === "boolean"
          ? pick.IsPostgresEnv
          : undefined,
  };
}

function featureCtxFromEnvInfo(info: EnvInfoView): FeatureCtxState {
  const runtimeMode = info.runtimeMode;
  const isPostgresEnv =
    info.isPostgresEnv ??
    resolvePostgresEnv({
      runtimeMode,
      isPostgresEnv: info.isPostgresEnv,
    });
  return { runtimeMode, isPostgresEnv };
}

/** Prefer dsh / host document language when exposed; otherwise undefined (kit detects). */
function detectHostLocale(): Locale | undefined {
  if (typeof document !== "undefined") {
    const htmlLang =
      document.documentElement.lang || document.documentElement.getAttribute("lang") || "";
    if (/^zh/i.test(htmlLang)) return "zh";
    if (/^en/i.test(htmlLang)) return "en";
  }
  try {
    const stored =
      (typeof localStorage !== "undefined" &&
        (localStorage.getItem("dsh.locale") ||
          localStorage.getItem("dsh-locale") ||
          localStorage.getItem("locale"))) ||
      "";
    if (/^zh/i.test(stored)) return "zh";
    if (/^en/i.test(stored)) return "en";
  } catch {
    // ignore storage access errors in sandboxed webviews
  }
  return undefined;
}

export function DetailsPanel(props: DetailsPanelProps): React.ReactElement {
  ensureStyles();
  const [view, setView] = React.useState<ViewId>("backend");
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [route, setRoute] = React.useState<MenuRouteId>("overview");
  const [featureCtx, setFeatureCtx] = React.useState<FeatureCtxState>({});
  const [hostLocale] = React.useState<Locale | undefined>(() => detectHostLocale() ?? detectLocale());
  const data = props.cloudbaseData;

  const applyEnvInfo = React.useCallback((raw: unknown) => {
    // Live probe: log raw shape once so we can confirm field nesting on device.
    if (typeof console !== "undefined") {
      try {
        console.info("[cloudbase] envInfo raw keys", raw && typeof raw === "object" ? Object.keys(raw as object) : raw);
      } catch {
        // ignore
      }
    }
    const info = unwrapEnvInfoPayload(raw);
    const ctx = featureCtxFromEnvInfo(info);
    setFeatureCtx(ctx);
    // PG 探活兜底：DescribeEnvs 对平台授权 / API Key 环境不可见时 envInfo 无法
    // 确认 PG 类型（runtimeMode 为空 → isPostgresEnv=false），用数据面
    // ExecutePGSql 探测，成功则把数据库页切到 PostgreSQL 模式（表列表可渲染）。
    if (!ctx.isPostgresEnv && info.envId && data?.capi) {
      void data
        .capi("tcb", "ExecutePGSql", { EnvId: info.envId, Sql: "SELECT 1 AS probe" })
        .then(() => {
          setFeatureCtx((prev) =>
            prev.isPostgresEnv ? prev : { ...prev, runtimeMode: "postgresql", isPostgresEnv: true },
          );
        })
        .catch(() => undefined);
    }
  }, [data]);

  React.useEffect(() => {
    if (!data) return;
    void data
      .envInfo()
      .then((info) => applyEnvInfo(info))
      .catch(() => undefined);
  }, [data, applyEnvInfo]);

  React.useEffect(() => {
    const onActivate = (event: Event) => {
      const url = (event as CustomEvent<string>).detail;
      setPreviewUrl(url);
      setView("preview");
      props.openDetails?.();
    };
    window.addEventListener("cloudbase-dsh:activate-preview", onActivate);
    return () => window.removeEventListener("cloudbase-dsh:activate-preview", onActivate);
  }, [props.openDetails]);

  const refreshFeatureCtx = React.useCallback(() => {
    if (!data) return;
    void data
      .envInfo()
      .then((info) => applyEnvInfo(info))
      .catch(() => undefined);
  }, [data, applyEnvInfo]);

  return (
    <div className="cb-root cb-kit-fill">
      <AuthGate data={data}>
        {({ status, setStatus }: { status: AuthStatus; setStatus: (s: AuthStatus) => void }) => {
          const topbar = (
            <div className="cb-topbar">
              <span className="cb-logo" title="CloudBase">
                <IconCloudBase />
              </span>
              <EnvSelector
                data={data}
                currentEnvId={status.envId}
                sessionId={props.sessionId}
                onChanged={(next) => {
                  setStatus(next);
                  refreshFeatureCtx();
                }}
                onError={(message) => console.warn("[cloudbase] env switch:", message)}
              />
              <span className="cb-spacer" />
              <div className="cb-capsule">
                <button
                  type="button"
                  className={`cb-capsule-btn${view === "backend" ? " active" : ""}`}
                  onClick={() => setView("backend")}
                  title="CloudBase 后端"
                >
                  <IconDb />
                  后端
                </button>
                <button
                  type="button"
                  className={`cb-capsule-btn${view === "preview" ? " active" : ""}`}
                  onClick={() => setView("preview")}
                  title="浏览器预览部署的应用"
                >
                  <IconGlobe />
                  预览
                </button>
              </div>
              <a className="cb-gh" href={GITHUB_URL} target="_blank" rel="noreferrer" title="GitHub">
                <IconGithub />
              </a>
            </div>
          );

          return (
            <div className="cb-details">
              {view === "preview" ? (
                <>
                  {topbar}
                  <PreviewTab seedUrl={previewUrl} data={data} />
                </>
              ) : (
                <ManagerShell
                  provider={data}
                  locale={hostLocale}
                  featureCtx={{ ...featureCtx, envId: status.envId }}
                  route={route}
                  onRouteChange={setRoute}
                  onOpenPreview={(url) => {
                    setPreviewUrl(url);
                    setView("preview");
                  }}
                  header={topbar}
                  icons={{
                    overview: { idle: <IconChart />, active: <IconChart /> },
                    database: { idle: <IconDb />, active: <IconDb /> },
                    storage: { idle: <IconFolder />, active: <IconFolder /> },
                    functions: { idle: <IconFunction />, active: <IconFunction /> },
                    cloudrun: { idle: <IconCloudRun />, active: <IconCloudRun /> },
                    hosting: { idle: <IconHosting />, active: <IconHosting /> },
                    auth: { idle: <IconLock />, active: <IconLock /> },
                    gateway: { idle: <IconGateway />, active: <IconGateway /> },
                    logs: { idle: <IconLogs />, active: <IconLogs /> },
                    settings: { idle: <IconGear />, active: <IconGear /> },
                  }}
                  renderRoute={(activeRoute) => {
                    switch (activeRoute) {
                      case "overview":
                        return <OverviewPage provider={data} />;
                      case "database":
                        return <DatabasePage provider={data} />;
                      case "storage":
                        return <StoragePage provider={data} />;
                      case "auth":
                        return <AuthUsersPage provider={data} />;
                      case "gateway":
                        return <GatewayPage provider={data} />;
                      case "logs":
                        return <LogsPage provider={data} />;
                      case "settings":
                        return <SettingsPage provider={data} />;
                      case "functions":
                        return <FunctionsPage provider={data} />;
                      case "cloudrun":
                        return <CloudRunPage provider={data} />;
                      case "hosting":
                        return <HostingPage provider={data} />;
                      default:
                        return null;
                    }
                  }}
                />
              )}
            </div>
          );
        }}
      </AuthGate>
    </div>
  );
}
