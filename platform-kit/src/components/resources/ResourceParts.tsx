import * as React from "react";

export function EmptyState(props: { children: React.ReactNode; action?: React.ReactNode }): React.ReactElement {
  return (
    <div className="cb-kit-empty">
      <div>{props.children}</div>
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
          <span className="mono cb-kit-span-3">{row.v}</span>
        </div>
      ))}
    </div>
  );
}

function skeletonRows(cols: number, count = 3): React.ReactElement {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={`sk-${index}`} className="cb-kit-table-row static cols-4 cb-kit-skeleton-row" aria-hidden="true">
          {Array.from({ length: cols }).map((__, cell) => (
            <span key={cell} className="cb-kit-skeleton-cell" />
          ))}
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
  loadingLabel?: string;
}): React.ReactElement {
  const colCount = Math.min(6, Math.max(4, props.columns.length));
  const cols = `cols-${colCount}` as const;
  if (props.loading) {
    return (
      <div className="cb-kit-card cb-kit-table" aria-busy="true">
        <div className={`cb-kit-table-head ${cols}`}>
          {props.columns.map((col) => (
            <span key={col}>{col}</span>
          ))}
        </div>
        {skeletonRows(colCount)}
        <div className="cb-kit-table-loading">{props.loadingLabel ?? "…"}</div>
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
        const cells = row.cells.map((cell, index) => (
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
              {cells}
            </button>
          );
        }
        return (
          <div key={row.key} className={`cb-kit-table-row static ${cols}`} role="row">
            {cells}
          </div>
        );
      })}
    </div>
  );
}

export function ErrorBanner(props: { error?: string; retry?: () => void; retryLabel?: string }): React.ReactElement | null {
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

export function DegradeNote(props: { children: React.ReactNode }): React.ReactElement {
  return <div className="cb-kit-banner warn">{props.children}</div>;
}

export function InlineMessage(props: { kind: "ok" | "err"; children: React.ReactNode }): React.ReactElement {
  return (
    <div className={`cb-kit-banner ${props.kind === "ok" ? "ok" : "err"}`}>{props.children}</div>
  );
}
