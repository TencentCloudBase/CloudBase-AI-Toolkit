import * as React from "react";
import type { AccessEndpoint } from "../core/types.js";
import { hostFromUrl } from "../services/apps-access.js";

export interface AccessEndpointsListProps {
  endpoints: AccessEndpoint[];
  loading?: boolean;
  error?: string;
  title?: string;
  appLabel?: string;
  onOpen?: (endpoint: AccessEndpoint) => void;
}

export function AccessEndpointsList(props: AccessEndpointsListProps): React.ReactElement {
  if (props.loading) {
    return <div style={{ padding: 12, color: "var(--cb-text-3)", fontSize: 12 }}>…</div>;
  }
  if (props.error) {
    return <div style={{ padding: 12, color: "var(--cb-danger)", fontSize: 12 }}>{props.error}</div>;
  }
  if (props.endpoints.length === 0) {
    return (
      <div className="cb-kit-restricted" style={{ margin: 0 }}>
        —
      </div>
    );
  }
  return (
    <div className="cb-kit-section">
      {props.title ? <div className="cb-kit-section-h">{props.title}</div> : null}
      <div className="cb-kit-card">
        {props.endpoints.map((item) => (
          <button
            key={item.id}
            type="button"
            className="cb-kit-endpoint"
            onClick={() => {
              if (props.onOpen) props.onOpen(item);
              else window.open(item.url, "_blank", "noreferrer");
            }}
          >
            <span className="tag">{item.resourceType === "app" ? props.appLabel ?? "app" : item.resourceType}</span>
            <span style={{ fontWeight: 500, flexShrink: 0 }}>{item.label}</span>
            <span className="url">{hostFromUrl(item.url)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
