import * as React from "react";
import type { PlatformProvider } from "../../core/provider.js";
import { useAuthUsers, useSetUserStatus } from "../../hooks/use-auth-users.js";
import { useKit } from "../../hooks/use-menu.js";
import { UsersGrowthChart, UsersTable } from "./AuthParts.js";

export interface AuthUsersPageProps {
  provider?: PlatformProvider;
}

export function AuthUsersPage(props: AuthUsersPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const users = useAuthUsers(provider, { pageSize: 200 });
  const statusMut = useSetUserStatus(provider);
  const [keyword, setKeyword] = React.useState("");
  const [days] = React.useState(14);

  const labels = {
    "auth.users.empty": kit.tr("auth.users.empty"),
    "auth.users.status.normal": kit.tr("auth.users.status.normal"),
    "auth.users.status.disabled": kit.tr("auth.users.status.disabled"),
    "auth.users.enable": kit.tr("auth.users.enable"),
    "auth.users.disable": kit.tr("auth.users.disable"),
    "auth.users.disableConfirm": kit.tr("auth.users.disableConfirm"),
  };

  return (
    <div className="cb-kit-page">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h2 className="cb-kit-page-title" style={{ margin: 0, flex: 1 }}>
          {kit.tr("auth.users.title")}
        </h2>
        <button type="button" className="cb-kit-btn ghost" onClick={() => users.reload()}>
          {kit.tr("common.refresh")}
        </button>
      </div>

      <UsersGrowthChart users={users.data ?? []} days={days} title={kit.tr("auth.users.growth")} />

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input
          className="cb-kit-input flex"
          placeholder={kit.tr("auth.users.search")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {users.error ? (
        <div style={{ color: "var(--cb-danger)", marginBottom: 8 }}>
          {users.error}
          <button type="button" className="cb-kit-btn ghost" style={{ marginLeft: 8 }} onClick={() => users.reload()}>
            {kit.tr("common.retry")}
          </button>
        </div>
      ) : null}

      <UsersTable
        users={users.data ?? []}
        keyword={keyword}
        labels={labels}
        pendingUid={statusMut.pendingUid}
        onToggleStatus={async (uid, enabled) => {
          await statusMut.mutate(uid, enabled);
          users.reload();
        }}
      />
    </div>
  );
}
