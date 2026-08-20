import * as React from "react";
import type { AppUser } from "../../core/types.js";
import type { PlatformProvider } from "../../core/provider.js";
import { useAuthUsers, useSetUserStatus } from "../../hooks/use-auth-users.js";
import { useKit } from "../../hooks/use-menu.js";
import { UserDetailDrawer, UsersGrowthChart, UsersTable } from "./AuthParts.js";

export interface AuthUsersPageProps {
  provider?: PlatformProvider;
}

export function AuthUsersPage(props: AuthUsersPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const [pageNo, setPageNo] = React.useState(1);
  const pageSize = 20;
  const [keyword, setKeyword] = React.useState("");
  const [debouncedKeyword, setDebouncedKeyword] = React.useState("");
  const users = useAuthUsers(provider, { pageSize, pageNo, keyword: debouncedKeyword });
  const statusMut = useSetUserStatus(provider);
  const [selectedUser, setSelectedUser] = React.useState<AppUser | undefined>(undefined);
  const [days] = React.useState(14);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKeyword(keyword.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const total = users.data?.total ?? users.data?.users.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const labels = {
    "auth.users.empty": kit.tr("auth.users.empty"),
    "auth.users.status.normal": kit.tr("auth.users.status.normal"),
    "auth.users.status.disabled": kit.tr("auth.users.status.disabled"),
    "auth.users.enable": kit.tr("auth.users.enable"),
    "auth.users.disable": kit.tr("auth.users.disable"),
    "auth.users.disableConfirm": kit.tr("auth.users.disableConfirm"),
    "auth.users.detail": kit.tr("auth.users.detail"),
    "auth.users.createdAt": kit.tr("auth.users.createdAt"),
    "auth.users.lastLogin": kit.tr("auth.users.lastLogin"),
    "auth.users.providers": kit.tr("auth.users.providers"),
    "auth.users.col.uid": kit.tr("auth.users.col.uid"),
    "auth.users.col.name": kit.tr("auth.users.col.name"),
    "auth.users.col.email": kit.tr("auth.users.col.email"),
    "auth.users.col.status": kit.tr("auth.users.col.status"),
    "auth.users.col.actions": kit.tr("auth.users.col.actions"),
    "table.loading": kit.tr("table.loading"),
    "common.cancel": kit.tr("common.cancel"),
  };

  return (
    <div className="cb-kit-page">
      <PageHead title={kit.tr("auth.users.title")} onRefresh={() => users.reload()} refreshLabel={kit.tr("common.refresh")} />

      <UsersGrowthChart users={users.data?.users ?? []} days={days} title={kit.tr("auth.users.growth")} />

      <div className="cb-kit-spread cb-kit-page-actions">
        <input
          className="cb-kit-input flex"
          placeholder={kit.tr("auth.users.search")}
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPageNo(1);
          }}
        />
      </div>

      {users.error ? (
        <ErrorBanner error={users.error} retry={() => users.reload()} retryLabel={kit.tr("common.retry")} />
      ) : null}

      <UsersTable
        users={users.data?.users ?? []}
        keyword=""
        labels={labels}
        loading={users.loading}
        pendingUid={statusMut.pendingUid}
        onSelect={setSelectedUser}
        onToggleStatus={async (uid, enabled) => {
          await statusMut.mutate(uid, enabled);
          users.reload();
        }}
      />

      <div className="cb-kit-pagination">
        <span>{kit.tr("auth.users.total").replace("{n}", String(total))}</span>
        <span>
          {kit.tr("auth.users.page")} {pageNo}/{totalPages}
        </span>
        <button type="button" className="cb-kit-btn ghost" disabled={pageNo <= 1} onClick={() => setPageNo((p) => p - 1)}>
          {kit.tr("auth.users.prev")}
        </button>
        <button
          type="button"
          className="cb-kit-btn ghost"
          disabled={pageNo >= totalPages}
          onClick={() => setPageNo((p) => p + 1)}
        >
          {kit.tr("auth.users.next")}
        </button>
      </div>

      <UserDetailDrawer
        open={Boolean(selectedUser)}
        user={selectedUser}
        labels={labels}
        pendingUid={statusMut.pendingUid}
        onClose={() => setSelectedUser(undefined)}
        onToggleStatus={async (uid, enabled) => {
          await statusMut.mutate(uid, enabled);
          users.reload();
        }}
      />
    </div>
  );
}

function PageHead(props: { title: string; onRefresh?: () => void; refreshLabel?: string }): React.ReactElement {
  return (
    <div className="cb-kit-page-head">
      <h2 className="cb-kit-page-title">{props.title}</h2>
      <div className="cb-kit-page-actions">
        {props.onRefresh ? (
          <button type="button" className="cb-kit-btn ghost" onClick={props.onRefresh}>
            {props.refreshLabel ?? "Refresh"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ErrorBanner(props: { error?: string; retry?: () => void; retryLabel?: string }): React.ReactElement | null {
  if (!props.error) return null;
  return (
    <div className="cb-kit-error-banner">
      {props.error}
      {props.retry ? (
        <button type="button" className="cb-kit-btn ghost cb-kit-inline-btn" onClick={props.retry}>
          {props.retryLabel ?? "Retry"}
        </button>
      ) : null}
    </div>
  );
}
