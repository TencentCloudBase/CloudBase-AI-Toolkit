import * as React from "react";
import type { AccessEndpoint } from "../core/types.js";
import { KIT_EVENTS } from "../core/provider.js";
import { UrlCombobox } from "./UrlCombobox.js";
import { ensureKitStyles } from "../theme/styles.js";

export interface RecentDeploy {
  url: string;
  domain: string;
  at: number;
}

const EMPTY = "about:blank";
const RECENT_KEY = "cloudbase-dsh-recent-deploys";

function safeUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return EMPTY;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z]+:/i.test(trimmed)) return EMPTY;
  return `https://${trimmed}`;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function getRecentDeploys(): RecentDeploy[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentDeploy[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function recordDeployUrl(url: string): void {
  if (typeof localStorage === "undefined" || !url || url === EMPTY) return;
  const domain = hostFromUrl(url);
  const next = [{ url, domain, at: Date.now() }, ...getRecentDeploys().filter((e) => e.url !== url)].slice(
    0,
    5,
  );
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(KIT_EVENTS.recentDeploys, { detail: next }));
}

export interface UrlPreviewProps {
  seedUrl?: string;
  endpoints?: AccessEndpoint[];
  endpointsLoading?: boolean;
  loadEndpoints?: () => void;
  placeholder?: string;
  selectLabel?: string;
  loadLabel?: string;
  recentLabel?: string;
  openLabel?: string;
  refreshLabel?: string;
  renderIconBrowser?: () => React.ReactNode;
  renderIconOpen?: () => React.ReactNode;
  renderIconRefresh?: () => React.ReactNode;
  renderIconExternal?: () => React.ReactNode;
}

export function UrlPreview(props: UrlPreviewProps): React.ReactElement {
  ensureKitStyles();
  const [url, setUrl] = React.useState("");
  const [frameUrl, setFrameUrl] = React.useState(EMPTY);
  const [recent, setRecent] = React.useState<RecentDeploy[]>(() => getRecentDeploys());

  const loadUrl = React.useCallback((target: string) => {
    const safe = safeUrl(target);
    setUrl(target);
    setFrameUrl(safe);
    if (safe !== EMPTY) {
      recordDeployUrl(safe);
      setRecent(getRecentDeploys());
    }
  }, []);

  React.useEffect(() => {
    if (!props.seedUrl) return;
    loadUrl(props.seedUrl);
  }, [props.seedUrl, loadUrl]);

  React.useEffect(() => {
    props.loadEndpoints?.();
  }, [props.loadEndpoints]);

  React.useEffect(() => {
    const onStorage = () => setRecent(getRecentDeploys());
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<RecentDeploy[]>).detail;
      setRecent(Array.isArray(detail) ? detail : getRecentDeploys());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(KIT_EVENTS.recentDeploys, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(KIT_EVENTS.recentDeploys, onCustom as EventListener);
    };
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    loadUrl(url);
  };

  const refresh = () => {
    if (frameUrl === EMPTY) return;
    setFrameUrl(`${frameUrl.split("#")[0]}#t=${Date.now()}`);
  };

  const openExternal = () => {
    if (frameUrl === EMPTY) return;
    window.open(frameUrl, "_blank", "noreferrer");
  };

  return (
    <div className="cb-dpanel" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <form className="cb-webview-bar" onSubmit={submit} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--cb-border)" }}>
        {props.renderIconBrowser?.()}
        <UrlCombobox
          value={url}
          options={props.endpoints ?? []}
          placeholder={props.placeholder}
          selectLabel={props.selectLabel}
          onChange={setUrl}
          onSelect={(item) => loadUrl(item.url)}
          onSubmit={() => loadUrl(url)}
        />
        <button type="submit" className="cb-btn primary" title={props.loadLabel} style={{ padding: "6px 13px", fontSize: 12, fontWeight: 500, borderRadius: 6, border: "1px solid var(--cb-text)", background: "var(--cb-text)", color: "#fff", cursor: "pointer" }}>
          {props.renderIconOpen?.()}
          {props.loadLabel ?? "Preview"}
        </button>
        <button type="button" className="cb-mini" onClick={refresh} disabled={frameUrl === EMPTY} title={props.refreshLabel} style={{ padding: "3px 9px", border: "1px solid var(--cb-border-strong)", borderRadius: 5, background: "var(--cb-panel)", cursor: "pointer" }}>
          {props.renderIconRefresh?.()}
        </button>
        <button type="button" className="cb-mini" onClick={openExternal} disabled={frameUrl === EMPTY} title={props.openLabel} style={{ padding: "3px 9px", border: "1px solid var(--cb-border-strong)", borderRadius: 5, background: "var(--cb-panel)", cursor: "pointer" }}>
          {props.renderIconExternal?.()}
        </button>
      </form>
      {props.endpointsLoading ? (
        <div style={{ padding: "4px 10px", fontSize: 11, color: "var(--cb-text-3)" }}>…</div>
      ) : null}
      {recent.length > 0 ? (
        <div className="cb-webview-recent" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "6px 10px", borderBottom: "1px solid var(--cb-border)", background: "var(--cb-bg)" }}>
          <span className="k" style={{ fontSize: 10.5, color: "var(--cb-text-3)", textTransform: "uppercase" }}>{props.recentLabel}</span>
          {recent.map((entry) => (
            <button
              key={entry.url}
              type="button"
              className={`cb-chip${entry.url === frameUrl ? " active" : ""}`}
              onClick={() => loadUrl(entry.url)}
              title={entry.url}
              style={{ display: "inline-flex", maxWidth: 180, padding: "2px 8px", border: "1px solid var(--cb-border)", borderRadius: 12, fontSize: 11, fontFamily: "var(--cb-mono)", cursor: "pointer", background: entry.url === frameUrl ? "var(--cb-text)" : "var(--cb-panel)", color: entry.url === frameUrl ? "#fff" : "var(--cb-text-2)" }}
            >
              {entry.domain}
            </button>
          ))}
        </div>
      ) : null}
      <div className="cb-webview-frame" style={{ flex: 1, minHeight: 0, position: "relative", background: "#fff" }}>
        {frameUrl === EMPTY ? (
          <div className="cb-webview-empty" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--cb-text-3)" }}>
            {props.renderIconBrowser?.()}
            <p style={{ margin: 0, fontSize: 12.5, textAlign: "center", maxWidth: 280 }}>{props.placeholder}</p>
          </div>
        ) : (
          <iframe
            key={frameUrl}
            className="cb-iframe-full"
            title="URL preview"
            src={frameUrl}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          />
        )}
      </div>
    </div>
  );
}
