import * as React from "react";
import type { UsageItem } from "../../core/types.js";

export interface UsageBarsListProps {
  items: UsageItem[];
  title?: string;
  emptyLabel?: string;
}

export function UsageBarsList(props: UsageBarsListProps): React.ReactElement {
  if (props.items.length === 0) {
    return (
      <div className="cb-kit-section">
        {props.title ? <div className="cb-kit-section-h">{props.title}</div> : null}
        <div className="cb-kit-restricted" style={{ margin: 0 }}>{props.emptyLabel ?? "—"}</div>
      </div>
    );
  }
  return (
    <div className="cb-kit-section">
      {props.title ? <div className="cb-kit-section-h">{props.title}</div> : null}
      <div className="cb-kit-card" style={{ padding: "10px 12px" }}>
        {props.items.map((item) => (
          <div key={item.productName} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 500 }}>{item.productName}</span>
              <span style={{ color: "var(--cb-text-2)" }}>{item.usedLabel}</span>
            </div>
            {item.progress !== undefined ? (
              <div className="cb-kit-usage-bar">
                <div className="cb-kit-usage-fill" style={{ width: `${Math.min(100, item.progress * 100)}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
