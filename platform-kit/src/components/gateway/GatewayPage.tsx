import * as React from "react";
import type { GatewayPrivilege, GatewayRoute } from "../../core/types.js";
import type { PlatformProvider } from "../../core/provider.js";
import {
  useFunctionNames,
  useGatewayDomains,
  useGatewayMutations,
  useGatewayPrivilege,
  useGatewayRoutes,
} from "../../hooks/use-gateway-routes.js";
import { useKit } from "../../hooks/use-menu.js";
import { RouteFormDrawer, RouteTable } from "./GatewayParts.js";

export interface GatewayPageProps {
  provider?: PlatformProvider;
}

export function GatewayPage(props: GatewayPageProps): React.ReactElement {
  const kit = useKit();
  const provider = props.provider ?? kit.provider;
  const routes = useGatewayRoutes(provider);
  const privilege = useGatewayPrivilege(provider);
  const privilegeData = privilege.data as GatewayPrivilege | undefined;
  const mutations = useGatewayMutations(provider);
  const domains = useGatewayDomains(provider);
  const functions = useFunctionNames(provider);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editRoute, setEditRoute] = React.useState<GatewayRoute | undefined>();
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const labels = {
    "gateway.addRoute": kit.tr("gateway.addRoute"),
    "gateway.path": kit.tr("gateway.path"),
    "gateway.upstream": kit.tr("gateway.upstream"),
    "gateway.upstreamType": kit.tr("gateway.upstreamType"),
    "gateway.auth": kit.tr("gateway.auth"),
    "gateway.domain": kit.tr("gateway.domain"),
    "gateway.save": kit.tr("gateway.save"),
    "gateway.cancel": kit.tr("gateway.cancel"),
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
  };

  return (
    <div className="cb-kit-page">
      <div className="cb-kit-page-head">
        <h2 className="cb-kit-page-title">{kit.tr("gateway.title")}</h2>
        <div className="cb-kit-page-actions">
          <label className="cb-kit-toggle">
            <span>{kit.tr("gateway.serviceEnabled")}</span>
            <input
              type="checkbox"
              checked={Boolean(privilegeData?.enableService)}
              onChange={(e) => void mutations.toggleService(e.target.checked).then(refresh)}
            />
          </label>
          <label className="cb-kit-toggle">
            <span>{kit.tr("gateway.authEnabled")}</span>
            <input
              type="checkbox"
              checked={Boolean(privilegeData?.enableAuth)}
              onChange={(e) => void mutations.toggleAuth(e.target.checked).then(refresh)}
            />
          </label>
          <button type="button" className="cb-kit-btn ghost" onClick={refresh}>{kit.tr("common.refresh")}</button>
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
                onDelete={(route) => {
                  if (!route.routeId || !window.confirm(kit.tr("gateway.deleteConfirm"))) return;
                  void mutations.remove(route.routeId).then(refresh);
                }}
              />
            ) : null}
          </div>
        );
      })}

      {(routes.data ?? []).length === 0 && !routes.loading ? (
        <div className="cb-kit-restricted">{kit.tr("common.empty")}</div>
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
    </div>
  );
}
