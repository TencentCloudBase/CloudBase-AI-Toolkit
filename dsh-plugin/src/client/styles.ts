export const PANEL_CSS = `
.cb-root, .cb-root * { box-sizing: border-box; }
.cb-root {
  --cb-bg: #fbfbfa; --cb-panel: #fff; --cb-border: #ececec; --cb-border-strong: #d9d9d9;
  --cb-text: #16181d; --cb-text-2: #55585f; --cb-text-3: #8a8f98;
  --cb-hover: #f4f4f3; --cb-accent: #f0f0ef; --cb-ok: #1a7f37; --cb-danger: #cf222e; --cb-blue: #2f6fed;
  --cb-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --cb-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --cb-r: 8px;
  --cb-shadow: 0 1px 2px rgba(16,17,20,.04), 0 0 0 1px rgba(16,17,20,.02);
  font-family: var(--cb-sans);
  color: var(--cb-text);
  font-size: 13px;
  line-height: 1.5;
  min-width: 0;
}
.cb-root svg { width: 14px; height: 14px; flex-shrink: 0; }
.cb-toolcard, .cb-deliverable, .cb-details {
  border: 1px solid var(--cb-border);
  border-radius: var(--cb-r);
  background: var(--cb-panel);
  box-shadow: var(--cb-shadow);
  overflow: hidden;
  min-width: 0;
}
.cb-tc-head, .cb-tfoot, .cb-db-toolbar, .cb-auth-head {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid var(--cb-border);
  font-size: 11px; color: var(--cb-text-3); background: var(--cb-bg);
}
.cb-name { font-family: var(--cb-mono); font-size: 11px; color: var(--cb-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cb-st { display: flex; align-items: center; gap: 5px; color: var(--cb-ok); font-weight: 500; }
.cb-spacer { flex: 1; }
.cb-tbl-wrap { overflow-x: auto; }
.cb-table { border-collapse: collapse; font-size: 12.5px; min-width: 100%; }
.cb-table th { text-align: left; font-weight: 500; color: var(--cb-text-2); font-size: 11px; padding: 8px 12px; border-bottom: 1px solid var(--cb-border); background: var(--cb-bg); white-space: nowrap; cursor: pointer; }
.cb-table td { padding: 7px 12px; border-bottom: 1px solid var(--cb-border); font-family: var(--cb-mono); font-size: 12px; white-space: nowrap; }
.cb-table tbody tr:hover td { background: var(--cb-hover); }
.cb-table tbody tr.cb-row-edit { cursor: pointer; }
.cb-row-id { color: var(--cb-text-3); }
.cb-tfoot { border-top: 1px solid var(--cb-border); border-bottom: none; color: var(--cb-text-3); font-size: 11.5px; }
.cb-act, .cb-mini, .cb-btn, .cb-copy {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border: 1px solid var(--cb-border-strong); border-radius: 5px;
  cursor: pointer; font-size: 11px; color: var(--cb-text-2); background: var(--cb-panel);
}
.cb-act:hover, .cb-mini:hover, .cb-btn:hover, .cb-copy:hover { background: var(--cb-hover); }
.cb-btn { padding: 6px 13px; font-size: 12px; font-weight: 500; color: var(--cb-text); border-radius: 6px; }
.cb-btn.primary { background: var(--cb-text); color: #fff; border-color: var(--cb-text); }
.cb-pg { display: flex; align-items: center; gap: 4px; }
.cb-pg .cb-btn { width: 22px; height: 22px; padding: 0; justify-content: center; }
.cb-preview { display: flex; gap: 14px; padding: 12px; }
.cb-iframe {
  flex: 1; min-width: 0; height: 168px; border: 1px solid var(--cb-border); border-radius: 6px;
  background: repeating-linear-gradient(45deg,#fafafa,#fafafa 8px,#f4f4f4 8px,#f4f4f4 16px);
}
.cb-meta { width: 208px; flex-shrink: 0; display: flex; flex-direction: column; gap: 11px; }
.cb-meta .k { font-size: 10.5px; color: var(--cb-text-3); text-transform: uppercase; letter-spacing: .05em; }
.cb-meta .v { font-size: 12px; font-family: var(--cb-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cb-link { color: var(--cb-blue); text-decoration: none; }
.cb-link:hover { text-decoration: underline; }
.cb-ok { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--cb-ok); font-weight: 500; }
.cb-deliverable { display: flex; align-items: center; gap: 8px; padding: 9px 12px; font-size: 12px; color: var(--cb-text-2); }
.cb-deliverable .f { font-family: var(--cb-mono); font-size: 11px; color: var(--cb-text); }
.cb-details { display: flex; flex-direction: column; height: 100%; min-height: 360px; border-radius: 0; border: none; box-shadow: none; }
.cb-topbar { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-bottom: 1px solid var(--cb-border); background: var(--cb-bg); position: relative; }
.cb-logo { display: flex; align-items: center; color: var(--cb-blue); flex-shrink: 0; }
.cb-logo svg { width: 19px; height: 19px; }
.cb-gh { display: flex; align-items: center; color: var(--cb-text-3); text-decoration: none; flex-shrink: 0; }
.cb-gh:hover { color: var(--cb-text); }
.cb-gh svg { width: 16px; height: 16px; }
.cb-capsule { display: flex; gap: 2px; flex-shrink: 0; position: absolute; left: 50%; transform: translateX(-50%); }
.cb-capsule-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  padding: 3px 9px; font-size: 11px; color: var(--cb-text-2); background: transparent;
  border: 1px solid var(--cb-border); border-radius: 12px; cursor: pointer; white-space: nowrap;
}
.cb-capsule-btn:hover { background: var(--cb-hover); }
.cb-capsule-btn.active { background: var(--cb-text); color: #fff; border-color: var(--cb-text); font-weight: 600; }
.cb-dtabs { display: flex; border-bottom: 1px solid var(--cb-border); padding: 0 8px; }
.cb-dtab {
  flex: 1; min-width: 0; padding: 10px 4px; font-size: 12px; color: var(--cb-text-3);
  cursor: pointer; border: none; border-bottom: 2px solid transparent; background: transparent;
  display: flex; align-items: center; justify-content: center; gap: 5px; white-space: nowrap;
}
.cb-dtab.active { color: var(--cb-text); border-bottom-color: var(--cb-text); font-weight: 500; }
.cb-dpanel { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.cb-db { display: flex; flex: 1; min-height: 0; }
.cb-tree { width: 160px; min-width: 130px; border-right: 1px solid var(--cb-border); overflow-y: auto; padding: 8px 0; }
.cb-tree-sec { padding: 8px 12px 4px; font-size: 10px; color: var(--cb-text-3); text-transform: uppercase; letter-spacing: .07em; display: flex; align-items: center; gap: 5px; }
.cb-tree-item { padding: 5px 12px; font-size: 12.5px; color: var(--cb-text-2); cursor: pointer; display: flex; align-items: center; gap: 7px; border: none; background: transparent; width: 100%; text-align: left; }
.cb-tree-item.active { background: var(--cb-accent); color: var(--cb-text); font-weight: 500; }
.cb-cnt { margin-left: auto; font-size: 10.5px; color: var(--cb-text-3); font-family: var(--cb-mono); }
.cb-env-list { padding: 12px; display: flex; flex-direction: column; gap: 7px; overflow-y: auto; }
.cb-env-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 11px; border: 1px solid var(--cb-border); border-radius: 6px; }
.cb-env-row .k { font-family: var(--cb-mono); color: var(--cb-text-2); white-space: nowrap; }
.cb-env-row .v { color: var(--cb-text-3); display: flex; align-items: center; gap: 6px; min-width: 0; }
.cb-env-row .v.full { color: var(--cb-text); overflow: visible; font-family: var(--cb-mono); font-size: 11px; word-break: break-all; white-space: normal; }
.cb-copy { width: 20px; height: 20px; padding: 0; justify-content: center; flex-shrink: 0; }
.cb-placeholder { padding: 26px 16px; color: var(--cb-text-3); font-size: 12px; text-align: center; border: 1px dashed var(--cb-border-strong); margin: 14px; border-radius: 8px; }
.cb-error { padding: 12px; color: var(--cb-danger); font-size: 12px; }
.cb-auth-state { margin: 12px; border: 1px solid var(--cb-border); border-radius: 8px; overflow: hidden; }
.cb-auth-row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 12px; color: var(--cb-text-2); border-bottom: 1px solid var(--cb-border); }
.cb-auth-row:last-child { border-bottom: none; }
.cb-chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 4px 12px; }
.cb-chart-card { border: 1px solid var(--cb-border); border-radius: 8px; padding: 10px 12px; }
.cb-chart-head { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--cb-text-2); }
.cb-spark { width: 100%; height: 34px; margin-top: 6px; }
.cb-chart-card .cb-spark { height: 48px; }
.cb-mask { position: fixed; inset: 0; background: rgba(22,24,29,.32); display: flex; align-items: center; justify-content: center; z-index: 40; }
.cb-dialog { background: var(--cb-panel); border-radius: 12px; width: min(440px,90vw); box-shadow: 0 20px 60px rgba(16,17,20,.2); border: 1px solid var(--cb-border); }
.cb-dialog-wide { width: min(520px,92vw); max-height: 86vh; overflow: auto; }
.cb-form { display: flex; flex-direction: column; gap: 10px; font-family: var(--cb-sans); }
.cb-field { display: flex; flex-direction: column; gap: 4px; }
.cb-field-label { font-size: 12px; color: var(--cb-text); display: flex; justify-content: space-between; gap: 8px; }
.cb-field-type { color: var(--cb-text-3); font-family: var(--cb-mono); font-size: 10.5px; }
.cb-field-input { width: 100%; }
.cb-dialog-h { padding: 15px 18px; border-bottom: 1px solid var(--cb-border); font-weight: 650; display: flex; align-items: center; gap: 9px; }
.cb-dialog-b { padding: 16px 18px; font-size: 12.5px; color: var(--cb-text-2); font-family: var(--cb-mono); }
.cb-dialog-a { padding: 13px 18px; border-top: 1px solid var(--cb-border); display: flex; justify-content: flex-end; gap: 9px; }
.cb-sql { flex: 1; min-height: 120px; }
.cb-sql-bar { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-top: 1px solid var(--cb-border); }
.cb-hint { font-size: 11px; color: var(--cb-text-3); flex: 1; }
.cb-toast { font-size: 11px; color: var(--cb-ok); }
.cb-env-select { display: flex; align-items: center; min-width: 0; flex: 0 1 auto; }
.cb-select { width: auto; max-width: 200px; font: inherit; font-size: 11.5px; color: var(--cb-text-1); background: var(--cb-panel); border: 1px solid var(--cb-border); border-radius: 6px; padding: 3px 6px; min-width: 0; }
.cb-select:disabled { opacity: .55; }
.cb-webview-bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--cb-border); }
.cb-webview-input { flex: 1; min-width: 0; font: inherit; font-size: 12px; color: var(--cb-text); background: var(--cb-bg); border: 1px solid var(--cb-border); border-radius: 6px; padding: 5px 8px; font-family: var(--cb-mono); }
.cb-webview-input:focus { outline: none; border-color: var(--cb-blue); }
.cb-webview-recent { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 10px; border-bottom: 1px solid var(--cb-border); background: var(--cb-bg); }
.cb-webview-recent .k { font-size: 10.5px; color: var(--cb-text-3); text-transform: uppercase; letter-spacing: .05em; }
.cb-chip { display: inline-flex; align-items: center; max-width: 180px; padding: 2px 8px; border: 1px solid var(--cb-border); border-radius: 12px; font-size: 11px; color: var(--cb-text-2); background: var(--cb-panel); cursor: pointer; font-family: var(--cb-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cb-chip:hover { background: var(--cb-hover); }
.cb-chip.active { background: var(--cb-text); color: #fff; border-color: var(--cb-text); }
.cb-webview-frame { flex: 1; min-height: 0; position: relative; background: #fff; }
.cb-iframe-full { width: 100%; height: 100%; border: none; display: block; }
.cb-webview-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--cb-text-3); padding: 20px; }
.cb-webview-empty svg { width: 28px; height: 28px; opacity: .55; }
.cb-webview-empty p { margin: 0; font-size: 12.5px; text-align: center; max-width: 280px; line-height: 1.6; }
.cb-sql-block { border: 1px solid var(--cb-border); border-radius: 8px; overflow: hidden; background: #fcfcfc; }
.cb-sql-block-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--cb-border); background: var(--cb-bg); font-size: 11px; color: var(--cb-text-3); }
.cb-sql-block-lang { font-family: var(--cb-mono); letter-spacing: .04em; }
.cb-sql-block-body { min-height: 72px; max-height: 280px; }
.cb-write-op { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.cb-write-op.modal { padding: 16px 18px; }
.cb-write-op-head { display: flex; flex-direction: column; gap: 2px; }
.cb-write-op-head strong { font-size: 13px; }
.cb-write-op-sub { font-size: 11px; color: var(--cb-text-3); }
.cb-write-op-warn { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 8px; border: 1px solid #f5c2c7; background: #fff5f5; color: var(--cb-danger); font-size: 12px; }
.cb-write-op-warn-title { font-weight: 600; margin-bottom: 2px; }
.cb-write-op-warn-body { color: #9a1c28; }
.cb-write-op-ack { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--cb-text-2); cursor: pointer; }
.cb-write-op-ack input { margin-top: 2px; }
.cb-write-op-actions { display: flex; justify-content: space-between; gap: 10px; padding-top: 4px; }
.cb-write-op-actions .cb-btn.primary { margin-left: auto; }
.cb-write-op-status { font-size: 12px; padding: 8px 10px; border-radius: 6px; background: var(--cb-bg); color: var(--cb-text-2); }
.cb-write-op-status.skipped { border: 1px dashed var(--cb-border-strong); }
.cb-write-op-status.confirmed { border: 1px solid #b7dfc9; background: #f0faf4; color: var(--cb-ok); }
.cb-write-op-tool .cb-write-op { padding: 0 12px 12px; }
.cb-write-op-result { border-top: 1px solid var(--cb-border); }
.cb-toast { position: fixed; bottom: 20px; right: 20px; z-index: 40; display: flex; align-items: center; gap: 10px; max-width: 360px; padding: 10px 14px; background: var(--cb-panel); border: 1px solid var(--cb-border); border-radius: 12px; box-shadow: 0 8px 24px rgba(16,17,20,.12); font-size: 12.5px; color: var(--cb-text); }
.cb-toast[data-tone="error"] { border-left: 3px solid var(--cb-danger); }
.cb-toast[data-tone="warn"] { border-left: 3px solid #d4a72c; }
.cb-toast-msg { flex: 1; min-width: 0; line-height: 1.5; }
.cb-toast-close { width: 22px; height: 22px; padding: 0; font-size: 16px; line-height: 1; color: var(--cb-text-3); background: transparent; border: none; border-radius: 11px; cursor: pointer; }
.cb-toast-close:hover { background: var(--cb-hover); color: var(--cb-text); }
`;

let injected = false;
export function ensureStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cloudbase-dsh", "v1");
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
}
