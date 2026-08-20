import * as React from "react";
import type { AppUser } from "../../core/types.js";
import { bucketUserGrowth } from "../../utils/insights.js";
import { SparkChart } from "../charts/SparkChart.js";
import { ConfirmDialog } from "../ConfirmDialog.js";

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
        <span className="cb-kit-chart-latest">{latest}</span>
      </div>
      <SparkChart points={points} width={240} height={48} />
    </div>
  );
}

export interface UsersTableProps {
  users: AppUser[];
  keyword?: string;
  onToggleStatus?: (uid: string, enabled: boolean) => void;
  onSelect?: (user: AppUser) => void;
  pendingUid?: string;
  loading?: boolean;
  labels: Record<string, string>;
}

export function UsersTable(props: UsersTableProps): React.ReactElement {
  const [confirmUid, setConfirmUid] = React.useState<string | undefined>(undefined);
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

  if (props.loading) {
    return <div className="cb-kit-muted-block">{props.labels["table.loading"] ?? "…"}</div>;
  }

  if (filtered.length === 0) {
    return <div className="cb-kit-restricted">{props.labels["auth.users.empty"]}</div>;
  }

  return (
    <>
      <div className="cb-kit-card cb-kit-table">
        <div className="cb-kit-table-head cols-5">
          <span>{props.labels["auth.users.col.uid"] ?? "UID"}</span>
          <span>{props.labels["auth.users.col.name"] ?? "Name"}</span>
          <span>{props.labels["auth.users.col.email"] ?? "Email"}</span>
          <span>{props.labels["auth.users.col.status"] ?? "Status"}</span>
          <span>{props.labels["auth.users.col.actions"] ?? "Actions"}</span>
        </div>
        {filtered.map((user) => {
          const disabled = user.status === "disabled";
          return (
            <div key={user.uid} className="cb-kit-table-row static cols-5" role="row">
              <span className="mono">
                {props.onSelect ? (
                  <button type="button" className="cb-kit-btn ghost" onClick={() => props.onSelect!(user)}>
                    {user.uid}
                  </button>
                ) : (
                  user.uid
                )}
              </span>
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
                      if (!disabled) {
                        setConfirmUid(user.uid);
                        return;
                      }
                      void props.onToggleStatus!(user.uid, true);
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
      <ConfirmDialog
        open={Boolean(confirmUid)}
        title={props.labels["auth.users.disable"]}
        body={props.labels["auth.users.disableConfirm"]}
        confirmLabel={props.labels["auth.users.disable"]}
        cancelLabel={props.labels["common.cancel"] ?? "Cancel"}
        onCancel={() => setConfirmUid(undefined)}
        onConfirm={() => {
          const uid = confirmUid;
          setConfirmUid(undefined);
          if (uid) void props.onToggleStatus?.(uid, false);
        }}
      />
    </>
  );
}

export interface UserDetailDrawerProps {
  open: boolean;
  user?: AppUser;
  labels: Record<string, string>;
  pendingUid?: string;
  onClose: () => void;
  onToggleStatus?: (uid: string, enabled: boolean) => void;
}

export function UserDetailDrawer(props: UserDetailDrawerProps): React.ReactElement | null {
  const [confirmDisable, setConfirmDisable] = React.useState(false);
  if (!props.open || !props.user) return null;
  const disabled = props.user.status === "disabled";
  return (
    <>
      <div className="cb-kit-drawer-backdrop" onClick={props.onClose}>
        <div className="cb-kit-drawer" onClick={(e) => e.stopPropagation()}>
          <h3>{props.labels["auth.users.detail"]}</h3>
          <KvRows
            rows={[
              { k: "UID", v: props.user.uid },
              { k: props.labels["auth.users.createdAt"], v: props.user.createdAt ?? "—" },
              { k: props.labels["auth.users.lastLogin"], v: props.user.lastLoginAt ?? "—" },
              { k: props.labels["auth.users.providers"], v: props.user.providers?.join(", ") ?? "—" },
            ]}
          />
          <div className="cb-kit-drawer-actions">
            <button type="button" className="cb-kit-btn ghost" onClick={props.onClose}>
              {props.labels["common.cancel"] ?? "Close"}
            </button>
            {props.onToggleStatus ? (
              <button
                type="button"
                className="cb-kit-btn"
                disabled={props.pendingUid === props.user.uid}
                onClick={() => {
                  if (!disabled) {
                    setConfirmDisable(true);
                    return;
                  }
                  void props.onToggleStatus!(props.user!.uid, true);
                }}
              >
                {disabled ? props.labels["auth.users.enable"] : props.labels["auth.users.disable"]}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDisable}
        title={props.labels["auth.users.disable"]}
        body={props.labels["auth.users.disableConfirm"]}
        confirmLabel={props.labels["auth.users.disable"]}
        cancelLabel={props.labels["common.cancel"] ?? "Cancel"}
        onCancel={() => setConfirmDisable(false)}
        onConfirm={() => {
          setConfirmDisable(false);
          void props.onToggleStatus?.(props.user!.uid, false);
        }}
      />
    </>
  );
}

function KvRows(props: { rows: Array<{ k: string; v: string }> }): React.ReactElement {
  return (
    <div className="cb-kit-card cb-kit-table">
      {props.rows.map((row) => (
        <div key={row.k} className="cb-kit-table-row static cols-4">
          <span className="mono">{row.k}</span>
          <span className="mono cb-kit-span-3">{row.v}</span>
        </div>
      ))}
    </div>
  );
}
