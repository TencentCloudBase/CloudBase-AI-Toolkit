import * as React from "react";
import type { AppUser } from "../../core/types.js";
import { bucketUserGrowth } from "../../utils/insights.js";
import { SparkChart } from "../charts/SparkChart.js";

export interface UsersGrowthChartProps {
  users: AppUser[];
  days?: number;
  title?: string;
}

export function UsersGrowthChart(props: UsersGrowthChartProps): React.ReactElement {
  const points = bucketUserGrowth(props.users, props.days ?? 14);
  const latest = points[points.length - 1] ?? 0;
  return (
    <div className="cb-kit-chart-card">
      <div className="cb-kit-chart-head">
        <span>{props.title ?? "User growth"}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--cb-mono)" }}>{latest}</span>
      </div>
      <SparkChart points={points} width={240} height={48} />
    </div>
  );
}

export interface UsersTableProps {
  users: AppUser[];
  keyword?: string;
  onToggleStatus?: (uid: string, enabled: boolean) => void;
  pendingUid?: string;
  labels: Record<string, string>;
  confirmDisable?: (message: string) => Promise<boolean>;
}

export function UsersTable(props: UsersTableProps): React.ReactElement {
  const filtered = React.useMemo(() => {
    const kw = props.keyword?.trim().toLowerCase();
    if (!kw) return props.users;
    return props.users.filter(
      (user) =>
        user.uid.toLowerCase().includes(kw) ||
        user.name?.toLowerCase().includes(kw) ||
        user.email?.toLowerCase().includes(kw),
    );
  }, [props.users, props.keyword]);

  if (filtered.length === 0) {
    return <div className="cb-kit-restricted">{props.labels["auth.users.empty"]}</div>;
  }

  return (
    <div className="cb-kit-card cb-kit-table">
      <div className="cb-kit-table-head cols-5">
        <span>UID</span><span>Name</span><span>Email</span><span>Status</span><span>Actions</span>
      </div>
      {filtered.map((user) => {
        const disabled = user.status === "disabled";
        return (
          <div key={user.uid} className="cb-kit-table-row static cols-5">
            <span className="mono">{user.uid}</span>
            <span>{user.name ?? "—"}</span>
            <span>{user.email ?? "—"}</span>
            <span>
              <span className={`cb-kit-badge ${disabled ? "failed" : "success"}`}>
                {disabled ? props.labels["auth.users.status.disabled"] : props.labels["auth.users.status.normal"]}
              </span>
            </span>
            <span>
              {props.onToggleStatus ? (
                <button
                  type="button"
                  className="cb-kit-btn ghost"
                  disabled={props.pendingUid === user.uid}
                  onClick={() => {
                    const nextEnabled = disabled;
                    if (!nextEnabled && !window.confirm(props.labels["auth.users.disableConfirm"])) return;
                    void props.onToggleStatus!(user.uid, nextEnabled);
                  }}
                >
                  {disabled ? props.labels["auth.users.enable"] : props.labels["auth.users.disable"]}
                </button>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
