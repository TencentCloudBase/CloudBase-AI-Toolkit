import * as React from "react";
import { IconBrowser, IconExternal, IconOpen, IconRefresh } from "../../lib/icons.js";
import { getRecentDeploys, recordDeployUrl, type RecentDeploy } from "../../lib/recent-deploys.js";
import { ensureStyles } from "../../styles.js";

export interface PreviewTabProps {
  /** DeployPreviewCard 推送过来的"最近一次部署 URL"，会写入 recent-deploys 列表。 */
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

export function PreviewTab(props: PreviewTabProps): React.ReactElement {
  ensureStyles();
  const [url, setUrl] = React.useState<string>("");
  const [frameUrl, setFrameUrl] = React.useState<string>(EMPTY);
  const [recent, setRecent] = React.useState<RecentDeploy[]>(() => getRecentDeploys());

  // 同步 props.seedUrl（DeployPreviewCard 推送的部署 URL）→ 自动加载到 iframe。
  React.useEffect(() => {
    if (!props.seedUrl) return;
    recordDeployUrl(props.seedUrl);
    setRecent(getRecentDeploys());
    setUrl(props.seedUrl);
    setFrameUrl(props.seedUrl);
  }, [props.seedUrl]);

  // 监听 localStorage 事件，其他 tab 或同 tab 内部 recordDeployUrl 后同步刷新列表。
  React.useEffect(() => {
    const onStorage = () => setRecent(getRecentDeploys());
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<RecentDeploy[]>).detail;
      setRecent(Array.isArray(detail) ? detail : getRecentDeploys());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("cloudbase-dsh:recent-deploys", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("cloudbase-dsh:recent-deploys", onCustom as EventListener);
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
    // 强制 iframe 重新加载：变更 key 或在 src 加时间戳。
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
            title="CloudBase preview"
            src={frameUrl}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
}
