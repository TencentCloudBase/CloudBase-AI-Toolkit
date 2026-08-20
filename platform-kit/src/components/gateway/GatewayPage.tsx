import * as React from "react";
import type { GatewayRoute } from "../../core/types.js";
import type { PlatformProvider } from "../../core/provider.js";
import {
  useFunctionNames,
  useGatewayDomains,
  useGatewayMutations,
  useGatewayPrivilege,
  useGatewayRoutes,
} from "../../hooks/use-gateway-routes.js";
import { useAsyncResource } from "../../hooks/use-platform.js";
import { useKit } from "../../hooks/use-menu.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { DomainBindDrawer, RouteFormDrawer, RouteTable } from "./GatewayParts.js";
import { ErrorBanner, SimpleTable } from "../resources/ResourceParts.js";

export interface GatewayPageProps {
  provider?: PlatformProvider;
}

export function GatewayPage(props: GatewayPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const routes = useGatewayRoutes(provider);
  const privilege = useGatewayPrivilege(provider);
  const privilegeData = privilege.data as import("../../core/types.js").GatewayPrivilege | undefined;
  const mutations = useGatewayMutations(provider);
  const domains = useGatewayDomains(provider);
  const certificates = useAsyncResource(
    () => (provider?.listSslCertificates ? provider.listSslCertificates() : Promise.resolve([])),
    [provider],
  );
  const functions = useFunctionNames(provider);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [domainDrawerOpen, setDomainDrawerOpen] = React.useState(false);
  const [editRoute, setEditRoute] = React.useState<GatewayRoute | undefined>();
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [serviceEnabled, setServiceEnabled] = React.useState<boolean | undefined>(undefined);
  const [authEnabled, setAuthEnabled] = React.useState<boolean | undefined>(undefined);
  const [mutationError, setMutationError] = React.useState<string | undefined>(undefined);
  const [confirmDeleteRoute, setConfirmDeleteRoute] = React.useState<GatewayRoute | undefined>(undefined);
  const [confirmUnbindDomain, setConfirmUnbindDomain] = React.useState<string | undefined>(undefined);
  const [pollTick, setPollTick] = React.useState(0);

  React.useEffect(() => {
    if (privilegeData) {
      setServiceEnabled(Boolean(privilegeData.enableService));
      setAuthEnabled(Boolean(privilegeData.enableAuth));
    }
  }, [privilegeData]);

  React.useEffect(() => {
    const binding = (domains.data ?? []).some(
      (d) => typeof d !== "string" && d.status === "binding",
    );
    if (!binding) return;
    const timer = window.setInterval(() => {
      domains.reload();
      setPollTick((v) => v + 1);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [domains, pollTick]);

  const labels = {
    "gateway.addRoute": kit.tr("gateway.addRoute"),
    "gateway.path": kit.tr("gateway.path"),
    "gateway.upstream": kit.tr("gateway.upstream"),
    "gateway.upstreamType": kit.tr("gateway.upstreamType"),
    "gateway.auth": kit.tr("gateway.auth"),
    "gateway.domain": kit.tr("gateway.domain"),
    "gateway.save": kit.tr("gateway.save"),
    "gateway.cancel": kit.tr("gateway.cancel"),
    "gateway.domains.bind": kit.tr("gateway.domains.bind"),
    "gateway.domains.unbind": kit.tr("gateway.domains.unbind"),
    "gateway.domains.cname": kit.tr("gateway.domains.cname"),
    "gateway.domains.cert": kit.tr("gateway.domains.cert"),
    "gateway.domains.status": kit.tr("gateway.domains.status"),
    "common.edit": kit.tr("common.edit"),
    "common.delete": kit.tr("common.delete"),
    "common.actions": kit.tr("common.actions"),
    "common.enabled": kit.tr("common.enabled"),
  };

  const grouped = React.useMemo(() => {
    const map = new Map<string, GatewayRoute[]>();
    for (const route of routes.data ?? []) {
      const list = map.get(route.domain) ?? [];
      list.push(route);
      map.set(route.domain, list);
    }
    return map;
  }, [routes.data]);

  const domainList = React.useMemo(() => {
    const fromRoutes = [...grouped.keys()];
    const fromApi = (domains.data ?? []).map((item) => (typeof item === "string" ? item : item.domain));
    return [...new Set([...fromApi, ...fromRoutes].filter(Boolean))];
  }, [grouped, domains.data]);

  const refresh = () => {
    routes.reload();
    privilege.reload();
    domains.reload();
  };

  const handleToggleService = async (checked: boolean) => {
    setMutationError(undefined);
    const prev = serviceEnabled;
    setServiceEnabled(checked);
    try {
      await mutations.toggleService(checked);
      refresh();
    } catch (err) {
      setServiceEnabled(prev);
      setMutationError(`${kit.tr("gateway.mutationError")}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleToggleAuth = async (checked: boolean) => {
    setMutationError(undefined);
    const prev = authEnabled;
    setAuthEnabled(checked);
    try {
      await mutations.toggleAuth(checked);
      refresh();
    } catch (err) {
      setAuthEnabled(prev);
      setMutationError(`${kit.tr("gateway.mutationError")}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="cb-kit-page" data-testid="cb-page-gateway">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("gateway.title")}</h2>
        <div className="cb-kit-page-actions">
          <label className="cb-kit-toggle">
            <span>{kit.tr("gateway.serviceEnabled")}</span>
            <input
              type="checkbox"
              checked={Boolean(serviceEnabled)}
              onChange={(e) => void handleToggleService(e.target.checked)}
            />
          </label>
          <label className="cb-kit-toggle">
            <span>{kit.tr("gateway.authEnabled")}</span>
            <input
              type="checkbox"
              checked={Boolean(authEnabled)}
              onChange={(e) => void handleToggleAuth(e.target.checked)}
            />
          </label>
          <button type="button" className="cb-kit-btn ghost" onClick={refresh}>
            {kit.tr("common.refresh")}
          </button>
          <button type="button" className="cb-kit-btn" onClick={() => setDomainDrawerOpen(true)}>
            {kit.tr("gateway.domains.bind")}
          </button>
          <button
            type="button"
            className="cb-kit-btn"
            onClick={() => {
              setEditRoute(undefined);
              setDrawerOpen(true);
            }}
          >
            {kit.tr("gateway.addRoute")}
          </button>
        </div>
      </div>

      {mutationError ? <div className="cb-kit-inline-error">{mutationError}</div> : null}
      <ErrorBanner error={routes.error} retry={refresh} retryLabel={kit.tr("common.retry")} />

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("gateway.domains.title")}</div>
        <SimpleTable
          loading={domains.loading}
          columns={[
            kit.tr("gateway.domain"),
            kit.tr("gateway.domains.status"),
            kit.tr("gateway.domains.cname"),
            kit.tr("gateway.domains.cert"),
          ]}
          empty={kit.tr("gateway.domains.empty")}
          rows={(domains.data ?? []).map((item) => {
            const domain = typeof item === "string" ? item : item.domain;
            const status = typeof item === "string" ? "ok" : (item.status ?? "—");
            const cname =
              typeof item === "string"
                ? "—"
                : ((item as { cnameTarget?: string }).cnameTarget ?? "—");
            const cert =
              typeof item === "string"
                ? "—"
                : ((item as { certificateId?: string }).certificateId ?? "—");
            return {
              key: domain,
              cells: [domain, String(status), String(cname), String(cert)],
            };
          })}
        />
        <div className="cb-kit-page-actions">
          {(domains.data ?? []).map((item) => {
            const row = typeof item === "string" ? { domain: item, status: "ok" } : item;
            return (
              <button
                key={`unbind-${row.domain}`}
                type="button"
                className="cb-kit-btn ghost danger"
                onClick={() => setConfirmUnbindDomain(row.domain)}
              >
                {kit.tr("gateway.domains.unbind")} {row.domain}
              </button>
            );
          })}
        </div>
      </div>

      {[...grouped.entries()].map(([domain, domainRoutes]) => {
        const open = collapsed[domain] !== false;
        return (
          <div key={domain} className="cb-kit-section">
            <button
              type="button"
              className="cb-kit-collapse-head"
              onClick={() => setCollapsed((prev) => ({ ...prev, [domain]: !open }))}
            >
              {open ? "▼" : "▶"} {domain}
            </button>
            {open ? (
              <RouteTable
                routes={domainRoutes}
                labels={labels}
                onEdit={(route) => {
                  setEditRoute(route);
                  setDrawerOpen(true);
                }}
                onDelete={(route) => setConfirmDeleteRoute(route)}
              />
            ) : null}
          </div>
        );
      })}

      {(routes.data ?? []).length === 0 && !routes.loading ? (
        <div className="cb-kit-restricted">
          {kit.tr("gateway.routes.empty")}
          <div className="cb-kit-empty-action">
            <button type="button" className="cb-kit-btn" onClick={() => setDrawerOpen(true)}>
              {kit.tr("gateway.addRoute")}
            </button>
          </div>
        </div>
      ) : null}

      <RouteFormDrawer
        open={drawerOpen}
        initial={editRoute}
        domains={domainList}
        functionNames={functions.data ?? []}
        labels={labels}
        pending={mutations.pending}
        onClose={() => setDrawerOpen(false)}
        onSave={async (input) => {
          await mutations.create(input);
          setDrawerOpen(false);
          refresh();
        }}
      />

      <DomainBindDrawer
        open={domainDrawerOpen}
        certificates={certificates.data ?? []}
        labels={labels}
        pending={mutations.pending}
        onClose={() => setDomainDrawerOpen(false)}
        onSave={async (input) => {
          if (!provider?.bindCustomDomain) return;
          await provider.bindCustomDomain(input);
          setDomainDrawerOpen(false);
          domains.reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteRoute)}
        title={kit.tr("common.delete")}
        body={kit.tr("gateway.deleteConfirm")}
        confirmLabel={kit.tr("common.delete")}
        cancelLabel={kit.tr("common.cancel")}
        danger
        onCancel={() => setConfirmDeleteRoute(undefined)}
        onConfirm={() => {
          const route = confirmDeleteRoute;
          if (!route?.routeId) return;
          void mutations.remove(route.routeId).then(refresh).finally(() => setConfirmDeleteRoute(undefined));
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmUnbindDomain)}
        title={kit.tr("gateway.domains.unbind")}
        body={confirmUnbindDomain ?? ""}
        confirmLabel={kit.tr("gateway.domains.unbind")}
        cancelLabel={kit.tr("common.cancel")}
        danger
        onCancel={() => setConfirmUnbindDomain(undefined)}
        onConfirm={() => {
          const domain = confirmUnbindDomain;
          if (!domain || !provider?.deleteCustomDomain) return;
          void provider.deleteCustomDomain(domain, true).then(() => domains.reload()).finally(() => setConfirmUnbindDomain(undefined));
        }}
      />
    </div>
  );
}
