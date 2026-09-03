import { describe, expect, it } from "vitest";
import type { IDeployProgressEvent } from "@cloudbase/manager-node/types/deploy/types.js";

import {
  applyFunctionDeployProgress,
  failInFlightStages,
  IN_FLIGHT_BUILD_STATUSES,
  STAGE_META,
  TERMINAL_BUILD_STATUSES,
} from "./function-deploy-progress.js";
import type {
  FunctionDeployStrategy,
  FunctionDeployTask,
} from "./function-deploy-types.js";

/**
 * 子状态机是纯函数：这里不涉及任务缓存、定时器或 manager-node mock，
 * 直接构造任务对象并断言状态迁移。
 */
function makeTask(strategy: FunctionDeployStrategy): FunctionDeployTask {
  const now = new Date().toISOString();
  return {
    taskId: "task-progress",
    functionName: "hello-world",
    requestedStrategy: strategy,
    status: "running",
    createdAt: now,
    startedAt: now,
    lastAccessAt: now,
    build: { strategy, status: strategy === "image" ? "skipped" : "queued" },
    deploy: { status: "pending" },
    progress: [],
  };
}

function progress(
  stage: IDeployProgressEvent["stage"],
  status: IDeployProgressEvent["status"],
  extra: Partial<IDeployProgressEvent> = {},
): IDeployProgressEvent {
  return { stage, status, ...extra };
}

describe("function deploy progress state machine", () => {
  it("classifies every SDK stage exactly once", () => {
    const stages = Object.keys(STAGE_META);
    expect(stages).toHaveLength(13);
    for (const [stage, meta] of Object.entries(STAGE_META)) {
      expect(["pre", "build", "deploy"]).toContain(meta.phase);
      expect(meta.errorStage, `stage ${stage} must declare an error stage`).toBeTruthy();
    }
  });

  it("appends every event to the progress trail", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(task, progress("validate", "start"));
    applyFunctionDeployProgress(task, progress("validate", "success"));

    expect(task.progress).toHaveLength(2);
  });

  it("advances a cloud build through building then succeeded", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(task, progress("build", "start"));
    expect(task.build.status).toBe("building");

    applyFunctionDeployProgress(task, progress("build", "success"));
    expect(task.build.status).toBe("succeeded");
  });

  it("holds a local build at building until push succeeds", () => {
    const task = makeTask("local");
    applyFunctionDeployProgress(task, progress("build", "start"));
    applyFunctionDeployProgress(task, progress("build", "success"));
    // local 的构建产物只有推送完成后才算就绪
    expect(task.build.status).toBe("building");

    applyFunctionDeployProgress(task, progress("push", "start"));
    expect(task.build.status).toBe("pushing");

    applyFunctionDeployProgress(task, progress("push", "success"));
    expect(task.build.status).toBe("succeeded");
  });

  it("promotes queued to building on pack, upload and login starts", () => {
    for (const stage of ["pack", "upload", "login"] as const) {
      const task = makeTask("cloud");
      applyFunctionDeployProgress(task, progress(stage, "start"));
      expect(task.build.status).toBe("building");
    }
  });

  it("does not regress an already pushing build on a late pack event", () => {
    const task = makeTask("local");
    applyFunctionDeployProgress(task, progress("push", "start"));
    applyFunctionDeployProgress(task, progress("pack", "start"));

    expect(task.build.status).toBe("pushing");
  });

  it("records a skipped build when the SDK reports it", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(task, progress("build", "skipped"));
    expect(task.build.status).toBe("skipped");
  });

  it("tracks the deploy stage through waiting-active to Active", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(task, progress("deploy-function", "start"));
    expect(task.deploy.status).toBe("deploying");

    applyFunctionDeployProgress(task, progress("wait-active", "start"));
    expect(task.deploy.status).toBe("waiting-active");

    applyFunctionDeployProgress(task, progress("wait-active", "success"));
    expect(task.deploy.functionStatus).toBe("Active");
  });

  it("backfills an unfinished build when the deploy stage begins", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(task, progress("deploy-function", "start"));
    expect(task.build.status).toBe("succeeded");
  });

  it("keeps an image strategy build skipped when the deploy stage begins", () => {
    const task = makeTask("image");
    applyFunctionDeployProgress(task, progress("deploy-function", "start"));
    expect(task.build.status).toBe("skipped");
  });

  it("does not overwrite a failed build when the deploy stage begins", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(task, progress("build", "failed"));
    applyFunctionDeployProgress(task, progress("deploy-function", "start"));

    expect(task.build.status).toBe("failed");
  });

  it("does not revive a failed deploy on gateway configuration events", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(task, progress("wait-active", "failed"));
    applyFunctionDeployProgress(task, progress("configure-gateway", "start"));

    expect(task.deploy.status).toBe("failed");
  });

  it.each([
    ["build", "build"],
    ["push", "push"],
    ["deploy-function", "deploy"],
    ["wait-active", "wait-active"],
    ["configure-access", "config"],
    ["configure-gateway", "config"],
    ["validate", "validate"],
    ["preflight", "preflight"],
    ["plan", "plan"],
  ] as const)("maps a %s failure to the %s error stage", (stage, errorStage) => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(task, progress(stage, "failed"));
    expect(task.error?.stage).toBe(errorStage);
  });

  it("leaves both sub-states untouched on pre-phase failures", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(
      task,
      progress("preflight", "failed", { message: "Docker 未安装" }),
    );

    expect(task.build.status).toBe("queued");
    expect(task.deploy.status).toBe("pending");
    expect(task.error).toMatchObject({ stage: "preflight", message: "Docker 未安装" });
  });

  it("falls back to a generic message and omits absent error metadata", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(task, progress("build", "failed"));

    expect(task.error?.message).toContain("build");
    expect(task.error).not.toHaveProperty("errorCode");
    expect(task.error).not.toHaveProperty("requestId");
  });

  it("carries errorCode and requestId through when the SDK provides them", () => {
    const task = makeTask("cloud");
    applyFunctionDeployProgress(
      task,
      progress("wait-active", "failed", {
        message: "函数创建失败",
        errorCode: "FUNCTION_DEPLOY_FAILED",
        requestId: "req-1",
      }),
    );

    expect(task.error).toEqual({
      stage: "wait-active",
      message: "函数创建失败",
      errorCode: "FUNCTION_DEPLOY_FAILED",
      requestId: "req-1",
    });
  });

  it("fails only the in-flight sub-states", () => {
    const task = makeTask("cloud");
    task.build.status = "pushing";
    task.deploy.status = "waiting-active";
    failInFlightStages(task);

    expect(task.build.status).toBe("failed");
    expect(task.deploy.status).toBe("failed");
  });

  it("leaves settled sub-states untouched when failing in-flight stages", () => {
    const task = makeTask("image");
    task.deploy.status = "succeeded";
    failInFlightStages(task);

    expect(task.build.status).toBe("skipped");
    expect(task.deploy.status).toBe("succeeded");
  });

  it("keeps the terminal and in-flight build status sets disjoint", () => {
    for (const status of IN_FLIGHT_BUILD_STATUSES) {
      expect(TERMINAL_BUILD_STATUSES.has(status)).toBe(false);
    }
  });
});
