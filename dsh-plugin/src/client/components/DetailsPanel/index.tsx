import * as React from "react";
import type { AuthStatus, CloudBaseData } from "../../../shared/types.js";
import {
  IconBrowser,
  IconChart,
  IconCloudBase,
  IconDb,
  IconFolder,
  IconGear,
  IconGithub,
  IconLock,
} from "../../lib/icons.js";
import { ensureStyles } from "../../styles.js";
import { AnalyticsTab } from "./AnalyticsTab.js";
import { AuthGate } from "./AuthGate.js";
import { AuthTab } from "./AuthTab.js";
import { ConfigTab } from "./ConfigTab.js";
import { DatabaseTab } from "./DatabaseTab.js";
import { EnvSelector } from "./EnvSelector.js";
import { PreviewTab } from "./PreviewTab.js";
import { StorageTab } from "./StorageTab.js";

type ViewId = "backend" | "preview";
type TabId = "db" | "storage" | "auth" | "config" | "analytics";

const TABS: Array<{ id: TabId; label: string; icon: () => React.ReactElement }> = [
  { id: "db", label: "数据库", icon: IconDb },
  { id: "storage", label: "存储", icon: IconFolder },
  { id: "auth", label: "认证", icon: IconLock },
  { id: "config", label: "配置", icon: IconGear },
  { id: "analytics", label: "分析", icon: IconChart },
];

const GITHUB_URL = "https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/tree/main/dsh-plugin";

export interface DetailsPanelProps {
  cloudbaseData?: CloudBaseData;
  /** dsh layout 面板唤起能力（由 withData 注入）。 */
  openDetails?: () => void;
}

export function DetailsPanel(props: DetailsPanelProps): React.ReactElement {
  ensureStyles();
  const [view, setView] = React.useState<ViewId>("backend");
  const [tab, setTab] = React.useState<TabId>("db");
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);
  const data = props.cloudbaseData;

  // 部署成功后激活预览：DeployPreviewCard 在首次拿到新 URL 时派发 activate-preview。
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

  return (
    <div className="cb-root" style={{ height: "100%" }}>
      <AuthGate data={data}>
        {({ status, setStatus }: { status: AuthStatus; setStatus: (s: AuthStatus) => void }) => (
          <div className="cb-details">
            {/* 单行 header：logo + 环境选择 + 胶囊 + GitHub */}
            <div className="cb-topbar">
              <span className="cb-logo" title="CloudBase">
                <IconCloudBase />
              </span>
              <EnvSelector
                data={data}
                currentEnvId={status.envId}
                onChanged={setStatus}
                onError={(message) => console.warn("[cloudbase] env switch:", message)}
              />
              <div className="cb-capsule">
                <button
                  type="button"
                  className={`cb-capsule-btn${view === "backend" ? " active" : ""}`}
                  onClick={() => setView("backend")}
                  title="CloudBase 数据库 / 存储 / 认证 / 配置 / 分析"
                >
                  后端
                </button>
                <button
                  type="button"
                  className={`cb-capsule-btn${view === "preview" ? " active" : ""}`}
                  onClick={() => setView("preview")}
                  title="浏览器预览部署的应用或任意 URL"
                >
                  预览
                </button>
              </div>
              <a
                className="cb-gh"
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                title="GitHub: CloudBase-AI-Toolkit/dsh-plugin"
              >
                <IconGithub />
              </a>
            </div>

            {view === "preview" ? (
              <PreviewTab seedUrl={previewUrl} />
            ) : (
              <>
                <div className="cb-dtabs">
                  {TABS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`cb-dtab${tab === item.id ? " active" : ""}`}
                      onClick={() => setTab(item.id)}
                    >
                      {item.icon()}
                      {item.label}
                    </button>
                  ))}
                </div>
                {tab === "db" ? <DatabaseTab data={data} /> : null}
                {tab === "storage" ? <StorageTab data={data} /> : null}
                {tab === "auth" ? <AuthTab data={data} /> : null}
                {tab === "config" ? <ConfigTab data={data} /> : null}
                {tab === "analytics" ? <AnalyticsTab data={data} /> : null}
              </>
            )}
          </div>
        )}
      </AuthGate>
    </div>
  );
}
