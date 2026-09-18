import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { z } from "zod";
import { getCloudBaseManager, getEnvId } from '../cloudbase-manager.js';
import { t } from '../i18n/index.js';
import { ExtendedMcpServer } from '../server.js';
import type { CloudBaseOptions } from '../types.js';
import { debug } from '../utils/logger.js';
import { preferGatewayOrFallback, resolveGatewayAccessUrls } from '../utils/gateway-access-urls.js';
import { sendDeployNotification } from '../utils/notification.js';
import { buildCamAuthGuidance, isCamAuthError } from './capi.js';
import {
  listLikelyRedeployFields,
  mergeCloudRunServerConfig,
  parseServerConfigToDiffItems,
  summarizeConfigSnapshot,
  type CloudRunServerConfigLike,
} from './cloudrun-config.js';

// CloudRun service types
export const CLOUDRUN_SERVICE_TYPES = ['function', 'container'] as const;
export type CloudRunServiceType = typeof CLOUDRUN_SERVICE_TYPES[number];

// CloudRun access types
export const CLOUDRUN_ACCESS_TYPES = ['OA', 'PUBLIC', 'MINIAPP', 'VPC'] as const;
export type CloudRunAccessType = typeof CLOUDRUN_ACCESS_TYPES[number];

// CloudRun env package types (CreateCloudRunEnv.PackageType)
export const CLOUDRUN_PACKAGE_TYPES = ['Trial', 'Standard', 'Professional', 'Enterprise'] as const;
export type CloudRunPackageType = typeof CLOUDRUN_PACKAGE_TYPES[number];

/** 环境变量脱敏后的占位值（不保留任何明文片段）。 */
export const MASKED_CLOUDRUN_ENV_VALUE = "***";

/**
 * 对云托管 detail 返回的 ServerConfig.EnvParams（JSON 字符串）做脱敏：
 * 解析后把所有 value 置为占位符、保留 key，再序列化回 JSON 字符串。
 * 解析失败（非 JSON）时整串替换为占位符，避免任何明文片段外泄。
 * 用于默认工具返回，避免明文进入模型上下文。
 */
export function maskCloudRunDetailEnvParams<
  T extends { ServerConfig?: { EnvParams?: string } | null },
>(detail: T): T {
  const envParams = detail?.ServerConfig?.EnvParams;
  if (typeof envParams !== "string" || envParams === "") {
    return detail;
  }

  let masked: string;
  try {
    const parsed = JSON.parse(envParams);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      masked = JSON.stringify(
        Object.fromEntries(
          Object.entries(parsed).map(([key]) => [key, MASKED_CLOUDRUN_ENV_VALUE]),
        ),
      );
    } else {
      masked = MASKED_CLOUDRUN_ENV_VALUE;
    }
  } catch {
    masked = MASKED_CLOUDRUN_ENV_VALUE;
  }

  return {
    ...detail,
    ServerConfig: {
      ...detail.ServerConfig,
      EnvParams: masked,
    },
  } as T;
}

// Input schema for queryCloudRun tool
const queryCloudRunInputSchema = {
  action: z.enum(['list', 'detail', 'templates', 'getDeployLog', 'getProcessLog', 'getDeployRecords', 'envStatus', 'getManageTask']).describe('cloudrun.schema.query.action'),

  // List operation parameters
  pageSize: z.number().min(1).max(100).optional().default(10).describe('cloudrun.schema.query.pageSize'),
  pageNum: z.number().min(1).optional().default(1).describe('cloudrun.schema.query.pageNum'),
  serverName: z.string().optional().describe('cloudrun.schema.query.serverName'),
  serverType: z.enum(CLOUDRUN_SERVICE_TYPES).optional().describe('cloudrun.schema.query.serverType'),
  envId: z.string().optional().describe('cloudrun.schema.query.envId'),

  // Detail and log operation parameters
  detailServerName: z.string().optional().describe('cloudrun.schema.query.detailServerName'),
  buildId: z.number().optional().describe('cloudrun.schema.query.buildId'),
  runId: z.string().optional().describe('cloudrun.schema.query.runId'),
  revealEnvParams: z.boolean().optional().default(false).describe('cloudrun.schema.query.revealEnvParams'),
};

/** init 缺省模板，与 schema 默认值保持一致（SDK 侧同样回退到该模板） */
const DEFAULT_INIT_TEMPLATE = "helloworld";

// Input schema for manageCloudRun tool
const ManageCloudRunInputSchema = {
  action: z.enum(['init', 'download', 'run', 'deploy', 'delete', 'createAgent', 'updateConfig', 'initEnv', 'traffic']).describe('cloudrun.schema.manage.action'),
  serverName: z.string().describe('cloudrun.schema.manage.serverName'),

  // Traffic management operation parameters (action=traffic)
  trafficOp: z.enum(['set', 'promote', 'rollback']).optional().describe('cloudrun.schema.manage.trafficOp'),
  stablePercent: z.number().min(0).max(100).optional().describe('cloudrun.schema.manage.stablePercent'),
  canaryPercent: z.number().min(0).max(100).optional().describe('cloudrun.schema.manage.canaryPercent'),

  // InitEnv operation parameters
  envId: z.string().optional().describe('cloudrun.schema.manage.envId'),
  packageType: z.enum(CLOUDRUN_PACKAGE_TYPES).optional().default('Trial').describe('cloudrun.schema.manage.packageType'),
  vpcId: z.string().optional().describe('cloudrun.schema.manage.vpcId'),
  subnetIds: z.array(z.string()).optional().describe('cloudrun.schema.manage.subnetIds'),

  // Deploy operation parameters
  targetPath: z.string().optional().describe('cloudrun.schema.manage.targetPath'),
  imageUrl: z.string().optional().describe('cloudrun.schema.manage.imageUrl'),
  envParamsReplaceAll: z.boolean().optional().default(false).describe('cloudrun.schema.manage.envParamsReplaceAll'),
  serverConfig: z.object({
    OpenAccessTypes: z.array(z.enum(CLOUDRUN_ACCESS_TYPES)).optional().describe('cloudrun.schema.manage.serverConfig.openAccessTypes'),
    Cpu: z.number().positive().optional().describe('cloudrun.schema.manage.serverConfig.cpu'),
    Mem: z.number().positive().optional().describe('cloudrun.schema.manage.serverConfig.mem'),
    MinNum: z.number().min(0).optional().describe('cloudrun.schema.manage.serverConfig.minNum'),
    MaxNum: z.number().min(1).optional().describe('cloudrun.schema.manage.serverConfig.maxNum'),
    PolicyDetails: z.array(z.object({
      PolicyType: z.enum(['cpu', 'mem', 'cpu/mem']).describe('cloudrun.schema.manage.serverConfig.policyDetails.policyType'),
      PolicyThreshold: z.number().min(1).max(100).describe('cloudrun.schema.manage.serverConfig.policyDetails.policyThreshold')
    })).optional().describe('cloudrun.schema.manage.serverConfig.policyDetails'),
    CustomLogs: z.string().optional().describe('cloudrun.schema.manage.serverConfig.customLogs'),
    Port: z.number().min(1).max(65535).optional().describe('cloudrun.schema.manage.serverConfig.port'),
    EnvParams: z.string().optional().describe('cloudrun.schema.manage.serverConfig.envParams'),
    Dockerfile: z.string().optional().describe('cloudrun.schema.manage.serverConfig.dockerfile'),
    BuildDir: z.string().optional().describe('cloudrun.schema.manage.serverConfig.buildDir'),
    InternalAccess: z.string().optional().describe('cloudrun.schema.manage.serverConfig.internalAccess'),
    InternalDomain: z.string().optional().describe('cloudrun.schema.manage.serverConfig.internalDomain'),
    EntryPoint: z.array(z.string()).optional().describe('cloudrun.schema.manage.serverConfig.entryPoint'),
    Cmd: z.array(z.string()).optional().describe('cloudrun.schema.manage.serverConfig.cmd'),
    InitialDelaySeconds: z.number().min(0).optional().describe('cloudrun.schema.manage.serverConfig.initialDelaySeconds'),
    LogType: z.string().optional().describe('cloudrun.schema.manage.serverConfig.logType'),
    LogSetId: z.string().optional().describe('cloudrun.schema.manage.serverConfig.logSetId'),
    LogTopicId: z.string().optional().describe('cloudrun.schema.manage.serverConfig.logTopicId'),
    LogParseType: z.string().optional().describe('cloudrun.schema.manage.serverConfig.logParseType'),
    Tag: z.string().optional().describe('cloudrun.schema.manage.serverConfig.tag'),
    OperationMode: z.string().optional().describe('cloudrun.schema.manage.serverConfig.operationMode'),
    SessionAffinity: z.string().optional().describe('cloudrun.schema.manage.serverConfig.sessionAffinity'),
    TimerScale: z.array(z.object({
      CycleType: z.enum(['none', 'daily', 'weekly', 'monthly']).describe('cloudrun.schema.manage.serverConfig.timerScale.cycleType'),
      StartDate: z.string().optional().describe('cloudrun.schema.manage.serverConfig.timerScale.startDate'),
      EndDate: z.string().optional().describe('cloudrun.schema.manage.serverConfig.timerScale.endDate'),
      StartTime: z.string().describe('cloudrun.schema.manage.serverConfig.timerScale.startTime'),
      EndTime: z.string().describe('cloudrun.schema.manage.serverConfig.timerScale.endTime'),
      ReplicaNum: z.number().min(0).describe('cloudrun.schema.manage.serverConfig.timerScale.replicaNum')
    })).optional().describe('cloudrun.schema.manage.serverConfig.timerScale'),
    VpcConf: z.object({
      VpcId: z.string().describe('cloudrun.schema.manage.serverConfig.vpcConf.vpcId'),
      SubnetId: z.string().describe('cloudrun.schema.manage.serverConfig.vpcConf.subnetId'),
    }).optional().describe('cloudrun.schema.manage.serverConfig.vpcConf'),
    VolumesConf: z.array(z.object({
      VolumeName: z.string().describe('cloudrun.schema.manage.serverConfig.volumesConf.volumeName'),
      VolumeType: z.string().describe('cloudrun.schema.manage.serverConfig.volumesConf.volumeType'),
      VolumePath: z.string().describe('cloudrun.schema.manage.serverConfig.volumesConf.volumePath')
    })).optional().describe('cloudrun.schema.manage.serverConfig.volumesConf'),
    PublicNetConf: z.object({
      PublicAccess: z.boolean().optional().describe('cloudrun.schema.manage.serverConfig.publicNetConf.publicAccess'),
      PublicAccessPath: z.string().optional().describe('cloudrun.schema.manage.serverConfig.publicNetConf.publicAccessPath')
    }).optional().describe('cloudrun.schema.manage.serverConfig.publicNetConf'),
  }).optional().describe('cloudrun.schema.manage.serverConfig'),

  // Init operation parameters
  template: z.string().optional().default(DEFAULT_INIT_TEMPLATE).describe('cloudrun.schema.manage.template'),

  // Run operation parameters (function services only)
  runOptions: z.object({
    port: z.number().min(1).max(65535).optional().default(3000).describe('cloudrun.schema.manage.runOptions.port'),
    envParams: z.record(z.string()).optional().describe('cloudrun.schema.manage.runOptions.envParams'),
    runMode: z.enum(['normal', 'agent']).optional().default('normal').describe('cloudrun.schema.manage.runOptions.runMode'),
    agentId: z.string().optional().describe('cloudrun.schema.manage.runOptions.agentId')
  }).optional().describe('cloudrun.schema.manage.runOptions'),

  // Agent creation parameters
  agentConfig: z.object({
    agentName: z.string().describe('cloudrun.schema.manage.agentConfig.agentName'),
    botTag: z.string().optional().describe('cloudrun.schema.manage.agentConfig.botTag'),
    description: z.string().optional().describe('cloudrun.schema.manage.agentConfig.description'),
    template: z.string().optional().default('blank').describe('cloudrun.schema.manage.agentConfig.template')
  }).optional().describe('cloudrun.schema.manage.agentConfig'),

  // Common parameters
  force: z.boolean().optional().default(false).describe('cloudrun.schema.manage.force'),
  serverType: z.enum(CLOUDRUN_SERVICE_TYPES).optional().describe('cloudrun.schema.manage.serverType'),

  // Deploy operation parameters
  waitRegistration: z.boolean().optional().default(true).describe('cloudrun.schema.manage.waitRegistration'),
};

type queryCloudRunInput = {
  action: 'list' | 'detail' | 'templates' | 'getDeployLog' | 'getProcessLog' | 'getDeployRecords' | 'envStatus' | 'getManageTask';
  pageSize?: number;
  pageNum?: number;
  serverName?: string;
  serverType?: CloudRunServiceType;
  detailServerName?: string;
  buildId?: number;
  runId?: string;
  envId?: string;
  revealEnvParams?: boolean;
};

type ManageCloudRunInput = {
  action: 'init' | 'download' | 'run' | 'deploy' | 'delete' | 'createAgent' | 'updateConfig' | 'initEnv' | 'traffic';
  serverName: string;
  targetPath?: string;
  imageUrl?: string;
  serverConfig?: any;
  envParamsReplaceAll?: boolean;
  template?: string;
  force?: boolean;
  serverType?: CloudRunServiceType;
  envId?: string;
  packageType?: CloudRunPackageType;
  vpcId?: string;
  subnetIds?: string[];
  trafficOp?: 'set' | 'promote' | 'rollback';
  stablePercent?: number;
  canaryPercent?: number;
  runOptions?: {
    port?: number;
    envParams?: Record<string, string>;
    runMode?: 'normal' | 'agent';
    agentId?: string;
  };
  agentConfig?: {
    agentName: string;
    botTag?: string;
    description?: string;
    template?: string;
  };
  waitRegistration?: boolean;
};

/**
 * Check if a project is an Agent project
 * @param projectPath Project directory path
 * @returns true if it's an Agent project
 */
function checkIfAgentProject(projectPath: string): boolean {
  try {
    // Check if package.json exists and contains @cloudbase/aiagent-framework dependency
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (dependencies['@cloudbase/aiagent-framework']) {
        return true;
      }
    }

    // Check if index.js contains Agent-related code
    const indexJsPath = path.join(projectPath, 'index.js');
    if (fs.existsSync(indexJsPath)) {
      const content = fs.readFileSync(indexJsPath, 'utf8');
      if (content.includes('@cloudbase/aiagent-framework') ||
        content.includes('BotRunner') ||
        content.includes('IBot') ||
        content.includes('BotCore')) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Validate and normalize file path.
 * Accepts absolute paths as-is; for relative paths, resolves against CWD and
 * ensures the result does not escape the CWD (path-traversal protection).
 * @param inputPath User provided path
 * @returns Absolute path
 */
function validateAndNormalizePath(inputPath: string): string {
  const normalizedPath = path.resolve(inputPath);

  // On Windows, path.resolve may return a path on a different drive/UNC share.
  // That is safe — the user explicitly provided an absolute path there.
  // Only apply the traversal check when the resolved path shares the same root
  // as CWD (i.e. the path was relative or on the same drive).
  const cwd = process.cwd();
  const cwdRoot = path.parse(cwd).root;
  const pathRoot = path.parse(normalizedPath).root;

  if (cwdRoot === pathRoot) {
    // Same filesystem root — ensure the resolved path is still inside CWD
    // (or is exactly CWD) to block "../" traversal.
    const prefix = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;
    if (!normalizedPath.startsWith(prefix) && normalizedPath !== cwd) {
      throw new Error(t("cloudrun.error.pathOutsideCwd", { cwd }));
    }
  }
  // Cross-root absolute paths (e.g. D:\ on Windows when CWD is C:\) are
  // allowed — the user own the machine and the path is explicitly absolute.

  return normalizedPath;
}

export function buildManageCloudRunErrorMessage(action: ManageCloudRunInput["action"] | string, serverName: string, error: unknown): string {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const suggestions: string[] = [];

  if (isCamAuthError(baseMessage)) {
    suggestions.push(buildCamAuthGuidance());
  }

  if (/已有部署发布任务运行中|部署发布任务运行中/i.test(baseMessage)) {
    suggestions.push(t("cloudrun.error.deployTaskRunning", { serverName }));
    suggestions.push(t("cloudrun.error.deployTaskRunningForce", { serverName }));
  }

  if (/云托管资源未开通|无法使用系统创建网络|VpcInfo/i.test(baseMessage)) {
    suggestions.push(t("cloudrun.error.vpcRequired"));
  }

  if (suggestions.length === 0) {
    suggestions.push(t("cloudrun.error.genericRetry"));
  }

  return t("cloudrun.error.buildManage", {
    action,
    baseMessage,
    suggestions: suggestions.join(" "),
  });
}

/**
 * Lightweight wait after manageCloudRun deploy: poll until the platform has
 * registered the manage task / assigned identifiers for follow-up log queries.
 * - source builds: prefer BuildId > 0 (getDeployLog)
 * - image deploys: prefer RunId (getProcessLog; BuildId is often 0)
 * Does NOT wait for the full build/deploy (that can take 5–30 minutes).
 * Aligns with tcb CLI's DescribeServerManageTask polling entrypoint, but with
 * a short timeout suitable for MCP tool calls.
 */
export const CLOUDRUN_DEPLOY_REGISTRATION_MAX_WAIT_MS = 45_000;
export const CLOUDRUN_DEPLOY_REGISTRATION_INTERVAL_MS = 3_000;

export type CloudRunDeployRegistrationMode = "source" | "image";

export type CloudRunDeployRegistration = {
  registered: boolean;
  timedOut: boolean;
  taskId?: number;
  buildId?: number;
  runId?: string;
  taskStatus?: string;
  waitMs: number;
};

export type CloudRunDeployNextStepAction =
  | "getDeployLog"
  | "getProcessLog"
  | "getDeployRecords";

/**
 * Follow-up next_step after getDeployLog is unavailable (CODING login / image
 * deploy). Must never suggest getDeployLog again.
 */
export type CloudRunDeployFollowUpAction = "getProcessLog" | "getDeployRecords";

export type CloudRunDeployNextStep = {
  tool: "queryCloudRun";
  action: CloudRunDeployNextStepAction;
  suggested_args: Record<string, string | number>;
  note?: string;
};

export type CloudRunDeployFollowUpNextStep = {
  tool: "queryCloudRun";
  action: CloudRunDeployFollowUpAction;
  suggested_args: Record<string, string | number>;
  note?: string;
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isValidCloudRunBuildId(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isValidCloudRunRunId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * DescribeCloudRunBuildLog / getBuildLog fails when the Tencent Cloud account
 * has no CODING user. Agents should switch to getProcessLog (RunId) instead of
 * retrying getDeployLog.
 */
export function isCloudRunCodingBuildLogError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /DescribeCloudRunBuildLog|please login CODING|login CODING|User not created or may not qcloud user/i.test(
    message,
  );
}

export type CloudRunGetProcessLogNextAction = {
  tool: "queryCloudRun";
  action: CloudRunDeployFollowUpAction;
  args: {
    action: CloudRunDeployFollowUpAction;
    detailServerName: string;
    runId?: string;
  };
};

export function buildGetDeployLogCodingFallback(options: {
  serverName: string;
  runId?: string;
  upstreamError?: string;
  reason: "coding" | "image_no_build";
}): {
  success: false;
  error: string;
  message: string;
  nextActions: CloudRunGetProcessLogNextAction[];
  data: {
    runId?: string;
    next_step: CloudRunDeployFollowUpNextStep;
    upstreamError?: string;
  };
} {
  const runId = isValidCloudRunRunId(options.runId) ? options.runId.trim() : undefined;
  const runIdSuffix = runId ? `, runId="${runId}"` : "";
  // Narrow to follow-up actions only — never suggest getDeployLog again.
  const next_step: CloudRunDeployFollowUpNextStep = runId
    ? {
        tool: "queryCloudRun",
        action: "getProcessLog",
        suggested_args: {
          action: "getProcessLog",
          detailServerName: options.serverName,
          runId,
        },
        note: t("cloudrun.fallback.noteCoding"),
      }
    : {
        tool: "queryCloudRun",
        action: "getDeployRecords",
        suggested_args: {
          action: "getDeployRecords",
          detailServerName: options.serverName,
        },
        note: t("cloudrun.fallback.noteRecords"),
      };

  const nextActions: CloudRunGetProcessLogNextAction[] = [
    {
      tool: "queryCloudRun",
      action: next_step.action,
      args: {
        action: next_step.action,
        detailServerName: options.serverName,
        ...(runId ? { runId } : {}),
      },
    },
  ];
  if (next_step.action === "getDeployRecords") {
    nextActions.push({
      tool: "queryCloudRun",
      action: "getProcessLog",
      args: {
        action: "getProcessLog",
        detailServerName: options.serverName,
      },
    });
  }

  const message =
    options.reason === "image_no_build"
      ? t("cloudrun.fallback.messageNoBuild", {
          serverName: options.serverName,
          runIdSuffix,
        })
      : t("cloudrun.fallback.messageCoding", {
          serverName: options.serverName,
          runIdSuffix,
        });

  return {
    success: false,
    error:
      options.reason === "image_no_build"
        ? "NO_CODING_BUILD_FOR_IMAGE_DEPLOY"
        : "CODING_BUILD_LOG_UNAVAILABLE",
    message,
    nextActions,
    data: {
      ...(runId ? { runId } : {}),
      next_step,
      ...(options.upstreamError ? { upstreamError: options.upstreamError } : {}),
    },
  };
}

function extractServerManageTaskInfo(resp: unknown): {
  taskId?: number;
  taskStatus?: string;
} {
  const data = (resp ?? {}) as Record<string, unknown>;
  const task = (data.Task ?? data.task ?? {}) as Record<string, unknown>;
  const rawId = task.Id ?? task.id;
  const rawStatus = task.Status ?? task.status;
  const taskId =
    typeof rawId === "number" && rawId > 0
      ? rawId
      : typeof rawId === "string" && /^\d+$/.test(rawId) && Number(rawId) > 0
        ? Number(rawId)
        : undefined;
  const taskStatus =
    typeof rawStatus === "string" && rawStatus.trim()
      ? rawStatus.trim()
      : undefined;
  return {
    ...(taskId !== undefined ? { taskId } : {}),
    ...(taskStatus ? { taskStatus } : {}),
  };
}

/**
 * Poll DescribeServerManageTask + getDeployRecords until the preferred
 * identifier appears:
 * - source (default): BuildId > 0 for getDeployLog
 * - image: RunId for getProcessLog (BuildId is often 0)
 * If only taskId is seen, keeps polling for the preferred id until maxWaitMs.
 */
export async function waitForCloudRunDeployRegistration(options: {
  manager: {
    commonService?: (
      service: string,
      version: string,
    ) => { call: (req: { Action: string; Param: Record<string, unknown> }) => Promise<unknown> };
  };
  cloudrunService: {
    getDeployRecords?: (params: { serverName: string }) => Promise<unknown>;
  };
  envId: string;
  serverName: string;
  mode?: CloudRunDeployRegistrationMode;
  maxWaitMs?: number;
  intervalMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<CloudRunDeployRegistration> {
  const mode = options.mode ?? "source";
  const maxWaitMs = options.maxWaitMs ?? CLOUDRUN_DEPLOY_REGISTRATION_MAX_WAIT_MS;
  const intervalMs = options.intervalMs ?? CLOUDRUN_DEPLOY_REGISTRATION_INTERVAL_MS;
  const sleepFn = options.sleepFn ?? sleepMs;
  const startAt = Date.now();

  let lastTaskId: number | undefined;
  let lastTaskStatus: string | undefined;
  let lastBuildId: number | undefined;
  let lastRunId: string | undefined;

  // Immediate first probe, then interval retries until timeout.
  for (;;) {
    if (options.manager.commonService) {
      try {
        const resp = await options.manager
          .commonService("tcbr", "2022-02-17")
          .call({
            Action: "DescribeServerManageTask",
            Param: {
              EnvId: options.envId,
              ServerName: options.serverName,
              TaskId: lastTaskId ?? 0,
            },
          });
        const info = extractServerManageTaskInfo(resp);
        if (info.taskId !== undefined) {
          lastTaskId = info.taskId;
        }
        if (info.taskStatus) {
          lastTaskStatus = info.taskStatus;
        }
      } catch {
        // Task may not be queryable yet; retry until timeout.
      }
    }

    if (typeof options.cloudrunService.getDeployRecords === "function") {
      try {
        const recordsResult = (await options.cloudrunService.getDeployRecords({
          serverName: options.serverName,
        })) as { DeployRecords?: Array<{ BuildId?: number; RunId?: string }> };
        const latest = recordsResult?.DeployRecords?.[0];
        if (isValidCloudRunBuildId(latest?.BuildId)) {
          lastBuildId = latest.BuildId;
        }
        if (isValidCloudRunRunId(latest?.RunId)) {
          lastRunId = latest.RunId.trim();
        }
      } catch {
        // Deploy record may lag behind task registration; retry.
      }
    }

    const preferredReady =
      mode === "image"
        ? isValidCloudRunRunId(lastRunId)
        : isValidCloudRunBuildId(lastBuildId);

    if (preferredReady) {
      return {
        registered: true,
        timedOut: false,
        taskId: lastTaskId,
        ...(isValidCloudRunBuildId(lastBuildId) ? { buildId: lastBuildId } : {}),
        ...(isValidCloudRunRunId(lastRunId) ? { runId: lastRunId } : {}),
        taskStatus: lastTaskStatus,
        waitMs: Date.now() - startAt,
      };
    }

    if (Date.now() - startAt >= maxWaitMs) {
      break;
    }
    await sleepFn(intervalMs);
  }

  const registered =
    isValidCloudRunBuildId(lastBuildId) ||
    isValidCloudRunRunId(lastRunId) ||
    (typeof lastTaskId === "number" && lastTaskId > 0);

  return {
    registered,
    timedOut: true,
    taskId: lastTaskId,
    ...(isValidCloudRunBuildId(lastBuildId) ? { buildId: lastBuildId } : {}),
    ...(isValidCloudRunRunId(lastRunId) ? { runId: lastRunId } : {}),
    taskStatus: lastTaskStatus,
    waitMs: Date.now() - startAt,
  };
}

/**
 * Build manageCloudRun(deploy) next_step by DeployType:
 * - source: getDeployLog (+ follow-up getProcessLog)
 * - image: skip getDeployLog; getProcessLog via RunId (or getDeployRecords first)
 */
export function buildCloudRunDeployNextStep(options: {
  deployType: CloudRunDeployRegistrationMode;
  serverName: string;
  buildId?: number;
  runId?: string;
  registered: boolean;
}): CloudRunDeployNextStep {
  const { deployType, serverName, registered } = options;

  if (deployType === "image") {
    if (isValidCloudRunRunId(options.runId)) {
      return {
        tool: "queryCloudRun",
        action: "getProcessLog",
        suggested_args: {
          action: "getProcessLog",
          detailServerName: serverName,
          runId: options.runId.trim(),
        },
        note: t("cloudrun.nextStep.imageWithRunId"),
      };
    }
    return {
      tool: "queryCloudRun",
      action: "getDeployRecords",
      suggested_args: {
        action: "getDeployRecords",
        detailServerName: serverName,
      },
      note: registered
        ? t("cloudrun.nextStep.imageRegistered")
        : t("cloudrun.nextStep.imageQueueing"),
    };
  }

  if (isValidCloudRunBuildId(options.buildId)) {
    return {
      tool: "queryCloudRun",
      action: "getDeployLog",
      suggested_args: {
        action: "getDeployLog",
        detailServerName: serverName,
        buildId: options.buildId,
      },
      note: t("cloudrun.nextStep.sourceWithBuildId"),
    };
  }

  return {
    tool: "queryCloudRun",
    action: "getDeployLog",
    suggested_args: {
      action: "getDeployLog",
      detailServerName: serverName,
    },
    note: registered
      ? t("cloudrun.nextStep.sourceNoBuildId")
      : t("cloudrun.nextStep.sourceTimeout"),
  };
}

export function buildCloudRunDeployProgressHint(options: {
  deployType: CloudRunDeployRegistrationMode;
  serverName: string;
  buildId?: number;
  runId?: string;
  registered: boolean;
  timedOut: boolean;
  waitMs: number;
  consoleUrl: string;
  taskId?: number;
}): string {
  const { deployType, serverName, consoleUrl } = options;

  if (deployType === "image") {
    if (isValidCloudRunRunId(options.runId)) {
      return t("cloudrun.progress.imageWithRunId", {
        serverName,
        runId: options.runId.trim(),
      });
    }
    if (options.registered) {
      return t("cloudrun.progress.imageRegistered", {
        taskIdSuffix:
          typeof options.taskId === "number" ? ` (taskId=${options.taskId})` : "",
        serverName,
        consoleUrl,
      });
    }
    return t("cloudrun.progress.imageTimeout", {
      seconds: Math.round(options.waitMs / 1000),
      consoleUrl,
    });
  }

  if (isValidCloudRunBuildId(options.buildId)) {
    return t("cloudrun.progress.sourceWithBuildId", {
      serverName,
      buildId: options.buildId,
    });
  }
  if (options.registered) {
    return t("cloudrun.progress.sourceRegistered", {
      taskId: String(options.taskId ?? "unknown"),
      serverName,
      consoleUrl,
    });
  }
  return t("cloudrun.progress.sourceTimeout", {
    seconds: Math.round(options.waitMs / 1000),
    consoleUrl,
    serverName,
  });
}

const CLOUDRUN_DB_ENV_KEY_PATTERN =
  /^(DATABASE_URL|DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME|MYSQL_|POSTGRES_|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|PG_|REDIS_|MONGO_|MONGODB_|SQLALCHEMY_DATABASE_URI|SPRING_DATASOURCE_)/i;

const CLOUDRUN_DB_URL_PATTERN =
  /(mysql|mariadb|postgres|postgresql|mongodb(\+srv)?|redis|rediss):\/\//i;

export type CloudRunDbNetworkRisk = {
  code: "MISSING_VPC_FOR_DB_ENV";
  message: string;
  matchedKeys: string[];
  remediation: string[];
};

/**
 * 查询当前环境云托管（大租户）开通状态。
 *
 * 使用 tcbr DescribeEnvBaseInfo（2022-02-17）：
 * - IsExist=false + 空 EnvBaseInfo → 未开通（unopened）
 * - IsExist=true + Status="creating" → 开通中
 * - IsExist=true + Status="normal" → 已开通
 *
 * 供 initEnv（幂等判断）与 envStatus（状态查询）共用。
 */
export type CloudRunEnvStatus =
  | { isExist: true; status: "creating" | "normal" | "unknown"; baseInfo: Record<string, unknown> }
  | { isExist: false; status: "unopened"; baseInfo: Record<string, unknown> };

export async function queryCloudRunEnvStatus(options: {
  cloudBaseOptions?: CloudBaseOptions;
  envId: string;
}): Promise<CloudRunEnvStatus> {
  const manager = await getCloudBaseManager({ cloudBaseOptions: options.cloudBaseOptions });
  if (!manager?.commonService) {
    throw new Error(
      t("cloudrun.error.commonServiceQueryEnv"),
    );
  }
  return describeCloudRunEnvStatus(manager, options.envId);
}

/**
 * 核心实现：用已获取的 manager 查询云托管开通状态（供 initEnv/envStatus 及
 * ensureCloudRunEnvInitialized 复用，避免重复 getCloudBaseManager）。
 */
export async function describeCloudRunEnvStatus(
  manager: { commonService: (service: string, version: string) => { call: (options: any) => Promise<any> } },
  envId: string,
): Promise<CloudRunEnvStatus> {
  const result = await manager
    .commonService("tcbr", "2022-02-17")
    .call({
      Action: "DescribeEnvBaseInfo",
      Param: { EnvId: envId },
    });
  const data = (result ?? {}) as Record<string, unknown>;
  const baseInfo = ((data.EnvBaseInfo ?? {}) as Record<string, unknown>) ?? {};
  if (data.IsExist !== true) {
    return { isExist: false, status: "unopened", baseInfo };
  }
  const rawStatus = typeof baseInfo.Status === "string" ? baseInfo.Status : "";
  // Platform may return NORMAL/CREATING (uppercase); normalize before matching.
  const normalizedStatus = rawStatus.toLowerCase();
  const status =
    normalizedStatus === "creating" || normalizedStatus === "normal"
      ? (normalizedStatus as "creating" | "normal")
      : "unknown";
  return { isExist: true, status, baseInfo };
}

/**
 * 判断「云托管环境未开通 / 不存在」类错误，用于 `describeCloudRunEnvStatus` 失败的归一化分支。
 *
 * ⚠️ 必须**同时**看 `error.code` 与 `error.message`：
 * 报错文案有三套来源且会不一致 —— 英文错误码（`ResourceNotFound.CloudRunEnv`）、
 * 中文兜底（`[DescribeEnvBaseInfo] 资源不存在`）、旧式 `InvalidParameter.*Env`。
 * 只匹配 message 时，中文「资源不存在」不含 `ResourceNotFound`/`未开通`/`未初始化`，
 * 守卫会失效并把裸错误抛给模型（国际站未开通云托管的环境实测命中，见 F2）。
 *
 * 调用方只有 `DescribeEnvBaseInfo`（唯一资源就是环境），因此把「资源不存在」纳入
 * 未开通判定不会误伤其他语义。
 */
export function isCloudRunEnvNotOpenedError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const codeCandidates: unknown[] = [
    (error as { code?: unknown }).code,
    (error as { Code?: unknown }).Code,
    (error as { original?: { code?: unknown } }).original?.code,
    (error as { original?: { Code?: unknown } }).original?.Code,
  ];
  const codes = codeCandidates
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const message = error instanceof Error ? error.message : String(error);
  const haystack = `${codes} ${message}`;
  return (
    /ResourceNotFound|not.?initialized|未开通|未初始化|资源不存在|环境不存在/i.test(haystack) ||
    /InvalidParameter.*(?:Env|CloudRun)/i.test(haystack)
  );
}

/** CloudRun EnvType for CreateCloudRunEnv (baas DescribeEnvBaseInfo enum). */
export const CLOUDRUN_ENV_TYPE = "baas" as const;

export type CloudRunVpcInfo = {
  VpcId: string;
  CreateType: number;
  SubnetIds: string[];
};

/**
 * Extract VPC binding from DescribeEnvBaseInfo.EnvBaseInfo when the env was
 * opened with an explicit VPC.
 */
export function extractEnvBaseInfoVpc(
  baseInfo: Record<string, unknown> | null | undefined,
): { VpcId: string; SubnetIds: string[] } | undefined {
  if (!baseInfo) {
    return undefined;
  }
  const vpcId = typeof baseInfo.VpcId === "string" ? baseInfo.VpcId.trim() : "";
  const rawSubnets = baseInfo.SubNetIds ?? baseInfo.SubnetIds;
  const subnetIds = Array.isArray(rawSubnets)
    ? rawSubnets
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
  if (!vpcId || subnetIds.length === 0) {
    return undefined;
  }
  return { VpcId: vpcId, SubnetIds: subnetIds };
}

/**
 * Resolve CreateCloudRunServer.VpcInfo: prefer explicit serverConfig.VpcConf,
 * otherwise fall back to env-level VPC from DescribeEnvBaseInfo.
 */
export function resolveCloudRunDeployVpcInfo(options: {
  vpcConf?: { VpcId?: string; SubnetId?: string } | null;
  envBaseInfo?: Record<string, unknown> | null;
}): CloudRunVpcInfo | undefined {
  const conf = options.vpcConf;
  if (conf?.VpcId?.trim() && conf?.SubnetId?.trim()) {
    return {
      VpcId: conf.VpcId.trim(),
      CreateType: 2,
      SubnetIds: [conf.SubnetId.trim()],
    };
  }
  const fromEnv = extractEnvBaseInfoVpc(options.envBaseInfo);
  if (!fromEnv) {
    return undefined;
  }
  return {
    VpcId: fromEnv.VpcId,
    CreateType: 2,
    SubnetIds: fromEnv.SubnetIds,
  };
}

/**
 * Build CreateCloudRunEnv Param, always including EnvType=baas.
 * Optional vpcId/subnetIds are used when the platform requires an explicit VPC.
 */
export function buildCreateCloudRunEnvParam(options: {
  envId: string;
  packageType: string;
  vpcId?: string;
  subnetIds?: string[];
}): Record<string, unknown> {
  const param: Record<string, unknown> = {
    EnvId: options.envId,
    PackageType: options.packageType,
    EnvType: CLOUDRUN_ENV_TYPE,
  };
  const vpcId = options.vpcId?.trim();
  const subnetIds = (options.subnetIds ?? [])
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
  if (vpcId) {
    param.VpcId = vpcId;
  }
  if (subnetIds.length > 0) {
    param.SubNetIds = subnetIds;
  }
  return param;
}

/**
 * 探测当前环境云托管（大租户）是否已初始化。
 *
 * 背景（2026-08-13 用户实测）：新环境未调 CreateCloudRunEnv 初始化云托管时，
 * 直接 CreateCloudRunServer 会因"无大租户记录"被默认转入小租户，创建出小租户的
 * 服务和版本——这是错误路径。本函数在 deploy 创建新服务前用 tcbr DescribeEnvBaseInfo
 * 探测环境是否已开通云托管；未开通则抛错引导先初始化，而不是默默走到小租户路径。
 *
 * 实测（2026-08-13 真实凭据）：tcbr 不存在 DescribeCloudRunEnv（单数）Action，调用
 * 恒返回 InvalidAction；正确的探测接口是 DescribeEnvBaseInfo。未开通云托管的环境返回
 * IsExist=false 且 EnvBaseInfo 为空结构（不抛错）；已开通的环境（实测 ai-share-
 * d2guukyxybb63b206）返回 IsExist=true 且 EnvBaseInfo 含完整字段（Status="normal"、
 * PackageType/Region/EnvType/CreateTime 等已填充），两分支可明确区分。
 *
 * 双验证：DescribeCloudRunServers 未初始化与已初始化但无服务均返回 ServerList=[]，
 * 无法区分，故不作为初始化判定依据。
 *
 * @returns 已初始化返回 true；探测到未初始化抛出带引导信息的 Error。
 */
export async function ensureCloudRunEnvInitialized(options: {
  cloudBaseOptions?: CloudBaseOptions;
  envId: string;
  serverName: string;
}): Promise<boolean> {
  const manager = await getCloudBaseManager({ cloudBaseOptions: options.cloudBaseOptions });
  if (!manager?.commonService) {
    // 老 SDK 无 commonService 时退化为不拦截（保持既有行为，避免误伤）。
    return true;
  }
  try {
    const status = await describeCloudRunEnvStatus(manager, options.envId);
    if (!status.isExist) {
      throwCloudRunEnvNotInitialized(options.envId);
    }
    return true;
  } catch (error) {
    // 错误兜底：未初始化/未开通类错误码。判据统一收敛到 isCloudRunEnvNotOpenedError，
    // 避免「只匹配 message」被本地化文案（中文「资源不存在」）绕过。
    // 注意：裸 InvalidParameter 可能是普通参数错误，不拦截；仅当其带 Env/CloudRun
    // 上下文（疑似 "EnvironmentId not found / CloudRun Env 未开通"）时才按未初始化处理。
    if (isCloudRunEnvNotOpenedError(error)) {
      throwCloudRunEnvNotInitialized(options.envId);
    }
    // 其他错误（网络/权限等）不拦截，让上层按原逻辑处理。
    return true;
  }
}

function throwCloudRunEnvNotInitialized(envId: string): never {
  throw new Error(t("cloudrun.error.envNotInitialized", { envId }));
}

/**
 * Detect likely TCP database/cache env usage without VpcConf.
 * Soft signal for AI agents — does not block deploy.
 */
export function detectCloudRunDbNetworkRisk(options: {
  envParams?: string;
  vpcConf?: { VpcId?: string; SubnetId?: string } | null;
}): CloudRunDbNetworkRisk | null {
  const vpcId = options.vpcConf?.VpcId?.trim();
  const subnetId = options.vpcConf?.SubnetId?.trim();
  if (vpcId && subnetId) {
    return null;
  }

  const rawEnv = options.envParams?.trim();
  if (!rawEnv) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(rawEnv);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    parsed = value as Record<string, unknown>;
  } catch {
    // Non-JSON EnvParams still may embed connection URLs as plain text.
    if (!CLOUDRUN_DB_URL_PATTERN.test(rawEnv)) {
      return null;
    }
    return {
      code: "MISSING_VPC_FOR_DB_ENV",
      message: t("cloudrun.risk.noJson.message"),
      matchedKeys: ["<non-json-envParams>"],
      remediation: [
        t("cloudrun.risk.noJson.remediation.1"),
        t("cloudrun.risk.noJson.remediation.2"),
        t("cloudrun.risk.noJson.remediation.3"),
        t("cloudrun.risk.noJson.remediation.4"),
        t("cloudrun.risk.noJson.remediation.5"),
      ],
    };
  }

  const matchedKeys: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (CLOUDRUN_DB_ENV_KEY_PATTERN.test(key)) {
      matchedKeys.push(key);
      continue;
    }
    if (typeof value === "string" && CLOUDRUN_DB_URL_PATTERN.test(value)) {
      matchedKeys.push(key);
    }
  }

  if (matchedKeys.length === 0) {
    return null;
  }

  return {
    code: "MISSING_VPC_FOR_DB_ENV",
    message: t("cloudrun.risk.detected.message"),
    matchedKeys,
    remediation: [
      t("cloudrun.risk.detected.remediation.1"),
      t("cloudrun.risk.detected.remediation.2"),
      t("cloudrun.risk.detected.remediation.3"),
      t("cloudrun.risk.detected.remediation.4"),
      t("cloudrun.risk.detected.remediation.5"),
    ],
  };
}

function getCloudRunQueryServerName(input: queryCloudRunInput): string | undefined {
  return input.detailServerName || input.serverName;
}

function normalizeProcessLogText(logs: unknown[]): string {
  return logs
    .map((log) => {
      if (typeof log === "string") {
        return log;
      }

      if (log && typeof log === "object") {
        if ("Log" in log && typeof log.Log === "string") {
          return log.Log;
        }

        if ("Text" in log && typeof log.Text === "string") {
          return log.Text;
        }

        return JSON.stringify(log);
      }

      return String(log);
    })
    .join("\n");
}

function normalizeCloudRunDomainUrl(input: unknown): string | undefined {
  if (typeof input !== "string" || !input.trim()) return undefined;
  const raw = input.trim();
  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;
}

/**
 * 从服务详情 / 最新部署记录中提取镜像信息（镜像部署时才有）。
 * 镜像部署（DeployType=image）的服务详情与部署记录通常会携带 ImageUrl 等字段；
 * 源码构建的服务无此字段，返回 undefined 表示无镜像信息。
 */
export function extractCloudRunImageInfo(
  serviceDetail: any,
  latestDeploy?: any,
): { imageUrl?: string; deployType?: string } | undefined {
  const candidates = [
    latestDeploy,
    serviceDetail?.ServerConfig,
    serviceDetail?.BaseInfo,
    serviceDetail,
  ];
  for (const source of candidates) {
    if (!source || typeof source !== "object") continue;
    const imageUrl =
      source.ImageUrl ??
      source.imageUrl ??
      (typeof source.ImageInfo === "string" ? source.ImageInfo : undefined) ??
      (typeof source.ImageInfo?.ImageUrl === "string" ? source.ImageInfo.ImageUrl : undefined);
    if (typeof imageUrl === "string" && imageUrl.trim()) {
      const deployType =
        typeof source.DeployType === "string"
          ? source.DeployType
          : typeof source.deployType === "string"
            ? source.deployType
            : undefined;
      return { imageUrl: imageUrl.trim(), ...(deployType ? { deployType } : {}) };
    }
  }
  return undefined;
}

function resolveCloudRunFallbackAccess(details: any): {
  url?: string;
  source?:
    | "cloudrun.customDomain"
    | "cloudrun.defaultDomain"
    | "cloudrun.publicDomain"
    | "cloudrun.internalDomain";
} {
  const custom = normalizeCloudRunDomainUrl(details?.BaseInfo?.CustomDomainName);
  if (custom) return { url: custom, source: "cloudrun.customDomain" };
  const defaultDomain = normalizeCloudRunDomainUrl(
    details?.BaseInfo?.DefaultDomainName,
  );
  if (defaultDomain) return { url: defaultDomain, source: "cloudrun.defaultDomain" };
  const publicDomain =
    normalizeCloudRunDomainUrl(details?.BaseInfo?.PublicDomain) ??
    normalizeCloudRunDomainUrl(details?.AccessInfo?.PublicDomain);
  if (publicDomain) return { url: publicDomain, source: "cloudrun.publicDomain" };
  const internal = normalizeCloudRunDomainUrl(details?.BaseInfo?.InternalDomain);
  if (internal) return { url: internal, source: "cloudrun.internalDomain" };
  return {};
}

/**
 * Format CloudRun service info for display
 */


/**
 * Register CloudRun tools with the MCP server
 */
export function registerCloudRunTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  // 创建闭包函数来获取 CloudBase Manager
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  // Tool 1: Get CloudRun service information (read operations)
  server.registerTool(
    "queryCloudRun",
    {
      title: "cloudrun.query.title",
      description: "cloudrun.query.description",
      inputSchema: queryCloudRunInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        category: "cloudrun"
      }
    },
    async (args: queryCloudRunInput) => {
      const input = args;
      const manager = await getManager();

      if (!manager) {
        throw new Error(t("cloudrun.error.managerInitFailed"));
      }

      const cloudrunService = manager.cloudrun;

      switch (input.action) {
        case 'list': {
            const listParams: any = {
              pageSize: input.pageSize,
              pageNum: input.pageNum,
            };

            if (input.serverName) {
              listParams.serverName = input.serverName;
            }

            if (input.serverType) {
              listParams.serverType = input.serverType;
            }

            const result = await cloudrunService.list(listParams);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      services: result.ServerList || [],
                      pagination: {
                        total: result.Total || 0,
                        pageSize: input.pageSize,
                        pageNum: input.pageNum,
                        totalPages: Math.ceil((result.Total || 0) / (input.pageSize || 10))
                      }
                    },
                    message: t("cloudrun.list.message", {
                      count: result.ServerList?.length || 0,
                    })
                  }, null, 2)
                }
              ]
            };
          }

          case 'detail': {
            const serverName = getCloudRunQueryServerName(input);

            if (!serverName) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "detailServerName or serverName is required for detail action",
                      message: t("cloudrun.error.provideServerName")
                    }, null, 2)
                  }
                ]
              };
            }

            const result = await cloudrunService.detail({ serverName });

            if (!result) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: t("cloudrun.error.serviceNotFound", { serverName }),
                      message: t("cloudrun.error.serviceNotFoundRetry")
                    }, null, 2)
                  }
                ]
              };
            }

            let latestDeploy: any = null;
            let deployRecordsWarning: string | undefined;
            let message: string;

            try {
              const deployRecords: any = await cloudrunService.getDeployRecords({ serverName });
              latestDeploy = deployRecords?.DeployRecords?.[0] ?? null;

              if (!latestDeploy) {
                message = t("cloudrun.detail.noRecords", { serverName });
              } else if (
                typeof latestDeploy.Status === "string" &&
                // Platform may return FAILED/CREATING (uppercase); normalize before matching.
                latestDeploy.Status.toLowerCase().includes("failed")
              ) {
                message = t("cloudrun.detail.deployFailed", { serverName });
              } else if (
                typeof latestDeploy.Status === "string" &&
                latestDeploy.Status.toLowerCase().includes("creating")
              ) {
                message = t("cloudrun.detail.deployRunning", { serverName });
              } else {
                message = t("cloudrun.detail.ok", { serverName, status: result.BaseInfo?.Status || 'unknown', deployStatus: latestDeploy.Status || 'unknown' });
              }
            } catch (error) {
              const baseMessage = error instanceof Error ? error.message : String(error);
              deployRecordsWarning = t("cloudrun.detail.recordsWarning", { baseMessage });
              message = t("cloudrun.detail.recordsUnavailable", { serverName });
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      // 默认脱敏 ServerConfig.EnvParams 的值（保留 key）；revealEnvParams=true 时返回明文
                      service: input.revealEnvParams === true ? result : maskCloudRunDetailEnvParams(result),
                      latestDeploy,
                      // 若最新部署记录带镜像信息（镜像部署），透出便于展示
                      ...(extractCloudRunImageInfo(result, latestDeploy)
                        ? { imageInfo: extractCloudRunImageInfo(result, latestDeploy) }
                        : {}),
                      ...(deployRecordsWarning ? { deployRecordsWarning } : {})
                    },
                    message
                  }, null, 2)
                }
              ]
            };
          }

          case 'templates': {
            const result = await cloudrunService.getTemplates();

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      templates: result || []
                    },
                    message: t("cloudrun.templates.message", {
                      count: result?.length || 0,
                    })
                  }, null, 2)
                }
              ]
            };
          }

          case 'getDeployLog': {
            const serverName = getCloudRunQueryServerName(input);

            if (!serverName) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "detailServerName or serverName is required for getDeployLog action",
                      message: t("cloudrun.error.provideServerName")
                    }, null, 2)
                  }
                ]
              };
            }

            const deployRecords: any = await cloudrunService.getDeployRecords({ serverName });
            const latestDeploy = deployRecords?.DeployRecords?.[0];

            if (!latestDeploy) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: t("cloudrun.error.noDeployRecords", { serverName }),
                      message: t("cloudrun.error.deployFirst")
                    }, null, 2)
                  }
                ]
              };
            }

            const buildId = input.buildId ?? latestDeploy.BuildId;
            const latestRunId = isValidCloudRunRunId(latestDeploy.RunId)
              ? latestDeploy.RunId.trim()
              : undefined;

            // Image deploys typically have BuildId=0 and no CODING build.
            if (!isValidCloudRunBuildId(buildId)) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      buildGetDeployLogCodingFallback({
                        serverName,
                        runId: latestRunId,
                        reason: "image_no_build",
                      }),
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            // Build log (CODING / DescribeCloudRunBuildLog). Meaningful only for
            // cloud source builds. Accounts without a CODING user fail here —
            // rewrite to getProcessLog instead of bubbling the raw English error.
            let buildLogResult: unknown;
            try {
              buildLogResult = await cloudrunService.getBuildLog({
                serverName,
                buildId,
              });
            } catch (error) {
              if (isCloudRunCodingBuildLogError(error)) {
                const upstreamError = error instanceof Error ? error.message : String(error);
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        buildGetDeployLogCodingFallback({
                          serverName,
                          runId: latestRunId,
                          upstreamError,
                          reason: "coding",
                        }),
                        null,
                        2,
                      ),
                    },
                  ],
                };
              }
              throw error;
            }

            let processLogs: unknown[] = [];
            let processLogsWarning: string | undefined;

            if (latestDeploy.RunId && typeof cloudrunService.getProcessLog === 'function') {
              try {
                const processLogResult: any = await cloudrunService.getProcessLog({
                  RunId: latestDeploy.RunId,
                });
                processLogs = processLogResult?.Logs || [];
              } catch (error) {
                processLogsWarning = error instanceof Error ? error.message : String(error);
              }
            }

            const buildLogRecord =
              buildLogResult && typeof buildLogResult === "object"
                ? (buildLogResult as { Log?: { Text?: string } })
                : undefined;
            const buildLogText = typeof buildLogRecord?.Log?.Text === 'string' ? buildLogRecord.Log.Text : '';
            const processLogText = Array.isArray(processLogs) && processLogs.length > 0 ? normalizeProcessLogText(processLogs) : '';
            const combinedLogText = [buildLogText, processLogText].filter(Boolean).join('\n');

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      buildId,
                      deployRecord: latestDeploy,
                      buildLog: buildLogRecord?.Log || null,
                      // Optional best-effort attach; prefer dedicated getProcessLog for runtime diagnosis
                      processLogs,
                      combinedLogText,
                      ...(processLogsWarning ? { processLogsWarning } : {})
                    },
                    message: t("cloudrun.buildLog.message", { serverName })
                  }, null, 2)
                }
              ]
            };
          }

          case 'getProcessLog': {
            const serverName = getCloudRunQueryServerName(input);

            if (!serverName && !input.runId?.trim()) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: t("cloudrun.error.runIdRequired"),
                      message: t("cloudrun.error.runIdRequiredHint")
                    }, null, 2)
                  }
                ]
              };
            }

            let runId = input.runId?.trim() || "";
            let deployRecord: any = null;

            if (serverName) {
              const deployRecordsResult: any = await cloudrunService.getDeployRecords({ serverName });
              const deployRecords = Array.isArray(deployRecordsResult?.DeployRecords)
                ? deployRecordsResult.DeployRecords
                : [];
              deployRecord = deployRecords[0] ?? null;

              if (!runId) {
                runId = typeof deployRecord?.RunId === "string" ? deployRecord.RunId.trim() : "";
              } else if (deployRecord?.RunId && deployRecord.RunId !== runId) {
                // Keep latest deploy as context only; explicit runId wins
              }
            }

            if (!runId) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: serverName
                        ? t("cloudrun.error.noRunIdOnLatest", { serverName })
                        : t("cloudrun.error.runIdRequiredAction"),
                      message: t("cloudrun.error.runIdReadGuide")
                    }, null, 2)
                  }
                ]
              };
            }

            if (typeof cloudrunService.getProcessLog !== "function") {
              throw new Error(
                t("cloudrun.error.getProcessLogUnsupported"),
              );
            }

            const processLogResult: any = await cloudrunService.getProcessLog({
              RunId: runId,
            });
            const processLogs = Array.isArray(processLogResult?.Logs)
              ? processLogResult.Logs
              : [];
            const processLogText = processLogs.length > 0
              ? normalizeProcessLogText(processLogs)
              : "";

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serverName: serverName || undefined,
                      runId,
                      deployRecord,
                      processLogs,
                      processLogText,
                      requestId: processLogResult?.RequestId,
                    },
                    message: t("cloudrun.processLog.message", { runId })
                  }, null, 2)
                }
              ]
            };
          }

          case 'getDeployRecords': {
            const serverName = getCloudRunQueryServerName(input);

            if (!serverName) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: t("cloudrun.error.serverNameRequired", { action: "getDeployRecords" }),
                      message: t("cloudrun.error.provideServerName")
                    }, null, 2)
                  }
                ]
              };
            }

            const deployRecordsResult: any = await cloudrunService.getDeployRecords({ serverName });
            const deployRecords = Array.isArray(deployRecordsResult?.DeployRecords)
              ? deployRecordsResult.DeployRecords
              : [];

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serverName,
                      deployRecords,
                      // 部署记录按部署时间倒序（最新在前），首条为最近一次部署
                      total: deployRecords.length,
                      latestDeploy: deployRecords[0] ?? null
                    },
                    message: t("cloudrun.deployRecords.message", { serverName, count: deployRecords.length })
                  }, null, 2)
                }
              ]
            };
          }

          case 'getManageTask': {
            const serverName = getCloudRunQueryServerName(input);

            if (!serverName) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: t("cloudrun.error.serverNameRequired", { action: "getManageTask" }),
                      message: t("cloudrun.error.provideServerName")
                    }, null, 2)
                  }
                ]
              };
            }

            const envId = input.envId?.trim() || (await getEnvId(cloudBaseOptions));

            if (!manager.commonService) {
              throw new Error(
                "Current CloudBase Manager does not support commonService; cannot query CloudRun deploy task.",
              );
            }

            // tcbr/DescribeServerManageTask：TaskId=0 表示查询该服务最近一次发布任务
            let rawTask: Record<string, unknown> | null = null;
            let queryError: string | undefined;
            try {
              const resp = await manager
                .commonService("tcbr", "2022-02-17")
                .call({
                  Action: "DescribeServerManageTask",
                  Param: { EnvId: envId, ServerName: serverName, TaskId: 0 },
                });
              const respObj = (resp ?? {}) as Record<string, unknown>;
              const task = respObj.Task ?? respObj.task;
              if (task && typeof task === "object") {
                rawTask = task as Record<string, unknown>;
              }
            } catch (error) {
              queryError = error instanceof Error ? error.message : String(error);
            }

            const { taskId, taskStatus } = extractServerManageTaskInfo(rawTask ?? {});

            // 任务状态 + 版本状态合看，才能判断部署是在推进还是已经卡住
            let latestDeploy: Record<string, unknown> | null = null;
            try {
              const recordsResult: any = await cloudrunService.getDeployRecords({ serverName });
              const first = Array.isArray(recordsResult?.DeployRecords)
                ? recordsResult.DeployRecords[0]
                : null;
              if (first && typeof first === "object") {
                latestDeploy = first;
              }
            } catch {
              // 部署记录不可用时只返回任务信息
            }

            const deployStatus =
              typeof latestDeploy?.Status === "string" ? latestDeploy.Status : undefined;

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      envId,
                      serverName,
                      taskId: taskId ?? null,
                      taskStatus: taskStatus ?? null,
                      task: rawTask,
                      latestDeployStatus: deployStatus ?? null,
                      latestDeploy,
                      ...(queryError ? { taskQueryError: queryError } : {}),
                    },
                    message: t("cloudrun.manageTask.message", {
                      serverName,
                      taskId: taskId ?? "-",
                      taskStatus: taskStatus ?? "-",
                      deployStatus: deployStatus ?? "-",
                    }),
                  }, null, 2)
                }
              ]
            };
          }

          case 'envStatus': {
            const envId = input.envId?.trim() || (await getEnvId(cloudBaseOptions));

            if (!manager.commonService) {
              throw new Error(
                "Current CloudBase Manager does not support commonService; cannot query CloudRun env status.",
              );
            }
            let status: CloudRunEnvStatus;
            try {
              status = await describeCloudRunEnvStatus(manager, envId);
            } catch (error) {
              const baseMessage = error instanceof Error ? error.message : String(error);
              if (isCloudRunEnvNotOpenedError(error)) {
                status = { isExist: false, status: "unopened", baseInfo: {} };
              } else {
                throw new Error(t("cloudrun.error.actionFailed", {
                  context: "queryCloudRun/envStatus",
                  baseMessage,
                }));
              }
            }

            let message: string;
            if (!status.isExist) {
              message = t("cloudrun.envStatus.unopened", { envId });
            } else if (status.status === "creating") {
              message = t("cloudrun.envStatus.creating", { envId });
            } else if (status.status === "normal") {
              message = t("cloudrun.envStatus.normal", { envId });
            } else {
              message = t("cloudrun.envStatus.unknown", { envId, status: status.status ?? "unknown" });
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      envId,
                      status: status.status,
                      isExist: status.isExist,
                      ...(status.isExist
                        ? {
                            envBaseInfo: {
                              Status: status.baseInfo.Status ?? null,
                              PackageType: status.baseInfo.PackageType ?? null,
                              Region: status.baseInfo.Region ?? null,
                              EnvType: status.baseInfo.EnvType ?? null,
                            },
                          }
                        : {}),
                    },
                    message
                  }, null, 2)
                }
              ]
            };
          }

        default:
          throw new Error(t("cloudrun.error.unsupportedAction", { action: input.action }));
      }
    }
  );

  // Track local running processes for CloudRun function services
  const runningProcesses = new Map<string, number>();

  // Tool 2: Manage CloudRun services (write operations)
  server.registerTool(
    "manageCloudRun",
    {
      title: "cloudrun.manage.title",
      description: "cloudrun.manage.description",
      inputSchema: ManageCloudRunInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        category: "cloudrun"
      }
    },
    async (args: ManageCloudRunInput) => {
      const input = args;
      const manager = await getManager();

      if (!manager) {
        throw new Error(t("cloudrun.error.managerInitFailed"));
      }

      const cloudrunService = manager.cloudrun;
      let targetPath: string | undefined;

      if (input.targetPath) {
        targetPath = validateAndNormalizePath(input.targetPath);
      }

      switch (input.action) {
        case 'initEnv': {
            const envId = input.envId?.trim() || (await getEnvId(cloudBaseOptions));
            const packageType = input.packageType || 'Trial';
            if (!manager.commonService) {
    throw new Error(
      t("cloudrun.error.commonServiceInitEnv"),
    );
            }

            // 幂等：先查当前开通状态，已开通 / 开通中不重复创建。
            let current: CloudRunEnvStatus;
            try {
              current = await describeCloudRunEnvStatus(manager, envId);
            } catch (error) {
              const baseMessage = error instanceof Error ? error.message : String(error);
              if (isCloudRunEnvNotOpenedError(error)) {
                current = { isExist: false, status: "unopened", baseInfo: {} };
              } else {
                throw new Error(t("cloudrun.error.actionFailed", {
                  context: "manageCloudRun/initEnv",
                  baseMessage,
                }));
              }
            }

            if (current.isExist && current.status === "normal") {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      data: {
                        envId,
                        status: "normal",
                        packageType: current.baseInfo.PackageType ?? packageType,
                        created: false
                      },
                      message: t("cloudrun.initEnv.alreadyNormal", { envId })
                    }, null, 2)
                  }
                ]
              };
            }

            if (current.isExist && current.status === "creating") {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      data: {
                        envId,
                        status: "creating",
                        created: false
                      },
                      message: t("cloudrun.initEnv.creating", { envId })
                    }, null, 2)
                  }
                ]
              };
            }

            // 未开通 → 发起异步开通（CreateCloudRunEnv 异步，不阻塞等待）。
            // Always pass EnvType=baas; optional vpcId/subnetIds when an explicit VPC is required.
            let createResult: any;
            try {
              createResult = await manager
                .commonService("tcbr", "2022-02-17")
                .call({
                  Action: "CreateCloudRunEnv",
                  Param: buildCreateCloudRunEnvParam({
                    envId,
                    packageType,
                    vpcId: input.vpcId,
                    subnetIds: input.subnetIds,
                  }),
                });
            } catch (error) {
              throw new Error(buildManageCloudRunErrorMessage('initEnv', envId, error));
            }
            const tranId =
              createResult?.TranId ??
              createResult?.Response?.TranId ??
              createResult?.tranId;

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      envId,
                      status: "creating",
                      packageType,
                      created: true,
                      ...(tranId ? { tranId } : {})
                    },
                    message: t("cloudrun.initEnv.started", { envId })
                  }, null, 2)
                }
              ]
            };
          }

          case 'traffic': {
            const trafficOp = input.trafficOp;
            if (!trafficOp) {
              throw new Error(
                t("cloudrun.error.trafficOpRequired"),
              );
            }

            if (trafficOp === 'set') {
              const stable = input.stablePercent;
              const canary = input.canaryPercent;
              if (
                typeof stable !== 'number' ||
                typeof canary !== 'number'
              ) {
                throw new Error(
                  t("cloudrun.error.percentsRequired"),
                );
              }
              if (stable + canary !== 100) {
                throw new Error(
                  t("cloudrun.error.percentSum", { stable, canary, sum: stable + canary }),
                );
              }
              let setResult: unknown;
              try {
                setResult = await cloudrunService.setTraffic(
                  input.serverName,
                  stable,
                  canary,
                );
              } catch (error) {
                throw new Error(
                  buildManageCloudRunErrorMessage('traffic/set', input.serverName, error),
                );
              }
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      data: {
                        serverName: input.serverName,
                        trafficOp: 'set',
                        stablePercent: stable,
                        canaryPercent: canary,
                        result: setResult ?? null
                      },
                      message: t("cloudrun.traffic.set.message", { serverName: input.serverName, stable, canary })
                    }, null, 2)
                  }
                ]
              };
            }

            if (trafficOp === 'promote') {
              let promoteResult: unknown;
              try {
                promoteResult = await cloudrunService.promote(input.serverName);
              } catch (error) {
                throw new Error(
                  buildManageCloudRunErrorMessage('traffic/promote', input.serverName, error),
                );
              }
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: true,
                      data: {
                        serverName: input.serverName,
                        trafficOp: 'promote',
                        result: promoteResult ?? null
                      },
                      message: t("cloudrun.traffic.promote.message", { serverName: input.serverName })
                    }, null, 2)
                  }
                ]
              };
            }

            // rollback
            let rollbackResult: unknown;
            try {
              rollbackResult = await cloudrunService.rollback(input.serverName);
            } catch (error) {
              throw new Error(
                buildManageCloudRunErrorMessage('traffic/rollback', input.serverName, error),
              );
            }
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serverName: input.serverName,
                      trafficOp: 'rollback',
                      result: rollbackResult ?? null
                    },
                    message: t("cloudrun.traffic.rollback.message", {
                      serverName: input.serverName,
                    })
                  }, null, 2)
                }
              ]
            };
          }

          case 'createAgent': {
            if (!targetPath) {
              throw new Error(t("cloudrun.error.targetPathRequired", { action: "createAgent" }));
            }

            if (!input.agentConfig) {
              throw new Error(t("cloudrun.error.agentConfigRequired"));
            }

            const { agentName, botTag, description, template = 'blank' } = input.agentConfig;

            // Generate BotId
            const botId = botTag ? `ibot-${agentName}-${botTag}` : `ibot-${agentName}-${Date.now()}`;

            // Create Agent using CloudBase Manager
            const agentResult = await manager.agent.createFunctionAgent(targetPath, {
              Name: agentName,
              BotId: botId,
              Introduction: description || `Agent created by ${agentName}`,
              Avatar: undefined
            });

            // Create project directory
            const projectDir = path.join(targetPath, input.serverName);
            if (!fs.existsSync(projectDir)) {
              fs.mkdirSync(projectDir, { recursive: true });
            }

            // Generate package.json
            const packageJson = {
              name: input.serverName,
              version: "1.0.0",
              description: description || `Agent created by ${agentName}`,
              main: "index.js",
              scripts: {
                "dev": "tcb cloudrun run --runMode=agent -w",
                "deploy": "tcb cloudrun deploy",
                "start": "node index.js"
              },
              dependencies: {
                "@cloudbase/aiagent-framework": "^1.0.0-beta.10"
              },
              devDependencies: {
                "@cloudbase/cli": "^2.6.16"
              }
            };

            fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify(packageJson, null, 2));

            // Generate index.js with Agent template
            const indexJsContent = `const { IBot } = require("@cloudbase/aiagent-framework");
const { BotRunner } = require("@cloudbase/aiagent-framework");

const ANSWER = "你好，我是一个智能体，但我只会说这一句话。";

/**
 * @typedef {import('@cloudbase/aiagent-framework').IAbstractBot} IAbstractBot
 * 
 * @class
 * @implements {IAbstractBot}
 */
class MyBot extends IBot {
  async sendMessage() {
    return new Promise((res) => {
      // 创建个字符数组
      const charArr = ANSWER.split("");
      const interval = setInterval(() => {
        // 定时循环从数组中去一个字符
        const char = charArr.shift();
        if (typeof char === "string") {
          // 有字符时，发送 SSE 消息给客户端
          this.sseSender.send({ data: { content: char } });
        } else {
          // 字符用光后，结束定时循环
          clearInterval(interval);
          // 结束 SSE
          this.sseSender.end();
          res();
        }
      }, 50);
    });
  }
}

/**
 * 类型完整定义请参考：https://docs.cloudbase.net/cbrf/how-to-writing-functions-code#%E5%AE%8C%E6%95%B4%E7%A4%BA%E4%BE%8B
 * "{demo: string}"" 为 event 参数的示例类型声明，请根据实际情况进行修改
 * 需要 \`pnpm install\` 安装依赖后类型提示才会生效
 * 
 * @type {import('@cloudbase/functions-typings').TcbEventFunction<unknown>}
 */
exports.main = function (event, context) {
  return BotRunner.run(event, context, new MyBot(context));
};
`;

            fs.writeFileSync(path.join(projectDir, 'index.js'), indexJsContent);

            // Generate cloudbaserc.json
            const currentEnvId = await getEnvId(cloudBaseOptions);
            const cloudbasercContent = {
              envId: currentEnvId,
              cloudrun: {
                name: input.serverName
              }
            };

            fs.writeFileSync(path.join(projectDir, 'cloudbaserc.json'), JSON.stringify(cloudbasercContent, null, 2));

            // Generate README.md
            const readmeContent = `# ${agentName} Agent

这是一个基于函数型云托管的 AI 智能体。

## 开发

\`\`\`bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 部署
npm run deploy
\`\`\`

## 调用方式

### 命令行测试
\`\`\`bash
curl 'http://127.0.0.1:3000/v1/aibot/bots/${botId}/send-message' \\
  -H 'Accept: text/event-stream' \\
  -H 'Content-Type: application/json' \\
  --data-raw '{"msg":"hi"}'
\`\`\`

### Web 调用
\`\`\`html
<script src="https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js"></script>
<script>
const app = cloudbase.init({ env: "your-env-id" });
const auth = app.auth();
await auth.signInAnonymously();
const ai = app.ai();
const res = await ai.bot.sendMessage({
  botId: "${botId}",
  msg: "hi",
});
for await (let x of res.textStream) {
  console.log(x);
}
</script>
\`\`\`
`;

            fs.writeFileSync(path.join(projectDir, 'README.md'), readmeContent);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      agentName: agentName,
                      botId: botId,
                      projectDir: projectDir,
                      serverName: input.serverName,
                      template: template,
                      filesCreated: ['package.json', 'index.js', 'cloudbaserc.json', 'README.md']
                    },
                    message: t("cloudrun.createAgent.message", { agentName, botId, projectDir })
                  }, null, 2)
                }
              ]
            };
          }

          case 'deploy': {
            if (!targetPath && !input.imageUrl) {
              throw new Error(t("cloudrun.error.deployTargetRequired"));
            }

            // Determine service type - use input.serverType if provided, otherwise auto-detect
            let serverType: 'function' | 'container';
            let remoteServerConfig: CloudRunServerConfigLike | null = null;
            let existingService = false;
            if (input.imageUrl) {
              // Image deploy is always container type (SDK: DeployInfo={DeployType:"image", ImageUrl}).
              serverType = 'container';
            } else if (input.serverType) {
              serverType = input.serverType;
            } else {
              try {
                // First try to get existing service details
                const details = await cloudrunService.detail({ serverName: input.serverName });
                serverType = details.BaseInfo?.ServerType || 'container';
                remoteServerConfig = (details.ServerConfig || null) as unknown as CloudRunServerConfigLike | null;
                existingService = true;
              } catch (e) {
                // If service doesn't exist, determine by project structure
                const dockerfilePath = path.join(targetPath!, 'Dockerfile');
                if (fs.existsSync(dockerfilePath)) {
                  serverType = 'container';
                } else {
                  // Check if it's a Node.js function project (has package.json with specific structure)
                  const packageJsonPath = path.join(targetPath!, 'package.json');
                  if (fs.existsSync(packageJsonPath)) {
                    try {
                      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                      // If it has function-specific dependencies or scripts, treat as function
                      if (packageJson.dependencies?.['@cloudbase/aiagent-framework'] ||
                        packageJson.scripts?.['dev']?.includes('cloudrun run')) {
                        serverType = 'function';
                      } else {
                        serverType = 'container';
                      }
                    } catch (parseError) {
                      serverType = 'container';
                    }
                  } else {
                    // No package.json, default to container
                    serverType = 'container';
                  }
                }
              }
            }

            // When serverType was provided explicitly, still try to load remote config for RMW.
            if (!existingService) {
              try {
                const details = await cloudrunService.detail({ serverName: input.serverName });
                remoteServerConfig = (details.ServerConfig || null) as unknown as CloudRunServerConfigLike | null;
                existingService = true;
              } catch {
                // New service create path
              }
            }

            // 新环境必须先初始化云托管（大租户），否则 CreateCloudRunServer 会默认
            // 创建小租户服务。仅创建新服务（非 existing）前探测一次。
            // （2026-08-13 用户实测：luapi-v2 因未初始化云托管被创建到小租户）
            if (!existingService) {
              const currentEnvId = await getEnvId(cloudBaseOptions);
              await ensureCloudRunEnvInitialized({
                cloudBaseOptions,
                envId: currentEnvId,
                serverName: input.serverName,
              });
            }

            let mergedFromRemote: string[] = [];
            let effectiveServerConfig: CloudRunServerConfigLike | undefined = input.serverConfig;

            if (existingService) {
              const mergedResult = mergeCloudRunServerConfig({
                remote: remoteServerConfig,
                input: input.serverConfig || {},
                envParamsReplaceAll: Boolean(input.envParamsReplaceAll),
              });
              effectiveServerConfig = mergedResult.merged;
              mergedFromRemote = mergedResult.mergedFromRemote;
            }

            const deployParams: any = {
              serverName: input.serverName,
              targetPath: targetPath,
              force: input.force,
              serverType: serverType,
            };

            if (input.imageUrl) {
              deployParams.imageUrl = input.imageUrl;
            }

            if (effectiveServerConfig && Object.keys(effectiveServerConfig).length > 0) {
              deployParams.serverConfig = effectiveServerConfig;
            }

            // Manager SDK create path prefers top-level vpcInfo (CreateCloudRunServer.VpcInfo).
            // Prefer serverConfig.VpcConf; if missing, auto-fill from env DescribeEnvBaseInfo
            // (envs opened with vpcId/subnetIds already carry VpcId/SubNetIds).
            const vpcConf = effectiveServerConfig?.VpcConf as
              | { VpcId?: string; SubnetId?: string }
              | undefined;
            let envBaseInfoForVpc: Record<string, unknown> | null = null;
            const explicitVpcId = vpcConf?.VpcId?.trim() ?? "";
            const explicitSubnetId = vpcConf?.SubnetId?.trim() ?? "";
            if (!explicitVpcId || !explicitSubnetId) {
              try {
                const envIdForVpc = await getEnvId(cloudBaseOptions);
                const envStatusForVpc = await describeCloudRunEnvStatus(manager, envIdForVpc);
                if (envStatusForVpc.isExist) {
                  envBaseInfoForVpc = envStatusForVpc.baseInfo;
                }
              } catch {
                // Best-effort: deploy may still succeed without vpcInfo when the platform creates the network.
              }
            }
            const resolvedVpcInfo = resolveCloudRunDeployVpcInfo({
              vpcConf,
              envBaseInfo: envBaseInfoForVpc,
            });
            if (resolvedVpcInfo) {
              deployParams.vpcInfo = resolvedVpcInfo;
            }

            let result: unknown;
            try {
              result = await cloudrunService.deploy(deployParams);
            } catch (error) {
              throw new Error(buildManageCloudRunErrorMessage('deploy', input.serverName, error));
            }

            // Generate cloudbaserc.json configuration file (source-build only; image deploy has no local project dir)
            const currentEnvId = await getEnvId(cloudBaseOptions);

            // Lightweight wait for task / BuildId (source) or RunId (image) registration.
            // Does not wait for full build/deploy completion.
            const deployType: CloudRunDeployRegistrationMode = input.imageUrl
              ? "image"
              : "source";
            const registration = await waitForCloudRunDeployRegistration({
              manager,
              cloudrunService,
              envId: currentEnvId,
              serverName: input.serverName,
              mode: deployType,
              // waitRegistration=false：只做一次探测即返回，把「等注册」交给调用方按需查询
              ...(input.waitRegistration === false ? { maxWaitMs: 0 } : {}),
            });

            let cloudbasercGenerated = false;
            if (targetPath) {
              const cloudbasercPath = path.join(targetPath, 'cloudbaserc.json');
              const cloudbasercContent = {
                envId: currentEnvId,
                cloudrun: {
                  name: input.serverName
                }
              };

              try {
                fs.writeFileSync(cloudbasercPath, JSON.stringify(cloudbasercContent, null, 2));
                cloudbasercGenerated = true;
              } catch (error) {
                debug('cloudbaserc.json creation skipped:', error instanceof Error ? error : new Error(String(error)));
              }
            }
            const consoleUrl = `https://tcb.cloud.tencent.com/dev?envId=${currentEnvId}#/platform-run/service/detail?serverName=${input.serverName}&tabId=overview&envId=${currentEnvId}`;

            let preferredAccessUrl: string | undefined;
            let preferredAccessUrls: string[] = [];
            let preferredAccessSource: string | undefined;
            let verifiedConfigSnapshot: ReturnType<typeof summarizeConfigSnapshot> | undefined;
            try {
              const serviceDetails = await cloudrunService.detail({
                serverName: input.serverName,
              });
              verifiedConfigSnapshot = summarizeConfigSnapshot(
                (serviceDetails as any)?.ServerConfig,
              );
              const fallback = resolveCloudRunFallbackAccess(serviceDetails as any);
              const gateway = await resolveGatewayAccessUrls({
                envId: currentEnvId,
                upstreamResourceName: input.serverName,
                upstreamResourceTypes: ["CBR"],
                getManager: async () => {
                  const manager = await getManager();
                  if (!manager) {
                    throw new Error("cloudbase manager unavailable");
                  }
                  return manager as any;
                },
              });
              const preferred = preferGatewayOrFallback({
                gateway,
                fallbackUrl: fallback.url,
                fallbackSource: fallback.source,
              });
              preferredAccessUrl = preferred.accessUrl;
              preferredAccessUrls = preferred.accessUrls;
              preferredAccessSource = preferred.accessUrlSource;
            } catch {
              // best-effort URL enrichment only
            }

            // Send deployment notification to CodeBuddy IDE
            try {
              const projectName = targetPath ? path.basename(targetPath) : input.serverName;
              await sendDeployNotification(server, {
                deployType: 'cloudrun',
                url: preferredAccessUrl ?? "",
                projectId: currentEnvId,
                projectName: projectName,
                consoleUrl: consoleUrl
              });
            } catch (notifyErr) {
              // Notification failure should not affect deployment flow
              // Error is already logged in sendDeployNotification
            }

            const dbNetworkRisk = detectCloudRunDbNetworkRisk({
              envParams: effectiveServerConfig?.EnvParams as string | undefined,
              vpcConf: effectiveServerConfig?.VpcConf as
                | { VpcId?: string; SubnetId?: string }
                | undefined,
            });
            const warnings = dbNetworkRisk ? [dbNetworkRisk] : [];
            const warningSuffix = dbNetworkRisk
              ? t("cloudrun.deploy.warningSuffix", { message: dbNetworkRisk.message })
              : "";

            const progressHint = buildCloudRunDeployProgressHint({
              deployType,
              serverName: input.serverName,
              buildId: registration.buildId,
              runId: registration.runId,
              registered: registration.registered,
              timedOut: registration.timedOut,
              waitMs: registration.waitMs,
              consoleUrl,
              taskId: registration.taskId,
            });

            const nextStep = buildCloudRunDeployNextStep({
              deployType,
              serverName: input.serverName,
              buildId: registration.buildId,
              runId: registration.runId,
              registered: registration.registered,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      status: 'deploying',
                      deployType,
                      ...(targetPath ? { deployPath: targetPath } : {}),
                      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
                      serverType: serverType,
                      cloudbasercGenerated,
                      consoleUrl,
                      ...(isValidCloudRunBuildId(registration.buildId)
                        ? { buildId: registration.buildId }
                        : {}),
                      ...(isValidCloudRunRunId(registration.runId)
                        ? { runId: registration.runId }
                        : {}),
                      ...(typeof registration.taskId === "number"
                        ? { taskId: registration.taskId }
                        : {}),
                      registration: {
                        registered: registration.registered,
                        timedOut: registration.timedOut,
                        waitMs: registration.waitMs,
                        ...(registration.taskStatus
                          ? { taskStatus: registration.taskStatus }
                          : {}),
                      },
                      next_step: nextStep,
                      ...(existingService
                        ? {
                            configMerge: {
                              existingService: true,
                              mergedFromRemote,
                              appliedConfig: summarizeConfigSnapshot(effectiveServerConfig),
                              ...(verifiedConfigSnapshot
                                ? { verifiedAfterDeploy: verifiedConfigSnapshot }
                                : {}),
                            },
                          }
                        : {}),
                      ...(preferredAccessUrl ? { accessUrl: preferredAccessUrl } : {}),
                      ...(preferredAccessUrls.length > 0
                        ? { accessUrls: preferredAccessUrls }
                        : {}),
                      ...(preferredAccessSource
                        ? { accessUrlSource: preferredAccessSource }
                        : {}),
                      ...(warnings.length > 0 ? { warnings } : {}),
                      // Keep raw SDK result for debugging without implying build finished.
                      ...(result != null ? { deployAccepted: true } : {}),
                    },
                    message:
                      t("cloudrun.deploy.message", {
                        serverType,
                        serverName: input.serverName,
                        source: input.imageUrl
                          ? t("cloudrun.deploy.fromImage", { imageUrl: input.imageUrl })
                          : t("cloudrun.deploy.fromPath", { targetPath: targetPath ?? process.cwd() }),
                        phase: deployType === "image"
                          ? t("cloudrun.deploy.phaseStarting")
                          : t("cloudrun.deploy.phaseBuilding"),
                      }) +
                      progressHint +
                      warningSuffix
                  }, null, 2)
                }
              ]
            };
          }

          case 'updateConfig': {
            if (!input.serverConfig || Object.keys(input.serverConfig).length === 0) {
              throw new Error(
                t("cloudrun.error.serverConfigRequired"),
              );
            }

            let remoteServerConfig: CloudRunServerConfigLike = {};
            try {
              const details = await cloudrunService.detail({
                serverName: input.serverName,
              });
              remoteServerConfig = (details.ServerConfig ||
                {}) as unknown as CloudRunServerConfigLike;
            } catch (error) {
              throw new Error(
                buildManageCloudRunErrorMessage(
                  "updateConfig",
                  input.serverName,
                  error,
                ),
              );
            }

            // EnvParams on Diff replaces the whole blob — merge keys unless replaceAll.
            const dirty: CloudRunServerConfigLike = { ...input.serverConfig };
            if (Object.prototype.hasOwnProperty.call(input.serverConfig, "EnvParams")) {
              const { merged } = mergeCloudRunServerConfig({
                remote: { EnvParams: remoteServerConfig.EnvParams },
                input: { EnvParams: input.serverConfig.EnvParams },
                envParamsReplaceAll: Boolean(input.envParamsReplaceAll),
              });
              if (merged.EnvParams !== undefined) {
                dirty.EnvParams = merged.EnvParams;
              }
            }

            let Items;
            try {
              Items = parseServerConfigToDiffItems(dirty);
            } catch (error) {
              throw new Error(
                buildManageCloudRunErrorMessage(
                  "updateConfig",
                  input.serverName,
                  error,
                ),
              );
            }

            if (Items.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: true,
                        data: {
                          serviceName: input.serverName,
                          status: "noop",
                          itemsCount: 0,
                          appliedConfig: summarizeConfigSnapshot(dirty),
                          verifiedConfig: summarizeConfigSnapshot(remoteServerConfig),
                        },
                        message: t("cloudrun.updateConfig.noop", { serverName: input.serverName }),
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            const currentEnvId = await getEnvId(cloudBaseOptions);
            if (!manager.commonService) {
                throw new Error(
                  t("cloudrun.error.commonServiceSubmitDiff"),
                );
            }

            let diffResult: any;
            try {
              diffResult = await manager
                .commonService("tcbr", "2022-02-17")
                .call({
                  Action: "SubmitServerConfigChangeDiff",
                  Param: {
                    EnvId: currentEnvId,
                    ServerName: input.serverName,
                    Items,
                  },
                });
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              if (/ResourceInUse|task|running|进行中/i.test(msg)) {
                throw new Error(
                  buildManageCloudRunErrorMessage(
                    "updateConfig",
                    input.serverName,
                    new Error(
                      `${msg} ${t("cloudrun.updateConfig.taskRunningHint")}`,
                    ),
                  ),
                );
              }
              throw new Error(
                buildManageCloudRunErrorMessage(
                  "updateConfig",
                  input.serverName,
                  error,
                ),
              );
            }

            let verifiedConfig = summarizeConfigSnapshot(remoteServerConfig);
            try {
              const after = await cloudrunService.detail({
                serverName: input.serverName,
              });
              verifiedConfig = summarizeConfigSnapshot(
                (after as any)?.ServerConfig,
              );
            } catch {
              // best-effort verify
            }

            const likelyRedeploy = listLikelyRedeployFields(dirty);
            const consoleUrl = `https://tcb.cloud.tencent.com/dev?envId=${currentEnvId}#/platform-run/service/detail?serverName=${input.serverName}&tabId=overview&envId=${currentEnvId}`;
            const taskId =
              diffResult?.TaskId ??
              diffResult?.Response?.TaskId ??
              diffResult?.taskId;

            const redeployHint =
              likelyRedeploy.length > 0
                ? t("cloudrun.updateConfig.redeployFields", { fields: likelyRedeploy.join(", ") })
                : t("cloudrun.updateConfig.hotUpdate");

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      data: {
                        serviceName: input.serverName,
                        status: "configUpdating",
                        itemsCount: Items.length,
                        itemsKeys: Items.map((i: { Key: string }) => i.Key),
                        ...(taskId ? { taskId } : {}),
                        appliedConfig: summarizeConfigSnapshot(dirty),
                        verifiedConfig,
                        likelyRedeployFields: likelyRedeploy,
                        consoleUrl,
                      },
                      message: t("cloudrun.updateConfig.message", {
                        serverName: input.serverName,
                        redeployHint,
                        consoleUrl,
                      }),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case 'run': {
            if (!targetPath) {
              throw new Error(t("cloudrun.error.targetPathRequired", { action: "run" }));
            }

            // Do not support container services locally: basic heuristic - if Dockerfile exists, treat as container
            const dockerfilePath = path.join(targetPath, 'Dockerfile');
            if (fs.existsSync(dockerfilePath)) {
              throw new Error(t("cloudrun.error.localRunContainerUnsupported"));
            }

            // Check if this is an Agent project
            const isAgent = checkIfAgentProject(targetPath);
            const runMode = input.runOptions?.runMode || (isAgent ? 'agent' : 'normal');

            // Check if service is already running and verify process exists
            if (runningProcesses.has(input.serverName)) {
              const existingPid = runningProcesses.get(input.serverName)!;
              try {
                // Check if process actually exists
                process.kill(existingPid, 0);
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        success: true,
                        data: {
                          serviceName: input.serverName,
                          status: 'running',
                          pid: existingPid,
                          cwd: targetPath
                        },
                        message: t("cloudrun.run.alreadyRunning", { serverName: input.serverName, pid: existingPid })
                      }, null, 2)
                    }
                  ]
                };
              } catch (error) {
                // Process doesn't exist, remove from tracking
                runningProcesses.delete(input.serverName);
              }
            }

            const runPort = input.runOptions?.port ?? 3000;
            const extraEnv = input.runOptions?.envParams ?? {};

            // Set environment variables for functions-framework
            const env = {
              ...process.env,
              PORT: String(runPort),
              ...extraEnv,
              // Add functions-framework specific environment variables
              ENABLE_CORS: 'true',
              ALLOWED_ORIGINS: '*'
            };

            // Choose execution method based on run mode
            let child;
            const script = `const { runCLI } = require('@cloudbase/functions-framework'); runCLI();`;

            if (runMode === 'agent') {
              const childEnv = {
                ...env,
                PORT: String(runPort),
                ENABLE_CORS: 'true',
                ALLOWED_ORIGINS: '*',
                RUN_MODE: 'agent',
                ...extraEnv,
              };
              child = spawn(process.execPath, ['-e', script], {
                cwd: targetPath,
                env: childEnv,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: true
              });
            } else {
              const childEnv = {
                ...env,
                PORT: String(runPort),
                ENABLE_CORS: 'true',
                ALLOWED_ORIGINS: '*',
                ...extraEnv,
              };
              child = spawn(process.execPath, ['-e', script], {
                cwd: targetPath,
                env: childEnv,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: true
              });
            }

            // Handle process exit to clean up tracking
            child.on('exit', (code, signal) => {
              runningProcesses.delete(input.serverName);
            });

            child.on('error', (error) => {
              runningProcesses.delete(input.serverName);
            });

            child.unref();
            if (typeof child.pid !== 'number') {
              throw new Error(t("cloudrun.error.startFailed"));
            }
            runningProcesses.set(input.serverName, child.pid);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      status: 'running',
                      pid: child.pid,
                      port: runPort,
                      runMode: runMode,
                      isAgent: isAgent,
                      command: script,
                      cwd: targetPath
                    },
                    message: t("cloudrun.run.message", { runMode, serverName: input.serverName, port: runPort, pid: child.pid })
                  }, null, 2)
                }
              ]
            };
          }

          case 'download': {
            if (!targetPath) {
              throw new Error(t("cloudrun.error.targetPathRequired", { action: "download" }));
            }

            const result = await cloudrunService.download({
              serverName: input.serverName,
              targetPath: targetPath,
            });

            // Generate cloudbaserc.json configuration file
            const currentEnvId = await getEnvId(cloudBaseOptions);
            const cloudbasercPath = path.join(targetPath, 'cloudbaserc.json');
            const cloudbasercContent = {
              envId: currentEnvId,
              cloudrun: {
                name: input.serverName
              }
            };

            try {
              fs.writeFileSync(cloudbasercPath, JSON.stringify(cloudbasercContent, null, 2));
            } catch (error) {
              debug('cloudbaserc.json creation skipped:', error instanceof Error ? error : new Error(String(error)));
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      downloadPath: targetPath,
                      filesCount: 0,
                      cloudbasercGenerated: true
                    },
                    message: t("cloudrun.download.message", { serverName: input.serverName, targetPath })
                  }, null, 2)
                }
              ]
            };
          }

          case 'delete': {
            if (!input.force) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: t("cloudrun.error.deleteConfirm"),
                      message: t("cloudrun.error.deleteConfirmMessage")
                    }, null, 2)
                  }
                ]
              };
            }

            const result = await cloudrunService.delete({
              serverName: input.serverName,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      status: 'deleted'
                    },
                    message: t("cloudrun.delete.message", { serverName: input.serverName })
                  }, null, 2)
                }
              ]
            };
          }

          case 'init': {
            if (!targetPath) {
              throw new Error(t("cloudrun.error.targetPathRequired", { action: "init" }));
            }

            const result = await cloudrunService.init({
              serverName: input.serverName,
              targetPath: targetPath,
              template: input.template,
            });

            // Generate cloudbaserc.json configuration file
            const currentEnvId = await getEnvId(cloudBaseOptions);
            const cloudbasercPath = path.join(targetPath, input.serverName, 'cloudbaserc.json');
            const cloudbasercContent = {
              envId: currentEnvId,
              cloudrun: {
                name: input.serverName
              }
            };

            try {
              fs.writeFileSync(cloudbasercPath, JSON.stringify(cloudbasercContent, null, 2));
            } catch (error) {
              debug('cloudbaserc.json creation skipped:', error instanceof Error ? error : new Error(String(error)));
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    data: {
                      serviceName: input.serverName,
                      template: input.template,
                      initPath: targetPath,
                      projectDir: result.projectDir || path.join(targetPath, input.serverName),
                      cloudbasercGenerated: true
                    },
                    message: t("cloudrun.init.message", { serverName: input.serverName, template: input.template ?? DEFAULT_INIT_TEMPLATE, targetPath })
                  }, null, 2)
                }
              ]
            };
          }

        default:
          throw new Error(t("cloudrun.error.unsupportedAction", { action: input.action }));
      }
    }
  );
}
