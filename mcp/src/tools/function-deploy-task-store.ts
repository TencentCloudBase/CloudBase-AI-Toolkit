import { randomUUID } from "node:crypto";

import { warn } from "../utils/logger.js";
import type { FunctionDeployConfigInput } from "./function-deploy-schema.js";
import { failInFlightStages } from "./function-deploy-progress.js";
import type {
  FunctionDeployTask,
  FunctionDeployTaskStatus,
} from "./function-deploy-types.js";
import { parseIsoMs, toIsoString } from "./function-deploy-types.js";

/**
 * 云函数镜像部署任务的进程内缓存与生命周期管理。
 *
 * 任务只保存在当前 MCP 进程内存中，MCP Server 重启即丢失。
 * 运行中的任务永远不会因为 MCP Client 超时或缓存压力被直接删除。
 */

export const FUNCTION_DEPLOY_TASK_LIMITS = {
  /** 终态任务按 finishedAt 保留 30 分钟 */
  terminalTtlMs: 30 * 60 * 1000,
  /** 终态任务按 lastAccessAt 的空闲保留时间 */
  idleTtlMs: 30 * 60 * 1000,
  /** 任务（含运行中）最长保留时间：2 小时，超时标记 expired */
  maxAgeMs: 2 * 60 * 60 * 1000,
  /** 定时清理周期 */
  cleanupIntervalMs: 5 * 60 * 1000,
  /** 最大任务数，超出时优先清理最旧的终态任务 */
  maxTasks: 500,
} as const;

export const DEPLOY_TASK_EXPIRED_ERROR_CODE = "DEPLOY_TASK_EXPIRED";

const TERMINAL_TASK_STATUSES = new Set<FunctionDeployTaskStatus>([
  "succeeded",
  "failed",
  "expired",
]);

export function isTerminalFunctionDeployStatus(
  status: FunctionDeployTaskStatus,
): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

const functionDeployTasks = new Map<string, FunctionDeployTask>();

let cleanupTimer: ReturnType<typeof setInterval> | undefined;

/**
 * 任务的终结时间：优先 finishedAt，其次 createdAt。
 *
 * 时间字段可能缺失或非法，统一在此收口兜底，避免各处出现不一致的 fallback。
 */
function settledAtMs(task: FunctionDeployTask, fallback: number): number {
  return parseIsoMs(task.finishedAt) ?? parseIsoMs(task.createdAt) ?? fallback;
}

function ensureCleanupTimer(): void {
  if (cleanupTimer) {
    return;
  }
  cleanupTimer = setInterval(() => {
    cleanupFunctionDeployTasks();
  }, FUNCTION_DEPLOY_TASK_LIMITS.cleanupIntervalMs);
  // 定时清理不应阻止 MCP 进程退出
  cleanupTimer.unref?.();
}

function clearCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = undefined;
  }
}

function markFunctionDeployTaskExpired(
  task: FunctionDeployTask,
  now: number,
): void {
  task.status = "expired";
  task.finishedAt = toIsoString(now);
  failInFlightStages(task);
  task.error = task.error ?? {
    message:
      "部署任务超过最长保留时间（2 小时）已被标记为过期；云端构建或云函数部署可能仍在继续，请通过 queryFunctions 的 getFunctionDetail 确认实际状态。",
    errorCode: DEPLOY_TASK_EXPIRED_ERROR_CODE,
  };
}

/**
 * 清理任务缓存。
 *
 * - 终态任务：finishedAt 超过终态 TTL，或 lastAccessAt 超过空闲 TTL 后删除
 * - 运行中任务：createdAt 超过最长保留时间后只标记 expired（保留错误与追踪信息），不直接删除
 *
 * 任务从缓存删除不代表云端部署已经停止。
 */
export function cleanupFunctionDeployTasks(now: number = Date.now()): {
  removed: number;
  expired: number;
} {
  let removed = 0;
  let expired = 0;

  for (const [taskId, task] of functionDeployTasks) {
    const createdAt = parseIsoMs(task.createdAt) ?? now;

    if (!isTerminalFunctionDeployStatus(task.status)) {
      if (now - createdAt > FUNCTION_DEPLOY_TASK_LIMITS.maxAgeMs) {
        // 无法确认本地构建进程/云端部署能否安全终止，因此只标记 expired 并保留追踪信息
        markFunctionDeployTaskExpired(task, now);
        expired += 1;
      }
      continue;
    }

    const lastAccessAt = parseIsoMs(task.lastAccessAt) ?? createdAt;
    const shouldRemove =
      now - settledAtMs(task, createdAt) > FUNCTION_DEPLOY_TASK_LIMITS.terminalTtlMs ||
      now - lastAccessAt > FUNCTION_DEPLOY_TASK_LIMITS.idleTtlMs;

    if (shouldRemove) {
      functionDeployTasks.delete(taskId);
      removed += 1;
    }
  }

  if (functionDeployTasks.size === 0) {
    clearCleanupTimer();
  }

  return { removed, expired };
}

/**
 * 达到最大任务数时，优先清理最旧的终态任务；运行中的任务不会被删除。
 *
 * 因此当全部任务都在运行时，任务数会超过 maxTasks —— 这是刻意取舍：
 * 宁可超限，也不中断正在执行的部署。超限时记录 warn 便于观测。
 */
function enforceMaxTasks(): void {
  const { maxTasks } = FUNCTION_DEPLOY_TASK_LIMITS;
  if (functionDeployTasks.size < maxTasks) {
    return;
  }

  const evictable = [...functionDeployTasks.values()]
    .filter((task) => isTerminalFunctionDeployStatus(task.status))
    .sort((left, right) => settledAtMs(left, 0) - settledAtMs(right, 0));

  for (const task of evictable) {
    if (functionDeployTasks.size < maxTasks) {
      return;
    }
    functionDeployTasks.delete(task.taskId);
  }

  if (functionDeployTasks.size >= maxTasks) {
    warn(
      "云函数部署任务缓存已达上限但无可清理的终态任务，将暂时超过上限以避免中断正在执行的部署",
      { taskCount: functionDeployTasks.size, maxTasks },
    );
  }
}

/**
 * 创建并登记任务记录。
 *
 * 后台执行随任务创建同步启动，因此任务直接落 running + startedAt，
 * 不存在对外可观测的排队阶段。
 */
export function createFunctionDeployTask(
  input: FunctionDeployConfigInput,
  envId: string,
  now: number = Date.now(),
): FunctionDeployTask {
  cleanupFunctionDeployTasks(now);
  enforceMaxTasks();

  const strategy = input.buildStrategy;
  const nowIso = toIsoString(now);
  const task: FunctionDeployTask = {
    taskId: randomUUID(),
    envId,
    functionName: input.name,
    requestedStrategy: strategy,
    status: "running",
    createdAt: nowIso,
    startedAt: nowIso,
    lastAccessAt: nowIso,
    build: {
      strategy,
      // 已有镜像不需要构建
      status: strategy === "image" ? "skipped" : "queued",
      ...(strategy === "local"
        ? { localBuildId: `local-build-${randomUUID()}` }
        : {}),
    },
    deploy: { status: "pending" },
    progress: [],
  };

  functionDeployTasks.set(task.taskId, task);
  ensureCleanupTimer();

  return task;
}

/**
 * 按 taskId + envId 读取任务并刷新 lastAccessAt。
 *
 * envId 不匹配时返回 undefined 而不是抛「无权访问」：任务表是进程内全局 Map，
 * 在 hosted 多租户形态下区分「任务不存在」与「任务存在但不属于你」本身就是信息泄漏，
 * 调用方只需知道自己这个环境下查不到这个任务。
 *
 * 这里刻意做惰性清理而不依赖定时器：既保证过期任务不会被读到，
 * 也让测试可以直接注入 now，无需操纵假定时器。任务上限 500，全表扫描成本可忽略。
 *
 * lastAccessAt 只用于判断任务是否长时间未被访问，不作为任务成功或失败的依据。
 */
export function getFunctionDeployTask(
  taskId: string,
  envId: string,
  now: number = Date.now(),
): FunctionDeployTask | undefined {
  cleanupFunctionDeployTasks(now);
  const task = functionDeployTasks.get(taskId);
  if (!task || task.envId !== envId) {
    return undefined;
  }
  task.lastAccessAt = toIsoString(now);
  return task;
}

export function getFunctionDeployTaskCount(): number {
  return functionDeployTasks.size;
}

/** 测试用：清空任务缓存并停止定时清理 */
export function resetFunctionDeployTasks(): void {
  functionDeployTasks.clear();
  clearCleanupTimer();
}

/**
 * 落任务终态。
 *
 * expired 任务不会被后到的部署结果改写，避免过期任务被谎报为成功。
 */
export function settleFunctionDeployTask(
  task: FunctionDeployTask,
  status: "succeeded" | "failed",
  now: number,
): void {
  if (task.status === "expired") {
    return;
  }
  task.status = status;
  task.finishedAt = toIsoString(now);
}
