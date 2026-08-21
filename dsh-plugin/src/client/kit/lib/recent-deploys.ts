import { KIT_EVENTS } from "../provider.js";

// 跨组件共享"最近访问地址"：UrlPreview / DeployPreviewCard 记录，webview 自动加载。
const STORAGE_KEY = "cloudbase-dsh:recent-deploys";
const MAX_ENTRIES = 5;

export interface RecentDeploy {
  url: string;
  domain: string;
  recordedAt: number;
}

function readStore(): RecentDeploy[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): RecentDeploy | null => {
        const rec = item as Record<string, unknown>;
        if (typeof rec.url !== "string" || rec.url.length === 0) return null;
        return {
          url: rec.url,
          domain: typeof rec.domain === "string" ? rec.domain : rec.url.replace(/^https?:\/\//, ""),
          recordedAt: typeof rec.recordedAt === "number" ? rec.recordedAt : 0,
        };
      })
      .filter((item): item is RecentDeploy => item !== null);
  } catch {
    return [];
  }
}

function writeStore(entries: RecentDeploy[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(KIT_EVENTS.recentDeploys, { detail: entries }));
    }
  } catch {
    // localStorage 写入失败时静默——预览列表退化到内存。
  }
}

export function getRecentDeploys(): RecentDeploy[] {
  return readStore();
}

/**
 * 记录一次访问地址。返回 true 表示这是新 URL（首次出现），调用方可用它触发"切换到预览"。
 */
export function recordDeployUrl(url: string | undefined): boolean {
  if (!url || !url.startsWith("http")) return false;
  const domain = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const existing = readStore();
  const isNew = !existing.some((entry) => entry.url === url);
  const next: RecentDeploy[] = [
    { url, domain, recordedAt: Date.now() },
    ...existing.filter((entry) => entry.url !== url),
  ].slice(0, MAX_ENTRIES);
  writeStore(next);
  return isNew;
}
