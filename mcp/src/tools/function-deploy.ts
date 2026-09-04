import type {
  IDeployProgressEvent,
  IFunctionDeployConfig,
  IFunctionDeployOptions,
  IFunctionDeployResult,
} from "@cloudbase/manager-node/types/deploy/types.js";

import type { FunctionDeployConfigInput } from "./function-deploy-schema.js";
import {
  applyFunctionDeployProgress,
  failInFlightStages,
  IN_FLIGHT_BUILD_STATUSES,
  TERMINAL_BUILD_STATUSES,
} from "./function-deploy-progress.js";
import {
  createFunctionDeployTask,
  settleFunctionDeployTask,
} from "./function-deploy-task-store.js";
import type {
  FunctionDeployManager,
  FunctionDeploySummary,
  FunctionDeployTask,
  FunctionDeployTaskError,
  FunctionDeployTaskView,
} from "./function-deploy-types.js";
import { omitUndefined } from "./function-deploy-types.js";

/**
 * 云函数镜像部署的 SDK 适配、异步任务编排与对外视图。
 *
 * 分工：
 * - function-deploy-types.ts：共享类型与基础工具
 * - function-deploy-progress.ts：进度事件驱动的子状态机（纯函数）
 * - function-deploy-task-store.ts：任务缓存与生命周期
 * - 本模块：调用 manager-node、串联上述模块、生成响应结构
 */

export type {
  FunctionDeployBuildState,
  FunctionDeployBuildStatus,
  FunctionDeployErrorStage,
  FunctionDeployManager,
  FunctionDeployStageState,
  FunctionDeployStageStatus,
  FunctionDeployStrategy,
  FunctionDeploySummary,
  FunctionDeployTask,
  FunctionDeployTaskError,
  FunctionDeployTaskStatus,
  FunctionDeployTaskView,
} from "./function-deploy-types.js";

export {
  applyFunctionDeployProgress,
} from "./function-deploy-progress.js";

export {
  cleanupFunctionDeployTasks,
  DEPLOY_TASK_EXPIRED_ERROR_CODE,
  FUNCTION_DEPLOY_TASK_LIMITS,
  getFunctionDeployTask,
  getFunctionDeployTaskCount,
  isTerminalFunctionDeployStatus,
  resetFunctionDeployTasks,
} from "./function-deploy-task-store.js";

export const DEPLOY_TASK_NOT_FOUND_ERROR_CODE = "DEPLOY_TASK_NOT_FOUND";

/**
 * 个人版 TCR 推送凭证的环境变量名。
 *
 * 与 cloudbaserc 的 `{{env.TCB_TCR_USERNAME}}` / `{{env.TCB_TCR_PASSWORD}}` 约定同名：
 * manager-node 与 toolbox 的校验失败提示都指向这两个名字，CLI 与 MCP 两条链路
 * 因此共用同一套变量，用户不需要为 MCP 单独再配一份。
 *
 * 注意不要改成 TCR_USERNAME / TCR_PASSWORD：那是 manager-node 注入到云端构建容器内部的
 * 变量名（密码实际走 CloudApp Secrets 的 TCR_PASSWORD_B64），与本进程的环境变量是两回事。
 */
export const TCR_CREDENTIAL_ENV_VARS = {
  username: "TCB_TCR_USERNAME",
  password: "TCB_TCR_PASSWORD",
} as const;

/** 凭证各字段的来源，仅用于诊断；不包含凭证值本身。 */
export type RegistryCredentialSource = {
  username?: "argument" | "env";
  password?: "argument" | "env";
};

type RegistryCredentialInput = {
  username?: string;
  password?: string;
};

function readEnvCredentialField(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }
  // 只裁剪首尾空白：密码本身可能包含空格等特殊字符，不做任何其它规整
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 用环境变量补齐个人版 TCR 推送凭证。
 *
 * 采用字段级回退而非整体替换：UIN 不是秘密，允许显式写在入参里，
 * 而密码走环境变量，这种混合来源是常见用法。
 *
 * 调用方负责限定适用范围（仅 personal 的 local/cloud 策略），本函数只做取值。
 */
export function resolveRegistryCredential(
  credential: RegistryCredentialInput | undefined,
  options: { allowEnv: boolean },
): {
  credential?: RegistryCredentialInput;
  source: RegistryCredentialSource;
} {
  const fromArgs = {
    username: credential?.username?.trim() || undefined,
    password: credential?.password || undefined,
  };
  const fromEnv = options.allowEnv
    ? {
      username: readEnvCredentialField(TCR_CREDENTIAL_ENV_VARS.username),
      password: readEnvCredentialField(TCR_CREDENTIAL_ENV_VARS.password),
    }
    : { username: undefined, password: undefined };

  // 显式入参优先，缺失字段回退到环境变量
  const username = fromArgs.username ?? fromEnv.username;
  const password = fromArgs.password ?? fromEnv.password;

  const source: RegistryCredentialSource = omitUndefined({
    username: username === undefined
      ? undefined
      : fromArgs.username !== undefined ? "argument" as const : "env" as const,
    password: password === undefined
      ? undefined
      : fromArgs.password !== undefined ? "argument" as const : "env" as const,
  });

  if (username === undefined && password === undefined) {
    return { source };
  }

  return {
    credential: omitUndefined({ username, password }),
    source,
  };
}

function applyTerminalResult(
  task: FunctionDeployTask,
  result: FunctionDeploySummary,
  now: number,
): void {
  task.result = result;
  task.build.imageUri = result.imageUri ?? task.build.imageUri;
  task.build.imageDigest = result.imageDigest ?? task.build.imageDigest;
  // 只有云端构建才有真实 buildId；local 用 localBuildId，不把本地标识伪装成云端 ID
  if (task.build.strategy === "cloud" && result.buildId) {
    task.build.buildId = result.buildId;
  }
  if (!TERMINAL_BUILD_STATUSES.has(task.build.status)) {
    task.build.status = "succeeded";
  }
  task.deploy.action = result.action;
  task.deploy.status = "succeeded";
  task.deploy.functionStatus = task.deploy.functionStatus ?? "Active";
  settleFunctionDeployTask(task, "succeeded", now);
}

function applyTerminalError(
  task: FunctionDeployTask,
  error: FunctionDeployTaskError,
  now: number,
): void {
  // 新值优先，缺失字段回退到进度事件已记录的信息
  task.error = { ...task.error, ...omitUndefined(error) };
  failInFlightStages(task);
  settleFunctionDeployTask(task, "failed", now);
}

/**
 * 创建异步部署任务并在后台执行完整的 deployFunction。
 *
 * MCP Client 超时不等于部署失败：任务会保持 running，直到 manager-node 返回结果。
 */
export function startFunctionDeployTask(
  manager: FunctionDeployManager,
  input: FunctionDeployConfigInput,
  envId: string,
  options: IFunctionDeployOptions,
): FunctionDeployTask {
  const task = createFunctionDeployTask(input, envId);

  void executeFunctionDeploy(manager, input, {
    ...options,
    onProgress: (event) => {
      applyFunctionDeployProgress(task, event);
      options.onProgress?.(event);
    },
  })
    .then((response) => {
      if (response.success) {
        applyTerminalResult(task, response.data, Date.now());
        return;
      }
      applyTerminalError(
        task,
        omitUndefined({
          stage: "validate" as const,
          message: response.message,
          errorCode: response.errorCode,
        }),
        Date.now(),
      );
    })
    .catch((error: unknown) => {
      applyTerminalError(
        task,
        omitUndefined({
          message: error instanceof Error ? error.message : String(error),
          errorCode: getFunctionDeployErrorCode(error),
          requestId: getFunctionDeployRequestId(error),
        }),
        Date.now(),
      );
    });

  return task;
}

/** 固定结构的任务视图：运行中时 result / error 一律为 null，禁止被解读为部署成功。 */
export function serializeFunctionDeployTask(
  task: FunctionDeployTask,
): FunctionDeployTaskView {
  return {
    taskId: task.taskId,
    envId: task.envId,
    functionName: task.functionName,
    requestedStrategy: task.requestedStrategy,
    status: task.status,
    createdAt: task.createdAt,
    startedAt: task.startedAt ?? null,
    finishedAt: task.finishedAt ?? null,
    lastAccessAt: task.lastAccessAt,
    build: task.build,
    deploy: task.deploy,
    progress: task.progress,
    result: task.result ?? null,
    error: task.error ?? null,
  };
}

const POLL_HINT = "请继续轮询，不要向用户报告部署完成。";

/** 运行中任务的当前阶段短语，用于拼装面向 Agent 的提示文案。 */
function describeRunningPhase(task: FunctionDeployTask): string {
  if (task.deploy.status === "waiting-active") {
    return "正在等待 Active 状态";
  }
  // queued 也属于 in-flight，但它是「构建尚未开始」而非「正在构建」，单独措辞
  if (task.build.status === "queued") {
    return "镜像构建排队中（尚未收到首个构建事件）";
  }
  if (IN_FLIGHT_BUILD_STATUSES.has(task.build.status)) {
    return `正在执行镜像构建（${task.build.status}）`;
  }
  return "部署任务执行中";
}

export function describeFunctionDeployTask(task: FunctionDeployTask): string {
  const subject = `云函数 ${task.functionName}`;
  switch (task.status) {
  case "running":
    return `${subject} ${describeRunningPhase(task)}；${POLL_HINT}`;
  case "succeeded":
    return `${subject} 镜像部署成功。`;
  case "failed":
    return `${subject} 部署失败，请根据 error.stage 和 progress 排查。`;
  case "expired":
    return `${subject} 的部署任务已过期（超过最长保留时间）；云端可能仍在部署，请用 getFunctionDetail 确认实际状态。`;
  default:
    return `${subject} 部署任务状态未知。`;
  }
}

/**
 * MCP 入参已直接对齐 SDK 的嵌套 imageConfig 契约，无需再做字段平铺映射。
 * 规范化（补 runtime/imagePort 默认值、收窄类型）与业务契约校验都由 SDK 内部完成，
 * 这里仅将结构化入参原样透传为部署配置。
 */
export function toFunctionDeployConfig(
  input: FunctionDeployConfigInput,
): IFunctionDeployConfig {
  return input as unknown as IFunctionDeployConfig;
}

/** 显式字段白名单，避免 SDK 新增字段自动进入 MCP 响应。 */
export function sanitizeFunctionDeployResult(
  result: IFunctionDeployResult,
): FunctionDeploySummary {
  return {
    functionName: result.functionName,
    functionType: result.functionType,
    requestedStrategy: result.requestedStrategy,
    effectiveStrategy: result.effectiveStrategy,
    action: result.action,
    operations: result.operations,
    dryRun: result.dryRun,
    imageUri: result.imageUri,
    imageDigest: result.imageDigest,
    buildId: result.buildId,
    gatewayUrl: result.gatewayUrl,
    public: result.public,
    elapsedTime: result.elapsedTime,
    steps: result.steps,
    warnings: result.warnings,
    plan: result.plan,
  };
}

function pickNestedStringField(
  error: unknown,
  keys: string[],
): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as Record<string, unknown>;
  const nested = [candidate.original, candidate.response, candidate.data].filter(
    (value): value is Record<string, unknown> => Boolean(value && typeof value === "object"),
  );

  for (const value of [
    ...keys.map((key) => candidate[key]),
    ...nested.flatMap((item) => keys.map((key) => item[key])),
  ]) {
    if (typeof value === "string" && value) {
      return value;
    }
  }

  return undefined;
}

export function getFunctionDeployRequestId(error: unknown): string | undefined {
  return pickNestedStringField(error, ["requestId", "RequestId"]);
}

export function getFunctionDeployErrorCode(error: unknown): string | undefined {
  return pickNestedStringField(error, ["errorCode", "code", "Code"]);
}

/** SDK 判定为凭证问题的稳定错误码 */
const REGISTRY_CREDENTIAL_ERROR_CODES = new Set([
  "CLOUD_REGISTRY_CREDENTIAL_MISSING",
  "CLOUD_REGISTRY_CREDENTIAL_INVALID",
]);

/**
 * 当 SDK 判定为凭证缺失或不合法时，补一句面向 MCP 渠道的修复指引。
 *
 * SDK 的原始提示推荐 `{{env.TCB_TCR_USERNAME}}`，那是 cloudbaserc 的模板语法，
 * 对 MCP 调用方不适用。这里不重复做校验，只读 SDK 已给出的结论并翻译修复方式。
 */
function buildRegistryCredentialHint(checks: Array<Record<string, unknown>>): string {
  const hasCredentialIssue = Array.isArray(checks)
    && checks.some((check) => typeof check?.code === "string"
      && REGISTRY_CREDENTIAL_ERROR_CODES.has(check.code));

  if (!hasCredentialIssue) {
    return "";
  }

  return (
    `个人版 TCR 推送凭证缺失或不合法：请在 MCP 配置的 env 中设置 ` +
    `${TCR_CREDENTIAL_ENV_VARS.username}（腾讯云账号 UIN）与 ` +
    `${TCR_CREDENTIAL_ENV_VARS.password}，配置后无需在请求参数中传递密码；` +
    `不要向用户索要密码明文并写入工具参数。`
  );
}

/**
 * 执行一次部署（同步等待完成）。
 *
 * 进度事件只通过 options.onProgress 透传给调用方，由调用方决定是否收集，
 * 避免异步任务路径下出现两份 progress 副本。
 */
export async function executeFunctionDeploy(
  manager: FunctionDeployManager,
  input: FunctionDeployConfigInput,
  options: IFunctionDeployOptions,
) {
  const config = toFunctionDeployConfig(input);
  const configReport = manager.functionDeployer.checkConfig(config);

  if (!configReport.ready) {
    const credentialHint = buildRegistryCredentialHint(configReport.checks);
    return {
      success: false as const,
      data: { configReport },
      errorCode: "CONFIG_INVALID",
      message: `云函数镜像部署配置校验未通过，未执行部署。${credentialHint}`,
    };
  }

  const result = await manager.functionDeployer.deployFunction(config, options);

  return {
    success: true as const,
    data: sanitizeFunctionDeployResult(result),
    message: result.dryRun
      ? `已生成云函数 ${result.functionName} 的镜像部署 dry-run 计划，未执行构建、推送或云端变更。`
      : `云函数 ${result.functionName} 镜像部署成功。`,
  };
}

/**
 * 同步路径下执行部署并一并返回进度事件。
 *
 * 供需要在单次响应里回传阶段进度的调用方使用（wait=true）。
 */
export async function executeFunctionDeployWithProgress(
  manager: FunctionDeployManager,
  input: FunctionDeployConfigInput,
  options: IFunctionDeployOptions,
) {
  const progress: IDeployProgressEvent[] = [];
  const response = await executeFunctionDeploy(manager, input, {
    ...options,
    onProgress: (event) => {
      progress.push(event);
      options.onProgress?.(event);
    },
  });

  return {
    ...response,
    ...(progress.length ? { progress } : {}),
  };
}
