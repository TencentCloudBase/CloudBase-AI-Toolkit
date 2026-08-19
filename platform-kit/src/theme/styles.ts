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
.cb-kit-page-title { font-size: 15px; font-weight: 650; margin: 0 0 14px; }
.cb-kit-section { margin-bottom: 18px; }
.cb-kit-section-h { font-size: 11px; color: var(--cb-text-3); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
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
.cb-kit-restricted { padding: 24px; text-align: center; color: var(--cb-text-3); border: 1px dashed var(--cb-border-strong); border-radius: var(--cb-r); margin: 16px; }
.cb-kit-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.cb-kit-metric { border: 1px solid var(--cb-border); border-radius: var(--cb-r); padding: 10px 12px; }
.cb-kit-metric .k { font-size: 11px; color: var(--cb-text-3); }
.cb-kit-metric .v { font-size: 16px; font-weight: 650; margin-top: 4px; }
.cb-kit-metric.danger .v { color: var(--cb-danger); }
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
