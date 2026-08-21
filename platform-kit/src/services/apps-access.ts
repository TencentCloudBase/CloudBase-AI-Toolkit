import type { AccessEndpoint, DeploymentRecord, DeploymentStatus } from "../core/types.js";

type LooseRecord = Record<string, unknown>;

function rec(value: unknown): LooseRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function unwrapPayload(payload: unknown): LooseRecord {
  const root = rec(payload);
  const data = rec(root.data);
  return Object.keys(data).length > 0 ? data : root;
}

export function normalizeUrl(domainOrUrl: string): string {
  const trimmed = domainOrUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function mapAppListItem(item: unknown): { serviceName: string; domain?: string } | undefined {
  const row = rec(item);
  const serviceName = str(row.ServiceName ?? row.serviceName);
  if (!serviceName) return undefined;
  const domain = str(row.Domain ?? row.domain);
  return { serviceName, domain };
}

export function mapAppToEndpoint(
  serviceName: string,
  appInfo: unknown,
): AccessEndpoint | undefined {
  const row = rec(appInfo);
  const domain = str(row.Domain ?? row.domain ?? row.AccessUrl ?? row.accessUrl);
  if (!domain) return undefined;
  return {
    id: `app:${serviceName}`,
    label: serviceName,
    url: normalizeUrl(domain),
    resourceType: "app",
    serviceName,
  };
}

export function mapVersionToDeployment(
  serviceName: string,
  version: unknown,
  previewUrl?: string,
): DeploymentRecord | undefined {
  const row = rec(version);
  const buildId = str(row.BuildId ?? row.buildId);
  const versionName = str(row.VersionName ?? row.versionName ?? row.Version ?? row.version);
  const statusRaw = str(row.Status ?? row.status) ?? "unknown";
  const status = normalizeDeployStatus(statusRaw);
  const deployedAt =
    str(row.CreateTime ?? row.createTime ?? row.DeployTime ?? row.deployTime ?? row.UpdateTime) ??
    undefined;
  const id = buildId ?? versionName ?? `${serviceName}-${deployedAt ?? "unknown"}`;
  return {
    id: `app:${serviceName}:${id}`,
    resourceType: "app",
    resourceName: serviceName,
    status,
    deployedAt,
    previewUrl,
    buildId,
    versionName,
    relatedResources: [{ type: "app", name: serviceName }],
  };
}

export function normalizeDeployStatus(raw: string): DeploymentStatus {
  const lower = raw.toLowerCase();
  if (lower === "success" || lower === "succeed" || lower === "ready" || lower === "active") {
    return "success";
  }
  if (lower === "failed" || lower === "fail" || lower === "error") return "failed";
  if (lower.includes("build") || lower === "running" || lower === "processing") return "building";
  if (lower === "pending" || lower === "waiting" || lower === "queue") return "pending";
  return "unknown";
}

export function sortDeploymentsNewestFirst(items: DeploymentRecord[]): DeploymentRecord[] {
  return [...items].sort((a, b) => {
    const ta = a.deployedAt ? Date.parse(a.deployedAt) : 0;
    const tb = b.deployedAt ? Date.parse(b.deployedAt) : 0;
    return tb - ta;
  });
}

export function extractAppsFromListPayload(payload: unknown): unknown[] {
  const root = unwrapPayload(payload);
  return arr(root.apps ?? root.ServiceList ?? root.serviceList);
}

export function extractVersionsFromListPayload(payload: unknown): unknown[] {
  const root = unwrapPayload(payload);
  return arr(root.versions ?? root.VersionList ?? root.versionList);
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}
