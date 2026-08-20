import { formatBytes } from "./term-map.js";
import type {
  CloudFunctionDetail,
  CloudFunctionSummary,
  CloudRunDeployRecord,
  CloudRunService,
  CloudRunVersion,
  FunctionLogRow,
  HostingInfo,
  StorageBucket,
} from "../shared/types.js";

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

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export const BUCKET_WRITE_UNSUPPORTED = {
  supported: false as const,
  reason:
    "Creating or deleting COS buckets has no public tcb control-plane API. tcb/CreateBucket is PG store, not COS.",
};

export const INVOKE_UNSUPPORTED = {
  supported: false as const,
  reason: "tcb/InvokeFunction is retired; no public control-plane invoke Action remains.",
};

export function mapFunctionSummary(item: unknown): CloudFunctionSummary | undefined {
  const row = rec(item);
  const name = str(row.FunctionName ?? row.functionName ?? row.Name);
  if (!name) return undefined;
  return {
    name,
    runtime: str(row.Runtime ?? row.runtime),
    status: str(row.Status ?? row.status),
    invokeCount: num(row.InvokeNum ?? row.InvocationCount ?? row.TriggersCount),
    updatedAt: str(row.ModTime ?? row.UpdatedAt ?? row.AddTime ?? row.ModifyTime),
  };
}

export function mapFunctionDetail(payload: unknown, name: string): CloudFunctionDetail {
  const root = rec(payload);
  const fn = rec(root.Function ?? root);
  const env = rec(fn.Environment ?? root.Environment);
  const triggers = arr(fn.Triggers ?? root.Triggers).map((item) => {
    const row = rec(item);
    return {
      name: str(row.TriggerName ?? row.Name ?? row.name) ?? "trigger",
      type: str(row.Type ?? row.type) ?? "unknown",
      triggerDesc: str(row.TriggerDesc ?? row.TriggerDescStr ?? row.qualifier),
    };
  });
  const environment = arr(env.Variables ?? env.variables).map((item) => {
    const row = rec(item);
    return {
      key: str(row.Key ?? row.key ?? row.Name) ?? "",
      value: str(row.Value ?? row.value) ?? "",
    };
  }).filter((item) => item.key);
  return {
    name: str(fn.FunctionName ?? root.FunctionName) ?? name,
    runtime: str(fn.Runtime ?? root.Runtime),
    status: str(fn.Status ?? root.Status),
    handler: str(fn.Handler ?? root.Handler),
    timeout: num(fn.Timeout ?? root.Timeout),
    memorySize: num(fn.MemorySize ?? root.MemorySize),
    environment,
    triggers,
  };
}

export function mapFunctionLogs(payload: unknown): FunctionLogRow[] {
  const root = rec(payload);
  const items = arr(root.Data ?? root.Results ?? root.logs ?? root.items);
  return items.map((item, index) => {
    const row = rec(item);
    return {
      requestId: str(row.RequestId ?? row.requestId) ?? String(index),
      startTime: str(row.StartTime ?? row.Time ?? row.time),
      duration: str(row.Duration ?? row.duration),
      status: str(row.RetCode ?? row.Status ?? row.Level ?? row.level),
      log: str(row.Log ?? row.log ?? row.Msg ?? row.message),
    };
  });
}

export function mapCloudRunService(item: unknown): CloudRunService | undefined {
  const row = rec(item);
  const name = str(row.ServerName ?? row.ServiceName ?? row.Name ?? row.serverName);
  if (!name) return undefined;
  const min = num(row.MinNum ?? row.MinReplicas);
  const max = num(row.MaxNum ?? row.MaxReplicas);
  const instance =
    min != null || max != null ? `${min ?? "—"}-${max ?? "—"}` : str(row.InstanceCount);
  return {
    name,
    status: str(row.Status ?? row.status),
    version: str(row.VersionName ?? row.RunId ?? row.version),
    traffic: str(row.Traffic ?? row.FlowRatio) ?? (num(row.Traffic) != null ? String(num(row.Traffic)) : undefined),
    cpu: str(row.Cpu ?? row.CPU),
    memory: str(row.Mem ?? row.Memory ?? row.Ram),
    instanceCount: instance,
  };
}

export function mapCloudRunVersions(payload: unknown): CloudRunVersion[] {
  const root = rec(payload);
  const items = arr(
    root.VersionItems ?? root.ServerVersions ?? root.Versions ?? rec(root.Server).VersionItems,
  );
  return items.map((item) => {
    const row = rec(item);
    return {
      versionName: str(row.VersionName ?? row.Name ?? row.versionName) ?? "unknown",
      status: str(row.Status ?? row.status),
      deployedAt: str(row.CreatedTime ?? row.UpdateTime ?? row.DeployTime),
    };
  });
}

export function mapCloudRunDeploys(payload: unknown): CloudRunDeployRecord[] {
  const root = rec(payload);
  const items = arr(root.DeployRecords ?? root.Records ?? root.items);
  return items.map((item, index) => {
    const row = rec(item);
    return {
      id: str(row.BuildId ?? row.DeployId ?? row.Id) ?? String(index),
      status: str(row.Status ?? row.status),
      deployedAt: str(row.CreatedTime ?? row.DeployTime ?? row.UpdateTime),
      versionName: str(row.VersionName ?? row.versionName),
    };
  });
}

export function mapLogLines(payload: unknown): string[] {
  const root = rec(payload);
  const text = str(root.Log ?? root.Logs ?? root.Content);
  if (text) return text.split("\n");
  return arr(root.LogList ?? root.items).map((item) => {
    if (typeof item === "string") return item;
    const row = rec(item);
    return str(row.Log ?? row.message ?? row.Msg) ?? JSON.stringify(item);
  });
}

export function mapHostingInfo(hosting: unknown, env: unknown): HostingInfo {
  const payload = rec(hosting);
  const envRow = rec(env);
  const domainRows = arr(payload.DomainSet ?? payload.Domains ?? payload.domains);
  const domains: Array<{ domain: string; status?: string }> = [];
  for (const item of domainRows) {
    const row = rec(item);
    const domain = str(row.Domain ?? row.domain);
    if (!domain) continue;
    domains.push({ domain, status: str(row.Status ?? row.status) });
  }
  const staticStorages = arr(envRow.StaticStorages ?? envRow.staticStorages);
  const staticDomain = str(rec(staticStorages[0]).StaticDomain ?? rec(staticStorages[0]).CdnDomain);
  const defaultUrl =
    str(payload.DefaultDomain ?? payload.defaultDomain) ??
    (staticDomain ? `https://${staticDomain}` : undefined);
  return { domains, defaultUrl };
}

export function mapStorageBuckets(envPayload: unknown): StorageBucket[] {
  const env = rec(arr(rec(envPayload).EnvList)[0]);
  return arr(env.Storages ?? env.storages).map((item) => {
    const row = rec(item);
    const size = num(row.Size ?? row.StorageSize);
    return {
      name: str(row.Bucket ?? row.bucket ?? row.Name) ?? "unknown",
      region: str(row.Region ?? row.region),
      createdAt: str(row.CreateTime ?? row.createdAt ?? row.AddTime),
      sizeLabel: size != null ? formatBytes(size) : str(row.Size),
      cdnDomain: str(row.CdnDomain ?? row.Domain),
    };
  });
}

export function countHostingDomains(payload: unknown): number {
  const info = mapHostingInfo(payload, {});
  return info.domains.length || (info.defaultUrl ? 1 : 0);
}
