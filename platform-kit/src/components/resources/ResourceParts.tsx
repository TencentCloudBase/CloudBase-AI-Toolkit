import * as React from "react";

export function EmptyState(props: { children: React.ReactNode; action?: React.ReactNode }): React.ReactElement {
  return (
    <div className="cb-kit-empty">
      {props.children}
      {props.action ? <div className="cb-kit-empty-action">{props.action}</div> : null}
    </div>
  );
}

export function PageHead(props: {
  title: string;
  onRefresh?: () => void;
  refreshLabel?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="cb-kit-page-head">
      <h2 className="cb-kit-page-title">{props.title}</h2>
      <div className="cb-kit-page-actions">
        {props.children}
        {props.onRefresh ? (
          <button type="button" className="cb-kit-btn ghost" onClick={props.onRefresh}>
            {props.refreshLabel ?? "Refresh"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TabsBar(props: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}): React.ReactElement {
  return (
    <div className="cb-kit-tabs">
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={props.active === tab.id ? "active" : ""}
          onClick={() => props.onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function KvList(props: { rows: Array<{ k: string; v: string }> }): React.ReactElement {
  if (props.rows.length === 0) return <EmptyState>—</EmptyState>;
  return (
    <div className="cb-kit-card cb-kit-table">
      {props.rows.map((row) => (
        <div key={row.k} className="cb-kit-table-row static cols-4">
          <span className="mono">{row.k}</span>
          <span className="mono cb-kit-grid-span-3">{row.v}</span>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton(props: { columns: number; rows?: number }): React.ReactElement {
  const count = props.rows ?? 3;
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="cb-kit-skeleton-row">
          <div className="cb-kit-skeleton-bar" />
        </div>
      ))}
    </>
  );
}

export function SimpleTable(props: {
  columns: string[];
  rows: Array<{ key: string; cells: string[]; onClick?: () => void }>;
  empty?: React.ReactNode;
  loading?: boolean;
}): React.ReactElement {
  const cols = `cols-${Math.min(6, Math.max(4, props.columns.length))}` as const;
  if (props.loading) {
    return (
      <div className="cb-kit-card cb-kit-table">
        <div className={`cb-kit-table-head ${cols}`}>
          {props.columns.map((col) => (
            <span key={col}>{col}</span>
          ))}
        </div>
        <TableSkeleton columns={props.columns.length} />
      </div>
    );
  }
  if (props.rows.length === 0) {
    return <EmptyState>{props.empty ?? "—"}</EmptyState>;
  }
  return (
    <div className="cb-kit-card cb-kit-table">
      <div className={`cb-kit-table-head ${cols}`}>
        {props.columns.map((col) => (
          <span key={col}>{col}</span>
        ))}
      </div>
      {props.rows.map((row) => {
        const content = row.cells.map((cell, index) => (
          <span key={`${row.key}-${index}`} className={index === 0 ? "mono" : undefined}>
            {cell}
          </span>
        ));
        if (row.onClick) {
          return (
            <button
              key={row.key}
              type="button"
              className={`cb-kit-table-row ${cols}`}
              onClick={row.onClick}
            >
              {content}
            </button>
          );
        }
        return (
          <div key={row.key} className={`cb-kit-table-row static ${cols}`} role="row">
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function ErrorBanner(props: { error?: string; retry?: () => void; retryLabel?: string }): React.ReactElement | null {
  if (!props.error) return null;
  return (
    <div className="cb-kit-inline-error">
      {props.error}
      {props.retry ? (
        <button type="button" className="cb-kit-btn ghost" onClick={props.retry}>
          {props.retryLabel ?? "Retry"}
        </button>
      ) : null}
    </div>
  );
}

export function DegradeNote(props: { children: React.ReactNode }): React.ReactElement {
  return <div className="cb-kit-banner warn">{props.children}</div>;
}

export function FeedbackBanner(props: { kind: "ok" | "warn" | "error"; children: React.ReactNode }): React.ReactElement {
  const cls = props.kind === "error" ? "warn" : props.kind === "ok" ? "" : "warn";
  return <div className={`cb-kit-banner${cls ? ` ${cls}` : ""}`}>{props.children}</div>;
}
