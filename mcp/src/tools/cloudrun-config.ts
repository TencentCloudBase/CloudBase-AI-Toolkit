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
      Items.push({ Key, VpcConf: v as CloudRunVpcConf });
    } else if (k === "VolumesConf") {
      Items.push({ Key, VolumesConf: v });
    } else if (k === "PublicNetConf") {
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
