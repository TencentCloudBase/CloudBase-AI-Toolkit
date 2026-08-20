export const KIT_CSS = `
.cb-kit-root, .cb-kit-root * { box-sizing: border-box; }
.cb-kit-root {
  --cb-bg: #fbfbfa; --cb-panel: #fff; --cb-border: #ececec; --cb-border-strong: #d9d9d9;
  --cb-text: #16181d; --cb-text-2: #55585f; --cb-text-3: #8a8f98;
  --cb-hover: #f4f4f3; --cb-accent: #f0f0ef; --cb-ok: #1a7f37; --cb-danger: #cf222e; --cb-blue: #2f6fed;
  --cb-warn: #9a6700; --cb-building: #0969da;
  --cb-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --cb-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --cb-r: 8px;
  --cb-sidebar-w: 196px;
  --cb-gap-sm: 8px;
  --cb-gap-md: 12px;
  font-family: var(--cb-sans);
  color: var(--cb-text);
  font-size: 13px;
  line-height: 1.5;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.cb-kit-shell { display: flex; flex: 1; min-height: 0; }
.cb-kit-sidebar {
  width: var(--cb-sidebar-w); min-width: var(--cb-sidebar-w); border-right: 1px solid var(--cb-border);
  background: var(--cb-bg); overflow-y: auto; padding: 8px 0;
}
.cb-kit-nav-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 14px;
  border: none; background: transparent; cursor: pointer; font: inherit; font-size: 12.5px;
  color: var(--cb-text-2); text-align: left;
}
.cb-kit-nav-item:hover { background: var(--cb-hover); color: var(--cb-text); }
.cb-kit-nav-item.active { background: var(--cb-accent); color: var(--cb-text); font-weight: 600; }
.cb-kit-nav-item.restricted { opacity: .55; }
.cb-kit-main { flex: 1; min-width: 0; overflow: auto; display: flex; flex-direction: column; }
.cb-kit-page { padding: 16px 18px; flex: 1; min-height: 0; overflow: auto; }
.cb-kit-page-title {
  font-size: 15px; font-weight: 650; margin: 0 0 14px;
  writing-mode: horizontal-tb; white-space: nowrap; min-width: 0;
}
.cb-kit-page-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px;
}
.cb-kit-page-head .cb-kit-page-title { flex: 1 1 100%; margin: 0; }
.cb-kit-page-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.cb-kit-section { margin-bottom: 18px; }
.cb-kit-section-mt { margin-top: var(--cb-gap-md, 16px); }
.cb-kit-section-h { font-size: 11px; color: var(--cb-text-3); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
.cb-kit-spread { display: flex; align-items: center; gap: var(--cb-gap-sm, 8px); margin-bottom: var(--cb-gap-sm, 8px); }
.cb-kit-spread .cb-kit-page-title { margin: 0; flex: 1; }
.cb-kit-gap-sm { gap: var(--cb-gap-sm, 8px); }
.cb-kit-gap-md { margin: var(--cb-gap-md, 12px) 0; }
.cb-kit-inline-error { color: var(--cb-danger); margin-bottom: var(--cb-gap-sm, 8px); font-size: 12px; }
.cb-kit-inline-error .cb-kit-btn { margin-left: var(--cb-gap-sm, 8px); }
.cb-kit-grid-span-3 { grid-column: span 3; }
.cb-kit-page-toolbar { margin: var(--cb-gap-sm, 8px) 0 var(--cb-gap-md, 12px); }
.cb-kit-flex-1 { flex: 1; min-width: 0; }
.cb-kit-pagination { display: flex; align-items: center; gap: var(--cb-gap-sm, 8px); margin-top: var(--cb-gap-md, 12px); font-size: 12px; }
.cb-kit-confirm { width: min(400px, 92vw); background: var(--cb-panel); padding: 16px; border-radius: var(--cb-r); box-shadow: 0 12px 32px rgba(16,17,20,.18); margin: auto; align-self: center; }
.cb-kit-confirm-body { font-size: 12.5px; color: var(--cb-text-2); margin-bottom: 12px; }
.cb-kit-btn.danger { border-color: var(--cb-danger); color: var(--cb-danger); }
.cb-kit-skeleton-row { padding: 8px 12px; border-bottom: 1px solid var(--cb-border); }
.cb-kit-skeleton-bar { height: 12px; background: var(--cb-accent); border-radius: 4px; animation: cb-kit-pulse 1.2s ease-in-out infinite; }
.cb-kit-empty-action { margin-top: var(--cb-gap-sm, 8px); }
@keyframes cb-kit-pulse { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
.cb-kit-role-select { display: flex; flex-wrap: wrap; gap: 6px; }
.cb-kit-role-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; padding: 4px 8px; border: 1px solid var(--cb-border); border-radius: 999px; cursor: pointer; }
.cb-kit-role-chip.active { background: var(--cb-accent); font-weight: 600; }
.cb-kit-card { border: 1px solid var(--cb-border); border-radius: var(--cb-r); background: var(--cb-panel); overflow: hidden; }
.cb-kit-endpoint {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--cb-border);
  cursor: pointer; background: transparent; width: 100%; text-align: left; font: inherit;
}
.cb-kit-endpoint:last-child { border-bottom: none; }
.cb-kit-endpoint:hover { background: var(--cb-hover); }
.cb-kit-endpoint .tag {
  font-size: 10px; padding: 2px 6px; border-radius: 4px; background: var(--cb-accent); color: var(--cb-text-2);
  font-family: var(--cb-mono); flex-shrink: 0;
}
.cb-kit-endpoint .url { font-family: var(--cb-mono); font-size: 11.5px; color: var(--cb-blue); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.cb-kit-timeline { display: flex; flex-direction: column; gap: 0; }
.cb-kit-deploy {
  border: 1px solid var(--cb-border); border-radius: var(--cb-r); margin-bottom: 8px; overflow: hidden;
}
.cb-kit-deploy-head {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; background: var(--cb-panel);
  border: none; width: 100%; text-align: left; font: inherit;
}
.cb-kit-deploy-head:hover { background: var(--cb-hover); }
.cb-kit-badge {
  font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; text-transform: uppercase;
}
.cb-kit-badge.success { background: #dafbe1; color: var(--cb-ok); }
.cb-kit-badge.failed { background: #ffebe9; color: var(--cb-danger); }
.cb-kit-badge.building { background: #ddf4ff; color: var(--cb-building); }
.cb-kit-badge.pending { background: #fff8c5; color: var(--cb-warn); }
.cb-kit-badge.unknown { background: var(--cb-accent); color: var(--cb-text-3); }
.cb-kit-deploy-body { padding: 10px 12px 12px; border-top: 1px solid var(--cb-border); background: var(--cb-bg); font-size: 12px; }
.cb-kit-combobox { position: relative; flex: 1; min-width: 0; }
.cb-kit-combobox-input {
  width: 100%; font: inherit; font-size: 12px; color: var(--cb-text); background: var(--cb-bg);
  border: 1px solid var(--cb-border); border-radius: 6px; padding: 5px 28px 5px 8px; font-family: var(--cb-mono);
}
.cb-kit-combobox-input:focus { outline: none; border-color: var(--cb-blue); }
.cb-kit-combobox-toggle {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
  border: none; background: transparent; cursor: pointer; color: var(--cb-text-3); padding: 2px 6px;
}
.cb-kit-combobox-menu {
  position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 20;
  background: var(--cb-panel); border: 1px solid var(--cb-border); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(16,17,20,.12); max-height: 220px; overflow-y: auto;
}
.cb-kit-combobox-option {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px;
  border: none; background: transparent; cursor: pointer; font: inherit; text-align: left;
}
.cb-kit-combobox-option:hover, .cb-kit-combobox-option.active { background: var(--cb-hover); }
.cb-kit-combobox-option .label { font-weight: 500; font-size: 12px; }
.cb-kit-combobox-option .sub { font-size: 10.5px; color: var(--cb-text-3); font-family: var(--cb-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cb-kit-restricted, .cb-kit-empty { padding: 24px; text-align: center; color: var(--cb-text-3); border: 1px dashed var(--cb-border-strong); border-radius: var(--cb-r); margin: 16px 0; }
.cb-kit-table-head.cols-6, .cb-kit-table-row.cols-6 { grid-template-columns: 1.4fr 1fr .8fr .7fr 1fr .6fr; }
.cb-kit-crumb { display: flex; flex-wrap: wrap; gap: 4px; font-size: 12px; margin-bottom: 8px; }
.cb-kit-crumb button { border: none; background: transparent; color: var(--cb-blue); cursor: pointer; font: inherit; padding: 0; }
.cb-kit-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.cb-kit-metric { border: 1px solid var(--cb-border); border-radius: var(--cb-r); padding: 10px 12px; }
.cb-kit-metric .k { font-size: 11px; color: var(--cb-text-3); }
.cb-kit-metric .v { font-size: 16px; font-weight: 650; margin-top: 4px; }
.cb-kit-metric.danger .v { color: var(--cb-danger); }
.cb-kit-metric.danger { border-color: color-mix(in srgb, var(--cb-danger) 35%, var(--cb-border)); }
.cb-kit-btn { padding: 6px 12px; font-size: 12px; border: 1px solid var(--cb-border-strong); border-radius: 6px; background: var(--cb-panel); cursor: pointer; font: inherit; }
.cb-kit-btn:hover { background: var(--cb-hover); }
.cb-kit-btn.ghost { border-color: var(--cb-border); background: transparent; }
.cb-kit-btn:disabled { opacity: .5; cursor: not-allowed; }
.cb-kit-input, .cb-kit-select, .cb-kit-textarea {
  font: inherit; font-size: 12px; padding: 6px 8px; border: 1px solid var(--cb-border); border-radius: 6px; background: var(--cb-bg);
}
.cb-kit-input.flex { flex: 1; min-width: 0; font-family: var(--cb-mono); }
.cb-kit-textarea { width: 100%; font-family: var(--cb-mono); resize: vertical; }
.cb-kit-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; align-items: center; }
.cb-kit-banner { padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 12px; }
.cb-kit-banner.warn { background: #fff8c5; color: var(--cb-warn); border: 1px solid #f0e6a0; }
.cb-kit-table .cb-kit-table-head, .cb-kit-table .cb-kit-table-row { display: grid; grid-template-columns: 120px 90px 70px 1fr; gap: 8px; padding: 8px 12px; align-items: center; text-align: left; width: 100%; }
.cb-kit-table .cb-kit-table-head.cols-4, .cb-kit-table .cb-kit-table-row.cols-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
.cb-kit-table .cb-kit-table-head.cols-5, .cb-kit-table .cb-kit-table-row.cols-5 { grid-template-columns: 1.2fr 1fr 1fr .7fr .8fr; }
.cb-kit-table-head { font-size: 10.5px; color: var(--cb-text-3); text-transform: uppercase; border-bottom: 1px solid var(--cb-border); background: var(--cb-bg); }
.cb-kit-table-row { border: none; background: transparent; cursor: pointer; font: inherit; border-bottom: 1px solid var(--cb-border); }
.cb-kit-table-row.static { cursor: default; }
.cb-kit-table-row:hover:not(.static) { background: var(--cb-hover); }
.cb-kit-log-detail { padding: 10px 12px; background: var(--cb-bg); border-bottom: 1px solid var(--cb-border); }
.cb-kit-log-detail pre { margin: 0; font-family: var(--cb-mono); font-size: 11px; max-height: 240px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
.mono { font-family: var(--cb-mono); font-size: 11px; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cb-kit-db-layout { display: flex; gap: 12px; min-height: 360px; }
.cb-kit-db-list { width: 220px; min-width: 220px; border: 1px solid var(--cb-border); border-radius: var(--cb-r); overflow: auto; background: var(--cb-panel); }
.cb-kit-db-item { display: flex; justify-content: space-between; width: 100%; padding: 8px 10px; border: none; background: transparent; cursor: pointer; font: inherit; font-size: 12px; text-align: left; border-bottom: 1px solid var(--cb-border); }
.cb-kit-db-item:hover, .cb-kit-db-item.active { background: var(--cb-hover); }
.cb-kit-db-item .sub { color: var(--cb-text-3); font-size: 10px; }
.cb-kit-db-detail-head { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.cb-kit-tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
.cb-kit-tabs button { border: 1px solid var(--cb-border); background: var(--cb-panel); padding: 5px 10px; border-radius: 6px; font: inherit; font-size: 11.5px; cursor: pointer; }
.cb-kit-tabs button.active { background: var(--cb-accent); font-weight: 600; }
.cb-kit-drawer-backdrop { position: fixed; inset: 0; background: rgba(16,17,20,.35); z-index: 50; display: flex; justify-content: flex-end; }
.cb-kit-drawer { width: min(420px, 92vw); height: 100%; background: var(--cb-panel); padding: 16px; overflow: auto; box-shadow: -8px 0 24px rgba(16,17,20,.12); }
.cb-kit-drawer h3 { margin: 0 0 12px; font-size: 14px; }
.cb-kit-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; font-size: 12px; }
.cb-kit-field.inline { flex-direction: row; align-items: center; gap: 8px; }
.cb-kit-drawer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.cb-kit-code { background: var(--cb-bg); padding: 8px; border-radius: 6px; font-family: var(--cb-mono); font-size: 11px; overflow: auto; }
.cb-kit-chart-card { border: 1px solid var(--cb-border); border-radius: var(--cb-r); padding: 10px 12px; margin-bottom: 12px; }
.cb-kit-chart-head { display: flex; align-items: center; font-size: 12px; margin-bottom: 6px; }
.cb-kit-usage-bar { height: 6px; background: var(--cb-accent); border-radius: 999px; overflow: hidden; }
.cb-kit-usage-fill { height: 100%; background: var(--cb-blue); }
.cb-kit-collapse-head { width: 100%; text-align: left; border: none; background: var(--cb-bg); padding: 8px 10px; font: inherit; font-weight: 600; cursor: pointer; border: 1px solid var(--cb-border); border-radius: var(--cb-r); margin-bottom: 8px; }
.cb-kit-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; flex-shrink: 0; }
.cb-kit-table { overflow-x: auto; }
.cb-kit-sql-wrap { overflow: auto; border: 1px solid var(--cb-border); border-radius: var(--cb-r); }
.cb-kit-sql-wrap table { width: 100%; border-collapse: collapse; font-family: var(--cb-mono); font-size: 11px; }
.cb-kit-sql-wrap th, .cb-kit-sql-wrap td { padding: 6px 8px; border-bottom: 1px solid var(--cb-border); text-align: left; white-space: nowrap; }
.cb-spark { display: block; width: 100%; margin-top: 6px; }
`;

let injected = false;

export function ensureKitStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.setAttribute("data-cloudbase-platform-kit", "v1");
  style.textContent = KIT_CSS;
  document.head.appendChild(style);
}
