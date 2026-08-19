import * as React from "react";
import type { AuthStatus, CloudBaseData } from "../../../shared/types.js";
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
import { StorageTab } from "./StorageTab.js";
import { ConfigTab } from "./ConfigTab.js";
import { AnalyticsTab } from "./AnalyticsTab.js";
import {
  AuthUsersPage,
  DatabasePage,
  GatewayPage,
  LogsPage,
  ManagerShell,
  OverviewPage,
  type MenuRouteId,
  resolvePostgresEnv,
} from "@cloudbase/platform-kit";

type ViewId = "backend" | "preview";

/** 跟随宿主语言：dsh web 运行在浏览器，取系统语言；无 navigator 时默认 zh。 */
function detectLocale(): "zh" | "en" {
  if (typeof navigator !== "undefined" && /^zh/i.test(navigator.language)) return "zh";
  return "en";
}

/** 未实现模块的说明页（替代 P1 占位符）：明确标注状态，不伪造功能。 */
function NotImplementedRoute({ route }: { route: string }): React.ReactElement {
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

export function DetailsPanel(props: DetailsPanelProps): React.ReactElement {
  ensureStyles();
  const [view, setView] = React.useState<ViewId>("backend");
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const [route, setRoute] = React.useState<MenuRouteId>("overview");
  const [featureCtx, setFeatureCtx] = React.useState<{ runtimeMode?: string; isPostgresEnv?: boolean }>({});
  const data = props.cloudbaseData;

  React.useEffect(() => {
    if (!data) return;
    void data
      .envInfo()
      .then((info) => {
        setFeatureCtx({
          runtimeMode: info.runtimeMode,
          isPostgresEnv: resolvePostgresEnv({ runtimeMode: info.runtimeMode }),
        });
      })
      .catch(() => undefined);
  }, [data]);

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
      .then((info) => {
        setFeatureCtx({
          runtimeMode: info.runtimeMode,
          isPostgresEnv: resolvePostgresEnv({ runtimeMode: info.runtimeMode }),
        });
      })
      .catch(() => undefined);
  }, [data]);

  return (
    <div className="cb-root" style={{ height: "100%" }}>
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
                  provider={data as never}
                  locale={detectLocale()}
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
                        return <OverviewPage provider={data as never} />;
                      case "database":
                        return <DatabasePage provider={data as never} />;
                      case "storage":
                        return <StorageTab data={data} />;
                      case "auth":
                        return <AuthUsersPage provider={data as never} />;
                      case "gateway":
                        return <GatewayPage provider={data as never} />;
                      case "logs":
                        return <LogsPage provider={data as never} />;
                      case "settings":
                        return (
                          <>
                            <ConfigTab data={data} />
                            <AnalyticsTab data={data} />
                          </>
                        );
                      case "functions":
                      case "cloudrun":
                      case "hosting":
                        return <NotImplementedRoute route={activeRoute} />;
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
