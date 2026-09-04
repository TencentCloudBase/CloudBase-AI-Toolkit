import type {
  DeployActionKind,
  IDeployProgressEvent,
  IFunctionDeployConfig,
  IFunctionDeployOptions,
  IFunctionDeployResult,
} from "@cloudbase/manager-node/types/deploy/types.js";

import type { FunctionDeployConfigInput } from "./function-deploy-schema.js";

/**
 * 云函数镜像部署任务的共享类型与基础工具。
 *
 * 独立成模块以避免 function-deploy / function-deploy-task-store /
 * function-deploy-progress 之间形成循环依赖：本模块不 import 任何同级模块。
 */

export type FunctionDeployManager = {
  functionDeployer: {
    checkConfig: (config: IFunctionDeployConfig) => {
      ready: boolean;
      checks: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    deployFunction: (
      config: IFunctionDeployConfig,
      options: IFunctionDeployOptions,
    ) => Promise<IFunctionDeployResult>;
  };
};

export type FunctionDeployStrategy = FunctionDeployConfigInput["buildStrategy"];

/**
 * 任务状态。
 *
 * 没有 queued：后台执行随任务创建同步启动，任务一经建立即处于 running，
 * 不存在对外可观测的排队阶段。
 */
export type FunctionDeployTaskStatus =
  | "running"
  | "succeeded"
  | "failed"
  /** 超过最长保留时间被强制终结；云端部署可能仍在继续 */
  | "expired";

/**
 * 构建子状态的全集。
 *
 * queued 是真实可观测状态：任务已创建但首个构建事件尚未到达。
 * 与任务级状态无关，不要一并删除。
 *
 * 写成运行时数组而非纯类型，是为了让 function-deploy-progress 里
 * IN_FLIGHT / TERMINAL 两个集合能被测试断言为对本集合的一个划分
 * （每个状态恰好属于其中之一）。曾经 queued 两个集合都不在，
 * 导致排队阶段失败或过期的任务一直显示 build.status=queued。
 */
export const FUNCTION_DEPLOY_BUILD_STATUSES = [
  "queued",
  "building",
  "pushing",
  "succeeded",
  "failed",
  "skipped",
] as const;

export type FunctionDeployBuildStatus =
  (typeof FUNCTION_DEPLOY_BUILD_STATUSES)[number];

export type FunctionDeployStageStatus =
  | "pending"
  | "deploying"
  | "waiting-active"
  | "succeeded"
  | "failed";

export type FunctionDeployErrorStage =
  | "validate"
  | "preflight"
  | "plan"
  | "build"
  | "push"
  | "deploy"
  | "wait-active"
  | "config";

export type FunctionDeployBuildState = {
  strategy: FunctionDeployStrategy;
  status: FunctionDeployBuildStatus;
  /** 云端构建 ID，仅 cloud 策略有值 */
  buildId?: string;
  /** 本地构建标识，仅 local 策略有值；不等价于云端 buildId */
  localBuildId?: string;
  imageUri?: string;
  imageDigest?: string;
};

export type FunctionDeployStageState = {
  status: FunctionDeployStageStatus;
  action?: DeployActionKind;
  functionStatus?: string;
};

export type FunctionDeployTaskError = {
  stage?: FunctionDeployErrorStage;
  message: string;
  errorCode?: string;
  requestId?: string;
};

/**
 * 对外暴露的部署结果字段白名单。
 *
 * 显式列举而非整体透传 IFunctionDeployResult，避免 SDK 新增字段自动泄漏到 MCP 响应。
 */
export type FunctionDeploySummary = Pick<
  IFunctionDeployResult,
  | "functionName"
  | "functionType"
  | "requestedStrategy"
  | "effectiveStrategy"
  | "action"
  | "operations"
  | "dryRun"
  | "imageUri"
  | "imageDigest"
  | "buildId"
  | "gatewayUrl"
  | "public"
  | "elapsedTime"
  | "steps"
  | "warnings"
  | "plan"
>;

export type FunctionDeployTask = {
  taskId: string;
  /**
   * 任务归属的环境 ID，创建时固定写入。
   *
   * 任务表是进程内全局 Map，而 hosted 形态下同一进程服务多个租户；查询按
   * taskId + envId 双重匹配，避免拿到 taskId 就能读到别的环境的
   * functionName / imageUri / gatewayUrl。
   */
  envId: string;
  functionName: string;
  requestedStrategy: FunctionDeployStrategy;
  status: FunctionDeployTaskStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  lastAccessAt: string;
  build: FunctionDeployBuildState;
  deploy: FunctionDeployStageState;
  progress: IDeployProgressEvent[];
  result?: FunctionDeploySummary;
  error?: FunctionDeployTaskError;
};

/** getFunctionDeployStatus 的固定响应结构；running 时 result / error 必为 null。 */
export type FunctionDeployTaskView = {
  taskId: string;
  envId: string;
  functionName: string;
  requestedStrategy: FunctionDeployStrategy;
  status: FunctionDeployTaskStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastAccessAt: string;
  build: FunctionDeployBuildState;
  deploy: FunctionDeployStageState;
  progress: IDeployProgressEvent[];
  result: FunctionDeploySummary | null;
  error: FunctionDeployTaskError | null;
};

export function toIsoString(now: number): string {
  return new Date(now).toISOString();
}

export function parseIsoMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 丢弃值为 undefined 的键，避免构造出 { errorCode: undefined } 这类噪声字段。 */
export function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
