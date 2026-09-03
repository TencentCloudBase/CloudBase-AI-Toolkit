import type {
  DeployStage,
  IDeployProgressEvent,
} from "@cloudbase/manager-node/types/deploy/types.js";

import type {
  FunctionDeployBuildStatus,
  FunctionDeployErrorStage,
  FunctionDeployStageStatus,
  FunctionDeployTask,
} from "./function-deploy-types.js";
import { omitUndefined } from "./function-deploy-types.js";

/**
 * 云函数镜像部署的子状态机。
 *
 * 本模块只包含纯函数：接收任务对象并就地推进其 build / deploy 子状态，
 * 不感知任务缓存、定时器与 SDK 调用，因此可独立测试。
 *
 * MCP 不重复实现云端构建状态轮询与函数 Active 轮询，只根据 manager-node
 * 上报的进度事件记录阶段。
 */

/** 构建已收尾的状态；其补集即「构建仍未结束」 */
export const TERMINAL_BUILD_STATUSES = new Set<FunctionDeployBuildStatus>([
  "succeeded",
  "failed",
  "skipped",
]);

export const IN_FLIGHT_BUILD_STATUSES = new Set<FunctionDeployBuildStatus>([
  "building",
  "pushing",
]);

export const IN_FLIGHT_DEPLOY_STATUSES = new Set<FunctionDeployStageStatus>([
  "deploying",
  "waiting-active",
]);

/** 进度事件在任务模型中的归属阶段 */
export type DeployStagePhase = "pre" | "build" | "deploy";

/**
 * SDK 进度阶段的唯一元数据表：既决定事件归属哪个子状态，也决定失败时记录的 error.stage。
 *
 * 用 Record<DeployStage, ...> 保证 SDK 新增阶段时编译期强制补全。
 */
export const STAGE_META: Record<
  DeployStage,
  { phase: DeployStagePhase; errorStage: FunctionDeployErrorStage }
> = {
  validate: { phase: "pre", errorStage: "validate" },
  preflight: { phase: "pre", errorStage: "preflight" },
  plan: { phase: "pre", errorStage: "plan" },
  pack: { phase: "build", errorStage: "build" },
  upload: { phase: "build", errorStage: "build" },
  login: { phase: "build", errorStage: "build" },
  build: { phase: "build", errorStage: "build" },
  push: { phase: "build", errorStage: "push" },
  "deploy-function": { phase: "deploy", errorStage: "deploy" },
  "wait-active": { phase: "deploy", errorStage: "wait-active" },
  "configure-access": { phase: "deploy", errorStage: "config" },
  "configure-gateway": { phase: "deploy", errorStage: "config" },
  done: { phase: "deploy", errorStage: "deploy" },
};

/** 把仍在进行中的构建/部署子状态置为 failed；已收尾的子状态保持原值。 */
export function failInFlightStages(task: FunctionDeployTask): void {
  if (IN_FLIGHT_BUILD_STATUSES.has(task.build.status)) {
    task.build.status = "failed";
  }
  if (IN_FLIGHT_DEPLOY_STATUSES.has(task.deploy.status)) {
    task.deploy.status = "failed";
  }
}

/** 进入部署阶段说明构建环节已结束，回填仍未收尾的 build 子状态。 */
function finalizeBuildBeforeDeploy(task: FunctionDeployTask): void {
  if (TERMINAL_BUILD_STATUSES.has(task.build.status)) {
    return;
  }
  task.build.status = task.build.strategy === "image" ? "skipped" : "succeeded";
}

function applyProgressFailure(
  task: FunctionDeployTask,
  event: IDeployProgressEvent,
  errorStage: FunctionDeployErrorStage,
  phase: DeployStagePhase,
): void {
  if (phase === "build") {
    task.build.status = "failed";
  } else if (phase === "deploy") {
    task.deploy.status = "failed";
  }
  task.error = omitUndefined({
    stage: errorStage,
    message: event.message ?? `部署阶段 ${event.stage} 失败`,
    errorCode: event.errorCode,
    requestId: event.requestId,
  });
}

function applyBuildProgress(
  task: FunctionDeployTask,
  event: IDeployProgressEvent,
): void {
  switch (event.stage) {
  case "pack":
  case "upload":
  case "login":
    if (event.status === "start" && task.build.status === "queued") {
      task.build.status = "building";
    }
    break;
  case "build":
    if (event.status === "start") {
      task.build.status = "building";
    } else if (event.status === "skipped") {
      task.build.status = "skipped";
    } else if (event.status === "success" && task.build.strategy !== "local") {
      // local 还要经过 push 阶段才算构建产物就绪
      task.build.status = "succeeded";
    }
    break;
  case "push":
    if (event.status === "start") {
      task.build.status = "pushing";
    } else if (event.status === "success") {
      task.build.status = "succeeded";
    }
    break;
  default:
    break;
  }
}

function applyDeployProgress(
  task: FunctionDeployTask,
  event: IDeployProgressEvent,
): void {
  switch (event.stage) {
  case "deploy-function":
    finalizeBuildBeforeDeploy(task);
    if (event.status === "start") {
      task.deploy.status = "deploying";
    }
    break;
  case "wait-active":
    if (event.status === "start") {
      task.deploy.status = "waiting-active";
    } else if (event.status === "success") {
      task.deploy.functionStatus = "Active";
    }
    break;
  case "configure-access":
  case "configure-gateway":
    if (event.status === "start" && task.deploy.status !== "failed") {
      task.deploy.status = "deploying";
    }
    break;
  default:
    break;
  }
}

/** 记录一个进度事件并按其归属阶段推进对应子状态。 */
export function applyFunctionDeployProgress(
  task: FunctionDeployTask,
  event: IDeployProgressEvent,
): void {
  task.progress.push(event);

  const { phase, errorStage } = STAGE_META[event.stage];

  if (event.status === "failed") {
    applyProgressFailure(task, event, errorStage, phase);
    return;
  }

  if (phase === "build") {
    applyBuildProgress(task, event);
  } else if (phase === "deploy") {
    applyDeployProgress(task, event);
  }
}
