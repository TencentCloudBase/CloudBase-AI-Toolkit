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
import { useKit } from "../../hooks/use-menu.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ErrorBanner, EmptyState, SimpleTable } from "../resources/ResourceParts.js";
import { RouteFormDrawer, RouteTable } from "./GatewayParts.js";

export interface GatewayPageProps {
  provider?: PlatformProvider;
}

export function GatewayPage(props: GatewayPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const routes = useGatewayRoutes(provider);
  const privilege = useGatewayPrivilege(provider);
  const privilegeData = privilege.data;
  const mutations = useGatewayMutations(provider);
  const domains = useGatewayDomains(provider);
  const functions = useFunctionNames(provider);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editRoute, setEditRoute] = React.useState<GatewayRoute | undefined>();
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [serviceEnabled, setServiceEnabled] = React.useState(true);
  const [authEnabled, setAuthEnabled] = React.useState(false);
  const [mutationError, setMutationError] = React.useState<string | undefined>(undefined);
  const [bindOpen, setBindOpen] = React.useState(false);
  const [bindDomain, setBindDomain] = React.useState("");
  const [bindCertId, setBindCertId] = React.useState("");
  const [bindCname, setBindCname] = React.useState("");
  const [bindPolling, setBindPolling] = React.useState(false);
  const [confirmDeleteRoute, setConfirmDeleteRoute] = React.useState<GatewayRoute | undefined>(undefined);
  const [confirmUnbind, setConfirmUnbind] = React.useState<string | undefined>(undefined);
  const [certs, setCerts] = React.useState<Array<{ id: string; name: string }>>([]);

  React.useEffect(() => {
    setServiceEnabled(Boolean(privilegeData?.enableService));
    setAuthEnabled(Boolean(privilegeData?.enableAuth));
  }, [privilegeData?.enableAuth, privilegeData?.enableService]);

  React.useEffect(() => {
    if (!provider?.listSslCertificates) return;
    void provider.listSslCertificates().then((items) =>
      setCerts(items.map((item) => ({ id: item.id, name: item.name || item.id }))),
    );
  }, [provider]);

  React.useEffect(() => {
    if (!bindPolling) return;
    const tick = window.setInterval(() => domains.reload(), 4000);
    const stop = window.setTimeout(() => setBindPolling(false), 60000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(stop);
    };
  }, [bindPolling]);

  const labels = {
    "gateway.addRoute": kit.tr("gateway.addRoute"),
    "gateway.path": kit.tr("gateway.path"),
    "gateway.upstream": kit.tr("gateway.upstream"),
    "gateway.upstreamType": kit.tr("gateway.upstreamType"),
    "gateway.auth": kit.tr("gateway.auth"),
    "gateway.domain": kit.tr("gateway.domain"),
    "gateway.save": kit.tr("gateway.save"),
    "gateway.cancel": kit.tr("gateway.cancel"),
    "gateway.deleteConfirm": kit.tr("gateway.deleteConfirm"),
    "gateway.enabled": kit.tr("gateway.enabled"),
    "gateway.edit": kit.tr("gateway.edit"),
    "gateway.delete": kit.tr("gateway.delete"),
    "gateway.actions": kit.tr("gateway.actions"),
    "common.yes": kit.tr("common.yes"),
    "common.no": kit.tr("common.no"),
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

  const toggleService = async (enable: boolean) => {
    setMutationError(undefined);
    setServiceEnabled(enable);
    try {
      await mutations.toggleService(enable);
      refresh();
    } catch (error) {
      setServiceEnabled(!enable);
      setMutationError(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleAuth = async (enable: boolean) => {
    setMutationError(undefined);
    setAuthEnabled(enable);
    try {
      await mutations.toggleAuth(enable);
      refresh();
    } catch (error) {
      setAuthEnabled(!enable);
      setMutationError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="cb-kit-page">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("gateway.title")}</h2>
        <div className="cb-kit-page-actions">
          <label className="cb-kit-toggle">
            <span>{kit.tr("gateway.serviceEnabled")}</span>
            <input type="checkbox" checked={serviceEnabled} onChange={(e) => void toggleService(e.target.checked)} />
          </label>
          <label className="cb-kit-toggle">
            <span>{kit.tr("gateway.authEnabled")}</span>
            <input type="checkbox" checked={authEnabled} onChange={(e) => void toggleAuth(e.target.checked)} />
          </label>
          <button type="button" className="cb-kit-btn ghost" onClick={refresh}>{kit.tr("common.refresh")}</button>
          <button type="button" className="cb-kit-btn" onClick={() => setBindOpen(true)}>
            {kit.tr("gateway.bindDomain")}
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

      {mutationError ? <ErrorBanner error={`${kit.tr("gateway.mutationError")}: ${mutationError}`} /> : null}

      <div className="cb-kit-section">
        <div className="cb-kit-section-h">{kit.tr("gateway.domainsTitle")}</div>
        <SimpleTable
          loading={domains.loading}
          loadingLabel={kit.tr("table.loading")}
          columns={[
            kit.tr("gateway.domain"),
            kit.tr("gateway.domainStatus"),
            kit.tr("gateway.domainCname"),
            kit.tr("gateway.domainCert"),
            "",
          ]}
          empty={kit.tr("common.empty")}
          rows={(domains.data ?? []).map((item) => {
            const row = typeof item === "string" ? { domain: item, status: "ok" } : item;
            return {
              key: row.domain,
              cells: [
                row.domain,
                row.status ?? "—",
                row.cnameTarget ?? "—",
                row.certificateId ?? "—",
                "",
              ],
            };
          })}
        />
        {(domains.data ?? []).map((item) => {
          const domain = typeof item === "string" ? item : item.domain;
          return (
            <div key={`unbind-${domain}`} className="cb-kit-spread">
              <span className="mono">{domain}</span>
              <button type="button" className="cb-kit-btn ghost" onClick={() => setConfirmUnbind(domain)}>
                {kit.tr("gateway.unbindDomain")}
              </button>
            </div>
          );
        })}
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
        <EmptyState
          action={
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
          }
        >
          {kit.tr("gateway.empty")}
        </EmptyState>
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

      {bindOpen ? (
        <div className="cb-kit-drawer-backdrop" onClick={() => setBindOpen(false)}>
          <div className="cb-kit-drawer" onClick={(e) => e.stopPropagation()}>
            <h3>{kit.tr("gateway.bindDomain")}</h3>
            <label className="cb-kit-field">
              <span>{kit.tr("gateway.domain")}</span>
              <input className="cb-kit-input" value={bindDomain} onChange={(e) => setBindDomain(e.target.value)} />
            </label>
            <label className="cb-kit-field">
              <span>{kit.tr("gateway.domainCert")}</span>
              <select className="cb-kit-select" value={bindCertId} onChange={(e) => setBindCertId(e.target.value)}>
                <option value="">—</option>
                {certs.map((cert) => (
                  <option key={cert.id} value={cert.id}>{cert.name}</option>
                ))}
              </select>
            </label>
            <label className="cb-kit-field">
              <span>{kit.tr("gateway.cnameHint")}</span>
              <input className="cb-kit-input" value={bindCname} onChange={(e) => setBindCname(e.target.value)} />
            </label>
            <div className="cb-kit-drawer-actions">
              <button type="button" className="cb-kit-btn ghost" onClick={() => setBindOpen(false)}>{kit.tr("gateway.cancel")}</button>
              <button
                type="button"
                className="cb-kit-btn"
                disabled={!bindDomain.trim() || !bindCertId || !provider?.bindCustomDomain}
                onClick={() => {
                  void provider
                    ?.bindCustomDomain?.({
                      domain: bindDomain.trim(),
                      certId: bindCertId,
                      cnameDomain: bindCname.trim() || undefined,
                    })
                    .then(() => {
                      setBindOpen(false);
                      setBindDomain("");
                      setBindCname("");
                      setBindPolling(true);
                      refresh();
                    })
                    .catch((error) => setMutationError(error instanceof Error ? error.message : String(error)));
                }}
              >
                {kit.tr("gateway.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmDeleteRoute)}
        title={kit.tr("gateway.deleteConfirm")}
        body={confirmDeleteRoute?.path ?? ""}
        confirmLabel={kit.tr("common.confirm")}
        cancelLabel={kit.tr("common.cancel")}
        onCancel={() => setConfirmDeleteRoute(undefined)}
        onConfirm={() => {
          const route = confirmDeleteRoute;
          setConfirmDeleteRoute(undefined);
          if (!route?.routeId) return;
          void mutations.remove(route.routeId).then(refresh);
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmUnbind)}
        title={kit.tr("gateway.unbindDomain")}
        body={confirmUnbind ?? ""}
        confirmLabel={kit.tr("common.confirm")}
        cancelLabel={kit.tr("common.cancel")}
        onCancel={() => setConfirmUnbind(undefined)}
        onConfirm={() => {
          const domain = confirmUnbind;
          setConfirmUnbind(undefined);
          if (!domain || !provider?.deleteCustomDomain) return;
          void provider.deleteCustomDomain(domain, true).then(refresh).catch((error) => setMutationError(error instanceof Error ? error.message : String(error)));
        }}
      />
    </div>
  );
}
