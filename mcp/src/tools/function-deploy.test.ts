import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IDeployProgressEvent,
  IFunctionDeployOptions,
} from "@cloudbase/manager-node/types/deploy/types.js";

import {
  cleanupFunctionDeployTasks,
  describeFunctionDeployTask,
  FUNCTION_DEPLOY_TASK_LIMITS,
  resetFunctionDeployTasks,
  serializeFunctionDeployTask,
  startFunctionDeployTask,
  type FunctionDeployManager,
  type FunctionDeployTask,
} from "./function-deploy.js";
import type { FunctionDeployConfigInput } from "./function-deploy-schema.js";

const cloudInput = {
  name: "hello-world",
  type: "HTTP",
  buildStrategy: "cloud",
  imageConfig: {
    imageType: "personal",
    build: { cwd: "/workspace/functions/hello-world" },
  },
} as unknown as FunctionDeployConfigInput;

const localInput = {
  ...cloudInput,
  buildStrategy: "local",
} as unknown as FunctionDeployConfigInput;

const imageInput = {
  name: "hello-world",
  type: "HTTP",
  buildStrategy: "image",
  imageConfig: {
    imageType: "personal",
    imageUri: "ccr.ccs.tencentyun.com/demo/hello-world:v1",
  },
} as unknown as FunctionDeployConfigInput;

function createManager(
  deployFunction: (
    config: unknown,
    options: IFunctionDeployOptions,
  ) => Promise<any>,
  ready = true,
): FunctionDeployManager {
  return {
    functionDeployer: {
      checkConfig: () => ({ ready, checks: [] }),
      deployFunction: deployFunction as FunctionDeployManager["functionDeployer"]["deployFunction"],
    },
  };
}

function deployResult(overrides: Record<string, unknown> = {}) {
  return {
    functionName: "hello-world",
    functionType: "HTTP",
    requestedStrategy: "cloud",
    effectiveStrategy: "cloud",
    action: "update",
    operations: ["update-code"],
    dryRun: false,
    imageUri: "ccr.ccs.tencentyun.com/demo/hello-world:v1",
    imageDigest: "sha256:abc",
    buildId: "123456",
    gatewayUrl: "https://example.com/hello-world",
    public: true,
    elapsedTime: 1000,
    steps: [],
    warnings: [],
    plan: {},
    ...overrides,
  };
}

function progress(
  stage: IDeployProgressEvent["stage"],
  status: IDeployProgressEvent["status"],
  extra: Partial<IDeployProgressEvent> = {},
): IDeployProgressEvent {
  return { stage, status, ...extra };
}

function makeTask(
  strategy: FunctionDeployTask["requestedStrategy"],
): FunctionDeployTask {
  const now = new Date().toISOString();
  return {
    taskId: "task-1",
    functionName: "hello-world",
    requestedStrategy: strategy,
    status: "running",
    createdAt: now,
    lastAccessAt: now,
    build: { strategy, status: strategy === "image" ? "skipped" : "queued" },
    deploy: { status: "pending" },
    progress: [],
  };
}

describe("function deploy task cache", () => {
  beforeEach(() => {
    resetFunctionDeployTasks();
  });

  afterEach(() => {
    resetFunctionDeployTasks();
    vi.useRealTimers();
  });

  it("records cloud build and deploy sub-states from progress events", async () => {
    let emit: ((event: IDeployProgressEvent) => void) | undefined;
    let resolveDeploy: ((value: unknown) => void) | undefined;
    const manager = createManager((_config, options) => {
      emit = options.onProgress;
      return new Promise((resolve) => {
        resolveDeploy = resolve;
      });
    });

    const task = startFunctionDeployTask(manager, cloudInput, {
      dryRun: false,
      autoGrant: false,
    });

    expect(task.status).toBe("running");
    expect(task.build).toMatchObject({ strategy: "cloud", status: "queued" });
    expect(task.deploy.status).toBe("pending");

    await Promise.resolve();

    emit?.(progress("build", "start"));
    expect(task.build.status).toBe("building");

    emit?.(progress("build", "success", { elapsedTime: 182000 }));
    expect(task.build.status).toBe("succeeded");

    emit?.(progress("deploy-function", "start"));
    expect(task.deploy.status).toBe("deploying");

    emit?.(progress("wait-active", "start"));
    expect(task.deploy.status).toBe("waiting-active");
    // 等待 Active 期间不能被解读为部署完成
    expect(serializeFunctionDeployTask(task).result).toBeNull();
    expect(describeFunctionDeployTask(task)).toContain("等待 Active");

    resolveDeploy?.(deployResult());
    await new Promise((resolve) => setImmediate(resolve));

    expect(task.status).toBe("succeeded");
    expect(task.build).toMatchObject({
      status: "succeeded",
      buildId: "123456",
      imageUri: "ccr.ccs.tencentyun.com/demo/hello-world:v1",
      imageDigest: "sha256:abc",
    });
    expect(task.deploy).toMatchObject({
      status: "succeeded",
      action: "update",
      functionStatus: "Active",
    });
    expect(task.finishedAt).toEqual(expect.any(String));
  });

  it("keeps local build in pushing state until push succeeds and never fakes a cloud buildId", async () => {
    let emit: ((event: IDeployProgressEvent) => void) | undefined;
    let resolveDeploy: ((value: unknown) => void) | undefined;
    const manager = createManager((_config, options) => {
      emit = options.onProgress;
      return new Promise((resolve) => {
        resolveDeploy = resolve;
      });
    });

    const task = startFunctionDeployTask(manager, localInput, {
      dryRun: false,
      autoGrant: false,
    });
    expect(task.build.localBuildId).toMatch(/^local-build-/);

    await Promise.resolve();

    emit?.(progress("build", "start"));
    emit?.(progress("build", "success"));
    expect(task.build.status).toBe("building");

    emit?.(progress("push", "start"));
    expect(task.build.status).toBe("pushing");
    emit?.(progress("push", "success"));
    expect(task.build.status).toBe("succeeded");

    resolveDeploy?.(
      deployResult({
        requestedStrategy: "local",
        effectiveStrategy: "local",
        buildId: undefined,
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(task.status).toBe("succeeded");
    expect(task.build.buildId).toBeUndefined();
    expect(task.build.localBuildId).toMatch(/^local-build-/);
  });

  it("marks build as skipped for an existing image", async () => {
    const manager = createManager(async () =>
      deployResult({
        requestedStrategy: "image",
        effectiveStrategy: "image",
        buildId: undefined,
      }),
    );

    const task = startFunctionDeployTask(manager, imageInput, {
      dryRun: false,
      autoGrant: false,
    });
    expect(task.build.status).toBe("skipped");

    await new Promise((resolve) => setImmediate(resolve));
    expect(task.status).toBe("succeeded");
    expect(task.build.status).toBe("skipped");
    expect(task.build.imageUri).toBe("ccr.ccs.tencentyun.com/demo/hello-world:v1");
  });

  it("records the failing stage when deployment throws", async () => {
    const error = Object.assign(new Error("云函数创建失败"), {
      requestId: "req-1",
      code: "FUNCTION_DEPLOY_FAILED",
    });
    const manager = createManager(async (_config, options) => {
      options.onProgress?.(progress("wait-active", "start"));
      options.onProgress?.(
        progress("wait-active", "failed", {
          message: "云函数创建失败",
          errorCode: "FUNCTION_DEPLOY_FAILED",
          requestId: "req-1",
        }),
      );
      throw error;
    });

    const task = startFunctionDeployTask(manager, cloudInput, {
      dryRun: false,
      autoGrant: false,
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(task.status).toBe("failed");
    expect(task.deploy.status).toBe("failed");
    expect(task.error).toMatchObject({
      stage: "wait-active",
      message: "云函数创建失败",
      errorCode: "FUNCTION_DEPLOY_FAILED",
      requestId: "req-1",
    });
    expect(serializeFunctionDeployTask(task).result).toBeNull();
  });

  it("fails the task with CONFIG_INVALID when checkConfig is not ready", async () => {
    const manager = createManager(async () => deployResult(), false);

    const task = startFunctionDeployTask(manager, cloudInput, {
      dryRun: false,
      autoGrant: false,
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(task.status).toBe("failed");
    expect(task.error).toMatchObject({
      stage: "validate",
      errorCode: "CONFIG_INVALID",
    });
  });

  it("does not overwrite an expired task when the deployment later settles", async () => {
    let resolveDeploy: ((value: unknown) => void) | undefined;
    const manager = createManager(
      () =>
        new Promise((resolve) => {
          resolveDeploy = resolve;
        }),
    );
    const task = startFunctionDeployTask(manager, cloudInput, {
      dryRun: false,
      autoGrant: false,
    });
    cleanupFunctionDeployTasks(
      Date.parse(task.createdAt) + FUNCTION_DEPLOY_TASK_LIMITS.maxAgeMs + 1_000,
    );
    expect(task.status).toBe("expired");

    resolveDeploy?.(deployResult());
    await new Promise((resolve) => setImmediate(resolve));

    expect(task.status).toBe("expired");
    expect(task.result).not.toBeNull();
  });

  it("creates the task already running with startedAt recorded", () => {
    const manager = createManager(() => new Promise(() => undefined));
    const task = startFunctionDeployTask(manager, cloudInput, {
      dryRun: false,
      autoGrant: false,
    });

    expect(task.status).toBe("running");
    expect(task.startedAt).toEqual(expect.any(String));
    expect(task.finishedAt).toBeUndefined();
  });

  it("keeps the stage and requestId from progress when the thrown error omits them", async () => {
    const manager = createManager(async (_config, options) => {
      options.onProgress?.(
        progress("wait-active", "failed", {
          message: "函数进入 CreateFailed",
          requestId: "req-9",
        }),
      );
      throw new Error("deploy aborted");
    });

    const task = startFunctionDeployTask(manager, cloudInput, {
      dryRun: false,
      autoGrant: false,
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(task.error).toMatchObject({
      stage: "wait-active",
      message: "deploy aborted",
      requestId: "req-9",
    });
    // 两侧都没有 errorCode 时不应留下 { errorCode: undefined } 噪声字段
    expect(task.error).not.toHaveProperty("errorCode");
  });

  it("forwards progress events to the caller-supplied onProgress", async () => {
    const seen: string[] = [];
    const manager = createManager(async (_config, options) => {
      options.onProgress?.(progress("build", "start"));
      options.onProgress?.(progress("build", "success"));
      return deployResult();
    });

    const task = startFunctionDeployTask(manager, cloudInput, {
      dryRun: false,
      autoGrant: false,
      onProgress: (event) => seen.push(`${event.stage}:${event.status}`),
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen).toEqual(["build:start", "build:success"]);
    // 事件只在任务上留一份，不产生第二份副本
    expect(task.progress).toHaveLength(2);
  });

  it("serializes a fixed view shape with null result and error while running", () => {
    const task = makeTask("cloud");
    const view = serializeFunctionDeployTask(task);

    expect(Object.keys(view).sort()).toEqual(
      [
        "build",
        "createdAt",
        "deploy",
        "error",
        "finishedAt",
        "functionName",
        "lastAccessAt",
        "progress",
        "requestedStrategy",
        "result",
        "startedAt",
        "status",
        "taskId",
      ].sort(),
    );
    expect(view.result).toBeNull();
    expect(view.error).toBeNull();
    expect(view.finishedAt).toBeNull();
    expect(view.startedAt).toBeNull();
  });

  it("describes an expired task as needing cloud-side confirmation", () => {
    const task: FunctionDeployTask = { ...makeTask("cloud"), status: "expired" };
    const message = describeFunctionDeployTask(task);
    expect(message).toContain("已过期");
    expect(message).toContain("getFunctionDetail");
  });
});
