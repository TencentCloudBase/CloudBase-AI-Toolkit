import type {
  CdnCacheItem,
  CloudFunctionDetail,
  CloudFunctionLog,
  CloudFunctionSummary,
  CloudFunctionTrigger,
  CloudRunDeployRecord,
  CloudRunLogLine,
  CloudRunService,
  CloudRunVersion,
  HostingDomain,
  HostingVersion,
  StorageBucket,
} from "../core/types.js";

type LooseRecord = Record<string, unknown>;

export function rec(value: unknown): LooseRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function filterFunctions(
  items: CloudFunctionSummary[],
  keyword: string,
): CloudFunctionSummary[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(kw) ||
      item.runtime?.toLowerCase().includes(kw) ||
      item.status?.toLowerCase().includes(kw),
  );
}

export function mapFunctionSummary(item: unknown): CloudFunctionSummary | undefined {
  const row = rec(item);
  const name = str(row.FunctionName ?? row.functionName ?? row.Name);
  if (!name) return undefined;
  return {
    name,
    runtime: str(row.Runtime ?? row.runtime),
    status: str(row.Status ?? row.status),
    invokeCount: num(row.InvokeCount ?? row.invokeCount ?? row.InvocationCount),
    updatedAt: str(row.ModTime ?? row.UpdateTime ?? row.updatedAt ?? row.AddTime),
  };
}

export function mapFunctionTrigger(item: unknown): CloudFunctionTrigger | undefined {
  const row = rec(item);
  const name = str(row.TriggerName ?? row.Name ?? row.name ?? row.Type ?? row.type);
  if (!name) return undefined;
  return {
    name,
    type: str(row.Type ?? row.type ?? row.TriggerType) ?? "unknown",
    triggerDesc: str(row.TriggerDesc ?? row.TriggerDescStr ?? row.qualifier ?? row.TriggerDesc),
  };
}

export function mapFunctionDetail(payload: unknown, fallbackName: string): CloudFunctionDetail {
  const root = rec(payload);
  const fn = rec(root.Function);
  const row = Object.keys(fn).length > 0 ? { ...root, ...fn } : root;
  const env = rec(row.Environment);
  const variables = arr(env.Variables ?? env.variables);
  const triggers = arr(row.Triggers ?? row.triggers)
    .map(mapFunctionTrigger)
    .filter((item): item is CloudFunctionTrigger => Boolean(item));
  return {
    name: str(row.FunctionName ?? row.Name) ?? fallbackName,
    runtime: str(row.Runtime),
    status: str(row.Status),
    invokeCount: num(row.InvokeCount),
    updatedAt: str(row.ModTime ?? row.UpdateTime),
    handler: str(row.Handler),
    timeout: num(row.Timeout),
    memorySize: num(row.MemorySize),
    description: str(row.Description),
    environment: variables
      .map((item) => {
        const entry = rec(item);
        const key = str(entry.Key ?? entry.key ?? entry.Name);
        if (!key) return undefined;
        return { key, value: str(entry.Value ?? entry.value) ?? "" };
      })
      .filter((item): item is { key: string; value: string } => Boolean(item)),
    triggers,
  };
}

export function mapFunctionLog(item: unknown): CloudFunctionLog | undefined {
  const row = rec(item);
  const message =
    str(row.RetMsg ?? row.Log ?? row.message ?? row.Msg ?? row.content) ?? "";
  return {
    requestId: str(row.RequestId ?? row.requestId),
    time: str(row.StartTime ?? row.Time ?? row.time),
    durationMs: num(row.Duration ?? row.duration),
    message,
  };
}

export function mapCloudRunService(item: unknown): CloudRunService | undefined {
  const row = rec(item);
  const config = rec(row.ServerConfig ?? row.Config);
  const name = str(row.ServerName ?? row.Name ?? row.ServiceName ?? config.ServerName);
  if (!name) return undefined;
  return {
    name,
    status: str(row.Status ?? row.ServerStatus ?? config.Status),
    version: str(row.VersionName ?? row.CurrentVersion ?? config.VersionName),
    traffic: str(row.FlowRatio ?? row.Traffic ?? config.FlowRatio),
    cpu: str(config.Cpu ?? row.Cpu),
    memory: str(config.Mem ?? config.Memory ?? row.Mem),
    instanceCount: num(config.MinNum ?? config.MaxNum ?? row.InstanceCount),
  };
}

export function mapCloudRunVersion(item: unknown): CloudRunVersion | undefined {
  const row = rec(item);
  const versionName = str(row.VersionName ?? row.versionName ?? row.Name);
  if (!versionName) return undefined;
  return {
    versionName,
    status: str(row.Status ?? row.status),
    deployedAt: str(row.UpdateTime ?? row.CreateTime ?? row.DeployedAt),
    flowRatio: num(row.FlowRatio ?? row.flowRatio),
  };
}

export function mapCloudRunDeploy(item: unknown): CloudRunDeployRecord | undefined {
  const row = rec(item);
  const id =
    str(row.RunId ?? row.BuildId ?? row.DeployId ?? row.Id) ??
    str(row.VersionName) ??
    undefined;
  if (!id) return undefined;
  return {
    id,
    status: str(row.Status ?? row.status),
    deployedAt: str(row.CreateTime ?? row.UpdateTime ?? row.DeployTime),
    buildId: str(row.BuildId),
    runId: str(row.RunId),
  };
}

export function mapCloudRunLogLine(item: unknown): CloudRunLogLine {
  if (typeof item === "string") return { message: item };
  const row = rec(item);
  return {
    time: str(row.Time ?? row.time ?? row.Timestamp),
    message: str(row.Text ?? row.Log ?? row.message ?? row.Msg) ?? JSON.stringify(item),
  };
}

export function mapHostingDomain(item: unknown, kind: HostingDomain["kind"] = "custom"): HostingDomain | undefined {
  if (typeof item === "string" && item) return { domain: item, kind };
  const row = rec(item);
  const domain = str(row.Domain ?? row.domain ?? row.StaticDomain ?? row.DefaultDomain);
  if (!domain) return undefined;
  return {
    domain,
    status: str(row.Status ?? row.status),
    kind,
  };
}

export function mapHostingVersion(serviceName: string, item: unknown): HostingVersion | undefined {
  const row = rec(item);
  const versionName = str(row.VersionName ?? row.versionName ?? row.BuildId) ?? "unknown";
  return {
    serviceName,
    versionName,
    status: str(row.Status ?? row.status),
    deployedAt: str(row.CreateTime ?? row.UpdateTime ?? row.deployedAt),
  };
}

export function mapStorageBucket(item: unknown, kind: StorageBucket["kind"] = "storage"): StorageBucket | undefined {
  const row = rec(item);
  const name = str(row.Bucket ?? row.BucketName ?? row.Name ?? row.name);
  if (!name) return undefined;
  return {
    name,
    region: str(row.Region ?? row.region),
    createdAt: str(row.CreateTime ?? row.createdAt),
    sizeLabel: str(row.Size ?? row.sizeLabel),
    cdnDomain: str(row.CdnDomain ?? row.CustomDomain),
    kind,
  };
}

export function mapCdnCacheItem(item: unknown, bucket?: string): CdnCacheItem {
  const row = rec(item);
  return {
    id: str(row.TaskId ?? row.Id ?? row.RequestId) ?? bucket ?? "cdn",
    status: str(row.Status ?? row.status) ?? "unknown",
    bucket,
  };
}

export const FN_LOGS_CLS_FALLBACK = /请升级到最新版开发者工具|当前版本不支持更多日志检索/;
export const BUILD_LOG_CODING =
  "Build logs need a linked build account. Use process logs for image deploys.";