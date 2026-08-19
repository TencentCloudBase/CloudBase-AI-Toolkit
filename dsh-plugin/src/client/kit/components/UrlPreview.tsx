import * as React from "react";
import { IconBrowser, IconExternal, IconOpen, IconRefresh } from "../../lib/icons.js";
import { KIT_EVENTS } from "../provider.js";
import { getRecentDeploys, recordDeployUrl, type RecentDeploy } from "../lib/recent-deploys.js";
import { ensureStyles } from "../../styles.js";

export interface UrlPreviewProps {
  /** DeployPreviewCard 推送过来的"最近一次访问地址"，会自动加载到 iframe。 */
  seedUrl?: string;
}

const EMPTY = "about:blank";

function safeUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return EMPTY;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z]+:/i.test(trimmed)) return EMPTY;
  return `https://${trimmed}`;
}

/**
 * 通用 Webview 预览（kit 组件）：URL 输入 + iframe 全屏 + 刷新/外链 + 最近访问 chips。
 * 不依赖任何云 provider —— 输入就是 seedUrl / 用户输入的 URL。
 */
export function UrlPreview(props: UrlPreviewProps): React.ReactElement {
  ensureStyles();
  const [url, setUrl] = React.useState<string>("");
  const [frameUrl, setFrameUrl] = React.useState<string>(EMPTY);
  const [recent, setRecent] = React.useState<RecentDeploy[]>(() => getRecentDeploys());

  // 同步 props.seedUrl → 自动加载到 iframe。
  React.useEffect(() => {
    if (!props.seedUrl) return;
    recordDeployUrl(props.seedUrl);
    setRecent(getRecentDeploys());
    setUrl(props.seedUrl);
    setFrameUrl(props.seedUrl);
  }, [props.seedUrl]);

  // 监听 storage / kit 事件，其他组件写入最近地址后同步刷新列表。
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
    const target = safeUrl(url);
    setFrameUrl(target);
    if (target !== EMPTY) {
      recordDeployUrl(target);
      setRecent(getRecentDeploys());
    }
  };

  const refresh = () => {
    if (frameUrl === EMPTY) return;
    setFrameUrl(`${frameUrl.split("#")[0]}#t=${Date.now()}`);
  };

  const openExternal = () => {
    if (frameUrl === EMPTY) return;
    window.open(frameUrl, "_blank", "noreferrer");
  };

  const pickRecent = (entry: RecentDeploy) => {
    setUrl(entry.url);
    setFrameUrl(entry.url);
  };

  return (
    <div className="cb-dpanel">
      <form className="cb-webview-bar" onSubmit={submit}>
        <IconBrowser />
        <input
          type="text"
          className="cb-webview-input"
          placeholder="https://your-app.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
        />
        <button type="submit" className="cb-mini" title="加载 URL">
          <IconOpen />
          预览
        </button>
        <button
          type="button"
          className="cb-mini"
          onClick={refresh}
          disabled={frameUrl === EMPTY}
          title="刷新"
        >
          <IconRefresh />
        </button>
        <button
          type="button"
          className="cb-mini"
          onClick={openExternal}
          disabled={frameUrl === EMPTY}
          title="新窗口打开"
        >
          <IconExternal />
        </button>
      </form>
      {recent.length > 0 ? (
        <div className="cb-webview-recent">
          <span className="k">最近部署</span>
          {recent.map((entry) => (
            <button
              key={entry.url}
              type="button"
              className={`cb-chip${entry.url === frameUrl ? " active" : ""}`}
              onClick={() => pickRecent(entry)}
              title={entry.url}
            >
              {entry.domain}
            </button>
          ))}
        </div>
      ) : null}
      <div className="cb-webview-frame">
        {frameUrl === EMPTY ? (
          <div className="cb-webview-empty">
            <IconBrowser />
            <p>输入 URL 预览任意网页，或在对话中部署后自动出现此处。</p>
          </div>
        ) : (
          <iframe
            key={frameUrl}
            className="cb-iframe-full"
            title="URL preview"
            src={frameUrl}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
}
