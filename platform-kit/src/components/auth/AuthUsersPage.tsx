import * as React from "react";
import type { AppUser } from "../../core/types.js";
import type { PlatformProvider } from "../../core/provider.js";
import { useAuthUsers, useSetUserStatus } from "../../hooks/use-auth-users.js";
import { useKit } from "../../hooks/use-menu.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ErrorBanner, SimpleTable } from "../resources/ResourceParts.js";
import { UsersGrowthChart } from "./AuthParts.js";

export interface AuthUsersPageProps {
  provider?: import("../../core/provider.js").PlatformProvider;
}

function UserDetailDrawer(props: {
  user?: AppUser;
  open: boolean;
  labels: Record<string, string>;
  pendingUid?: string;
  onClose: () => void;
  onToggleStatus: (uid: string, enabled: boolean) => void;
}): React.ReactElement | null {
  if (!props.open || !props.user) return null;
  const disabled = props.user.status === "disabled";
  return (
    <div className="cb-kit-drawer-backdrop" onClick={props.onClose}>
      <div className="cb-kit-drawer" onClick={(e) => e.stopPropagation()}>
        <h3>{props.labels["auth.users.detail"]}</h3>
        <KvField label="UID" value={props.user.uid} />
        <KvField label={props.labels["auth.users.created"]} value={props.user.createdAt ?? "—"} />
        <KvField label={props.labels["auth.users.lastLogin"]} value={props.user.lastLoginAt ?? "—"} />
        <KvField label="Email" value={props.user.email ?? "—"} />
        <KvField label="Name" value={props.user.name ?? "—"} />
        <div className="cb-kit-drawer-actions">
          <button type="button" className="cb-kit-btn ghost" onClick={props.onClose}>
            {props.labels["common.cancel"]}
          </button>
          <button
            type="button"
            className={`cb-kit-btn${disabled ? "" : " danger"}`}
            disabled={props.pendingUid === props.user.uid}
            onClick={() => props.onToggleStatus(props.user!.uid, disabled)}
          >
            {disabled ? props.labels["auth.users.enable"] : props.labels["auth.users.disable"]}
          </button>
        </div>
      </div>
    </div>
  );
}

function KvField(props: { label: string; value: string }): React.ReactElement {
  return (
    <label className="cb-kit-field">
      <span>{props.label}</span>
      <span className="mono">{props.value}</span>
    </label>
  );
}

export function AuthUsersPage(props: AuthUsersPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const pageSize = 20;
  const users = useAuthUsers(provider, { pageSize });
  const statusMut = useSetUserStatus(provider);
  const [keyword, setKeyword] = React.useState("");
  const [selected, setSelected] = React.useState<AppUser | undefined>(undefined);
  const [confirmDisable, setConfirmDisable] = React.useState<AppUser | undefined>(undefined);
  const [days] = React.useState(14);

  const labels = {
    "auth.users.empty": kit.tr("auth.users.empty"),
    "auth.users.status.normal": kit.tr("auth.users.status.normal"),
    "auth.users.status.disabled": kit.tr("auth.users.status.disabled"),
    "auth.users.enable": kit.tr("auth.users.enable"),
    "auth.users.disable": kit.tr("auth.users.disable"),
    "auth.users.disableConfirm": kit.tr("auth.users.disableConfirm"),
    "auth.users.detail": kit.tr("auth.users.detail"),
    "auth.users.created": kit.tr("auth.users.created"),
    "auth.users.lastLogin": kit.tr("auth.users.lastLogin"),
    "common.cancel": kit.tr("common.cancel"),
  };

  const totalPages = Math.max(1, Math.ceil((users.total || 0) / pageSize));

  const handleToggle = async (uid: string, enabled: boolean) => {
    await statusMut.mutate(uid, enabled);
    users.reload();
    if (selected?.uid === uid) {
      setSelected((prev) => (prev ? { ...prev, status: enabled ? "normal" : "disabled" } : prev));
    }
  };

  return (
    <div className="cb-kit-page" data-testid="cb-page-auth">
      <div className="cb-kit-spread">
        <h2 className="cb-kit-page-title">{kit.tr("auth.users.title")}</h2>
        <button type="button" className="cb-kit-btn ghost" onClick={() => users.reload()}>
          {kit.tr("common.refresh")}
        </button>
      </div>

      <UsersGrowthChart users={users.users} days={days} title={kit.tr("auth.users.growth")} />

      <div className="cb-kit-filters cb-kit-gap-sm">
        <input
          className="cb-kit-input flex"
          placeholder={kit.tr("auth.users.search")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <ErrorBanner error={users.error} retry={() => users.reload()} retryLabel={kit.tr("common.retry")} />

      <SimpleTable
        loading={users.loading}
        columns={["UID", "Name", "Email", kit.tr("auth.users.status.normal")]}
        empty={kit.tr("auth.users.empty")}
        rows={users.users
          .filter((user) => {
            const kw = keyword.trim().toLowerCase();
            if (!kw) return true;
            return (
              user.uid.toLowerCase().includes(kw) ||
              user.name?.toLowerCase().includes(kw) ||
              user.email?.toLowerCase().includes(kw)
            );
          })
          .map((user) => ({
            key: user.uid,
            cells: [
              user.uid,
              user.name ?? "—",
              user.email ?? "—",
              user.status === "disabled"
                ? labels["auth.users.status.disabled"]
                : labels["auth.users.status.normal"],
            ],
            onClick: () => setSelected(user),
          }))}
      />

      <div className="cb-kit-pagination">
        <span>{kit.tr("auth.users.total").replace("{n}", String(users.total))}</span>
        <span>
          {kit.tr("auth.users.page")} {users.pageNo}/{totalPages}
        </span>
        <button
          type="button"
          className="cb-kit-btn ghost"
          disabled={users.pageNo <= 1}
          onClick={() => users.setPageNo((p) => Math.max(1, p - 1))}
        >
          {kit.tr("auth.users.prev")}
        </button>
        <button
          type="button"
          className="cb-kit-btn ghost"
          disabled={users.pageNo >= totalPages}
          onClick={() => users.setPageNo((p) => p + 1)}
        >
          {kit.tr("auth.users.next")}
        </button>
      </div>

      <UserDetailDrawer
        user={selected}
        open={Boolean(selected)}
        labels={labels}
        pendingUid={statusMut.pendingUid}
        onClose={() => setSelected(undefined)}
        onToggleStatus={(uid, enabled) => {
          if (!enabled) {
            setConfirmDisable(selected);
            return;
          }
          void handleToggle(uid, enabled);
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDisable)}
        title={labels["auth.users.disable"]}
        body={labels["auth.users.disableConfirm"]}
        confirmLabel={labels["auth.users.disable"]}
        cancelLabel={labels["common.cancel"]}
        danger
        pending={statusMut.pendingUid === confirmDisable?.uid}
        onCancel={() => setConfirmDisable(undefined)}
        onConfirm={() => {
          if (!confirmDisable) return;
          void handleToggle(confirmDisable.uid, false).then(() => {
            setConfirmDisable(undefined);
          });
        }}
      />
    </div>
  );
}
