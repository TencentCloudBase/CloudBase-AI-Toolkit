import * as React from "react";
import type { CloudBaseData } from "../../../shared/types.js";
import { IconChart, IconDb, IconFolder, IconGear, IconLock } from "../../lib/icons.js";
import { ensureStyles } from "../../styles.js";
import { AnalyticsTab } from "./AnalyticsTab.js";
import { AuthGate } from "./AuthGate.js";
import { AuthTab } from "./AuthTab.js";
import { ConfigTab } from "./ConfigTab.js";
import { DatabaseTab } from "./DatabaseTab.js";
import { StorageTab } from "./StorageTab.js";

type TabId = "db" | "storage" | "auth" | "config" | "analytics";

const TABS: Array<{ id: TabId; label: string; icon: () => React.ReactElement }> = [
  { id: "db", label: "数据库", icon: IconDb },
  { id: "storage", label: "存储", icon: IconFolder },
  { id: "auth", label: "认证", icon: IconLock },
  { id: "config", label: "配置", icon: IconGear },
  { id: "analytics", label: "分析", icon: IconChart },
];

export interface DetailsPanelProps {
  cloudbaseData?: CloudBaseData;
}

export function DetailsPanel(props: DetailsPanelProps): React.ReactElement {
  ensureStyles();
  const [tab, setTab] = React.useState<TabId>("db");
  const data = props.cloudbaseData;

  return (
    <div className="cb-root" style={{ height: "100%" }}>
      <AuthGate data={data}>
        <div className="cb-details">
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
        </div>
      </AuthGate>
    </div>
  );
}
