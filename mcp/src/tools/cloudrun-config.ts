/**
 * CloudRun serverConfig merge (RMW) and DiffConfigItem helpers.
 * Aligns with console SubmitServerConfigChangeDiff field mapping.
 */

import { t } from "../i18n/index.js";

export type CloudRunVpcConf = {
  VpcId?: string;
  SubnetId?: string;
  VpcCIDR?: string;
  SubnetCIDR?: string;
};

export type CloudRunServerConfigLike = Record<string, unknown> & {
  VpcConf?: CloudRunVpcConf | null;
  EnvParams?: string;
  OpenAccessTypes?: string[];
  Cpu?: number;
  Mem?: number;
};

export type DiffConfigItem = {
  Key: string;
  Value?: string;
  IntValue?: number;
  FloatValue?: number;
  BoolValue?: boolean;
  ArrayValue?: string[];
  PolicyDetails?: unknown;
  TimerScale?: unknown;
  VpcConf?: CloudRunVpcConf;
  VolumesConf?: unknown;
  PublicNetConf?: unknown;
};

const SUBMIT_DIFF_MAP: Record<string, string> = {
  Cpu: "CpuSpecs",
  Mem: "MemSpecs",
  OpenAccessTypes: "AccessTypes",
  EnvParams: "EnvParam",
  CustomLogs: "LogPath",
};

/**
 * 嵌套结构字段白名单。唯一真源是 @cloudbase/manager-node 的
 * `types/cloudrun/type.d.ts`（IVpcConf / IVolumeConf / IPublicNetConf）。
 *
 * 为什么需要：2026-07 一次性加 12 个 serverConfig 参数时只抄了字段名、没对类型，
 * `VolumesConf.VolumeName`、`PublicNetConf.PublicAccess` 这些 API 根本不认的字段
 * 一路透传到 CreateCloudRunServer / UpdateCloudRunServer，换回一句
 * "The parameter X is not recognized"，用户完全不知道该改成什么。
 * 契约测试只能挡住我们自己写的新字段，这里挡的是任意来源的脏 key。
 */
export const NESTED_OBJECT_KEYS: Record<string, Set<string>> = {
  VpcConf: new Set(["VpcId", "SubnetId", "VpcCIDR", "SubnetCIDR"]),
  PublicNetConf: new Set(["PublicNetStatus"]),
  VolumesConf: new Set([
    "Type",
    "BucketName",
    "Endpoint",
    "KeyID",
    "DstPath",
    "SrcPath",
    "MountIP",
    "ReadOnly",
    "InstanceId",
  ]),
};

/**
 * 嵌套对象/数组里的 key 必须全在白名单内，否则本地抛错。
 * 抛错信息带上「这一项支持哪些字段」，让调用方一次就能改对。
 */
function assertKnownNestedKeys(path: string, value: unknown): void {
  const allowed = NESTED_OBJECT_KEYS[path];
  if (!allowed) return;
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    for (const key of Object.keys(entry as Record<string, unknown>)) {
      if (allowed.has(key)) continue;
      throw new Error(
        t("cloudrunConfig.unknownNestedKey", {
          path,
          key,
          allowed: [...allowed].join(", "),
        }),
      );
    }
  }
}

const STRING_KEYS = new Set([
  "CustomLogs",
  "EnvParams",
  "CreateTime",
  "Dockerfile",
  "BuildDir",
  "LogType",
  "LogSetId",
  "LogTopicId",
  "LogParseType",
  "Tag",
  "InternalAccess",
  "InternalDomain",
  "OperationMode",
  "SessionAffinity",
]);

const INT_KEYS = new Set(["MinNum", "MaxNum", "InitialDelaySeconds", "Port"]);
const BOOL_KEYS = new Set(["HasDockerfile"]);
const FLOAT_KEYS = new Set(["Cpu", "Mem"]);
const ARRAY_KEYS = new Set(["OpenAccessTypes", "EntryPoint", "Cmd"]);

function parseEnvParamsObject(raw?: string | null): Record<string, string> {
  if (!raw || !String(raw).trim()) {
    return {};
  }
  try {
    const value = JSON.parse(String(raw));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      out[k] = typeof v === "string" ? v : String(v);
    }
    return out;
  } catch {
    return {};
  }
}

function stringifyEnvParams(obj: Record<string, string>): string {
  return JSON.stringify(obj);
}

function isCompleteVpcConf(vpc?: CloudRunVpcConf | null): boolean {
  return Boolean(vpc?.VpcId?.trim() && vpc?.SubnetId?.trim());
}

/**
 * Merge remote ServerConfig with deploy/update input.
 * Explicit input wins for provided fields; EnvParams merges by key unless replaceAll.
 */
export function mergeCloudRunServerConfig(options: {
  remote?: CloudRunServerConfigLike | null;
  input?: CloudRunServerConfigLike | null;
  envParamsReplaceAll?: boolean;
}): {
  merged: CloudRunServerConfigLike;
  mergedFromRemote: string[];
} {
  const remote = options.remote || {};
  const input = options.input || {};
  const mergedFromRemote: string[] = [];
  const merged: CloudRunServerConfigLike = { ...input };

  if (isCompleteVpcConf(input.VpcConf)) {
    merged.VpcConf = {
      VpcId: input.VpcConf!.VpcId!.trim(),
      SubnetId: input.VpcConf!.SubnetId!.trim(),
      ...(input.VpcConf!.VpcCIDR ? { VpcCIDR: input.VpcConf!.VpcCIDR } : {}),
      ...(input.VpcConf!.SubnetCIDR ? { SubnetCIDR: input.VpcConf!.SubnetCIDR } : {}),
    };
  } else if (isCompleteVpcConf(remote.VpcConf)) {
    merged.VpcConf = {
      VpcId: remote.VpcConf!.VpcId!.trim(),
      SubnetId: remote.VpcConf!.SubnetId!.trim(),
      ...(remote.VpcConf!.VpcCIDR ? { VpcCIDR: remote.VpcConf!.VpcCIDR } : {}),
      ...(remote.VpcConf!.SubnetCIDR ? { SubnetCIDR: remote.VpcConf!.SubnetCIDR } : {}),
    };
    mergedFromRemote.push("VpcConf");
  } else {
    delete merged.VpcConf;
  }

  const inputHasEnv = Object.prototype.hasOwnProperty.call(input, "EnvParams");
  const remoteEnv = parseEnvParamsObject(remote.EnvParams);
  const inputEnv = parseEnvParamsObject(input.EnvParams);

  if (options.envParamsReplaceAll && inputHasEnv) {
    merged.EnvParams = stringifyEnvParams(inputEnv);
  } else if (inputHasEnv || Object.keys(remoteEnv).length > 0) {
    const combined = options.envParamsReplaceAll
      ? { ...inputEnv }
      : { ...remoteEnv, ...inputEnv };
    if (Object.keys(remoteEnv).length > 0 && !options.envParamsReplaceAll) {
      const preserved = Object.keys(remoteEnv).filter((k) => !(k in inputEnv));
      if (preserved.length > 0) {
        mergedFromRemote.push("EnvParams");
      }
    }
    if (Object.keys(combined).length > 0 || inputHasEnv) {
      merged.EnvParams = stringifyEnvParams(combined);
    }
  }

  // Must be explicit so Manager SDK update path cannot wipe with OA/PUBLIC/MINIAPP defaults.
  if (Array.isArray(input.OpenAccessTypes) && input.OpenAccessTypes.length > 0) {
    merged.OpenAccessTypes = [...input.OpenAccessTypes];
  } else if (Array.isArray(remote.OpenAccessTypes) && remote.OpenAccessTypes.length > 0) {
    merged.OpenAccessTypes = [...remote.OpenAccessTypes];
    mergedFromRemote.push("OpenAccessTypes");
  }

  return { merged, mergedFromRemote };
}

export function assertCpuMemPair(config: CloudRunServerConfigLike): void {
  const hasCpu = config.Cpu !== undefined && config.Cpu !== null;
  const hasMem = config.Mem !== undefined && config.Mem !== null;
  if (hasCpu !== hasMem) {
    throw new Error(t("cloudrunConfig.cpuMemPairRequired"));
  }
}

/**
 * Convert serverConfig object to DiffConfigItem[] for SubmitServerConfigChangeDiff.
 */
export function parseServerConfigToDiffItems(
  data: CloudRunServerConfigLike,
): DiffConfigItem[] {
  assertCpuMemPair(data);
  const Items: DiffConfigItem[] = [];

  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const Key = SUBMIT_DIFF_MAP[k] || k;

    if (STRING_KEYS.has(k)) {
      if (v !== "") {
        Items.push({ Key, Value: String(v) });
      }
    } else if (INT_KEYS.has(k)) {
      Items.push({ Key, IntValue: Number(v) });
    } else if (BOOL_KEYS.has(k)) {
      Items.push({ Key, BoolValue: Boolean(v) });
    } else if (FLOAT_KEYS.has(k)) {
      Items.push({ Key, FloatValue: Number(v) });
    } else if (ARRAY_KEYS.has(k)) {
      Items.push({ Key, ArrayValue: v as string[] });
    } else if (k === "PolicyDetails") {
      Items.push({ Key, PolicyDetails: v });
    } else if (k === "TimerScale") {
      Items.push({ Key, TimerScale: v });
    } else if (k === "VpcConf") {
      assertKnownNestedKeys(k, v);
      Items.push({ Key, VpcConf: v as CloudRunVpcConf });
    } else if (k === "VolumesConf") {
      assertKnownNestedKeys(k, v);
      Items.push({ Key, VolumesConf: v });
    } else if (k === "PublicNetConf") {
      assertKnownNestedKeys(k, v);
      Items.push({ Key, PublicNetConf: v });
    }
  }

  return Items;
}

export function summarizeConfigSnapshot(config?: CloudRunServerConfigLike | null): {
  hasVpcConf: boolean;
  vpcId?: string;
  subnetId?: string;
  openAccessTypes?: string[];
  envParamKeys: string[];
} {
  const vpc = config?.VpcConf;
  const envKeys = Object.keys(parseEnvParamsObject(config?.EnvParams));
  return {
    hasVpcConf: isCompleteVpcConf(vpc),
    ...(vpc?.VpcId ? { vpcId: vpc.VpcId } : {}),
    ...(vpc?.SubnetId ? { subnetId: vpc.SubnetId } : {}),
    ...(Array.isArray(config?.OpenAccessTypes)
      ? { openAccessTypes: config!.OpenAccessTypes }
      : {}),
    envParamKeys: envKeys,
  };
}

export const CONFIG_FIELDS_LIKELY_REDEPLOY = [
  "VpcConf",
  "EnvParams",
  "Cpu",
  "Mem",
  "Port",
  "Dockerfile",
  "BuildDir",
  "VolumesConf",
  "LogType",
  "LogSetId",
  "LogTopicId",
] as const;

export function listLikelyRedeployFields(
  config: CloudRunServerConfigLike,
): string[] {
  return CONFIG_FIELDS_LIKELY_REDEPLOY.filter((k) =>
    Object.prototype.hasOwnProperty.call(config, k),
  );
}
