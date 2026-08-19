import * as React from "react";
import type { GatewayRoute, GatewayRouteInput } from "../../core/types.js";

export interface RouteFormDrawerProps {
  open: boolean;
  initial?: GatewayRoute;
  domains: string[];
  functionNames: string[];
  labels: Record<string, string>;
  onClose: () => void;
  onSave: (input: GatewayRouteInput) => Promise<void>;
  pending?: boolean;
}

const UPSTREAM_TYPES = ["SCF", "WEB_SCF", "CBR", "STATIC_STORE", "LH"];

export function RouteFormDrawer(props: RouteFormDrawerProps): React.ReactElement | null {
  const [domain, setDomain] = React.useState("");
  const [path, setPath] = React.useState("/");
  const [upstreamType, setUpstreamType] = React.useState("SCF");
  const [upstreamName, setUpstreamName] = React.useState("");
  const [enableAuth, setEnableAuth] = React.useState(false);
  const [enable, setEnable] = React.useState(true);

  React.useEffect(() => {
    if (!props.open) return;
    setDomain(props.initial?.domain ?? props.domains[0] ?? "");
    setPath(props.initial?.path ?? "/");
    setUpstreamType(props.initial?.upstreamResourceType ?? "SCF");
    setUpstreamName(props.initial?.upstreamResourceName ?? "");
    setEnableAuth(Boolean(props.initial?.enableAuth));
    setEnable(props.initial?.enable ?? true);
  }, [props.open, props.initial, props.domains]);

  if (!props.open) return null;

  return (
    <div className="cb-kit-drawer-backdrop" onClick={props.onClose}>
      <div className="cb-kit-drawer" onClick={(e) => e.stopPropagation()}>
        <h3>{props.initial ? props.labels["gateway.path"] : props.labels["gateway.addRoute"]}</h3>
        <label className="cb-kit-field">
          <span>{props.labels["gateway.domain"]}</span>
          <select className="cb-kit-select" value={domain} onChange={(e) => setDomain(e.target.value)}>
            {props.domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="cb-kit-field">
          <span>{props.labels["gateway.path"]}</span>
          <input className="cb-kit-input" value={path} onChange={(e) => setPath(e.target.value)} />
        </label>
        <label className="cb-kit-field">
          <span>{props.labels["gateway.upstreamType"]}</span>
          <select className="cb-kit-select" value={upstreamType} onChange={(e) => setUpstreamType(e.target.value)}>
            {UPSTREAM_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="cb-kit-field">
          <span>{props.labels["gateway.upstream"]}</span>
          {upstreamType === "SCF" || upstreamType === "WEB_SCF" ? (
            <select className="cb-kit-select" value={upstreamName} onChange={(e) => setUpstreamName(e.target.value)}>
              <option value="">—</option>
              {props.functionNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          ) : (
            <input className="cb-kit-input" value={upstreamName} onChange={(e) => setUpstreamName(e.target.value)} />
          )}
        </label>
        <label className="cb-kit-field inline">
          <input type="checkbox" checked={enableAuth} onChange={(e) => setEnableAuth(e.target.checked)} />
          <span>{props.labels["gateway.auth"]}</span>
        </label>
        <label className="cb-kit-field inline">
          <input type="checkbox" checked={enable} onChange={(e) => setEnable(e.target.checked)} />
          <span>Enabled</span>
        </label>
        <div className="cb-kit-drawer-actions">
          <button type="button" className="cb-kit-btn ghost" onClick={props.onClose}>{props.labels["gateway.cancel"]}</button>
          <button
            type="button"
            className="cb-kit-btn"
            disabled={props.pending || !domain || !path || !upstreamName}
            onClick={() =>
              void props.onSave({
                routeId: props.initial?.routeId,
                domain,
                path,
                upstreamResourceType: upstreamType,
                upstreamResourceName: upstreamName,
                enableAuth,
                enable,
              })
            }
          >
            {props.labels["gateway.save"]}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface RouteTableProps {
  routes: GatewayRoute[];
  labels: Record<string, string>;
  onEdit: (route: GatewayRoute) => void;
  onDelete: (route: GatewayRoute) => void;
}

export function RouteTable(props: RouteTableProps): React.ReactElement {
  return (
    <div className="cb-kit-card cb-kit-table">
      <div className="cb-kit-table-head cols-5">
        <span>{props.labels["gateway.path"]}</span>
        <span>{props.labels["gateway.upstreamType"]}</span>
        <span>{props.labels["gateway.upstream"]}</span>
        <span>{props.labels["gateway.auth"]}</span>
        <span>Actions</span>
      </div>
      {props.routes.map((route) => (
        <div key={`${route.domain}:${route.path}:${route.routeId ?? route.upstreamResourceName}`} className="cb-kit-table-row static cols-5">
          <span className="mono">{route.path}</span>
          <span>{route.upstreamResourceType}</span>
          <span>{route.upstreamResourceName}</span>
          <span>{route.enableAuth ? "Yes" : "No"}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="cb-kit-btn ghost" onClick={() => props.onEdit(route)}>Edit</button>
            <button type="button" className="cb-kit-btn ghost" onClick={() => props.onDelete(route)}>Delete</button>
          </span>
        </div>
      ))}
    </div>
  );
}
