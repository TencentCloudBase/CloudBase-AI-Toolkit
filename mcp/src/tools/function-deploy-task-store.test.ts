import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupFunctionDeployTasks,
  createFunctionDeployTask,
  DEPLOY_TASK_EXPIRED_ERROR_CODE,
  FUNCTION_DEPLOY_TASK_LIMITS,
  getFunctionDeployTask,
  getFunctionDeployTaskCount,
  isTerminalFunctionDeployStatus,
  resetFunctionDeployTasks,
  settleFunctionDeployTask,
} from "./function-deploy-task-store.js";
import type { FunctionDeployConfigInput } from "./function-deploy-schema.js";

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock("../utils/logger.js", () => ({
  warn: mockWarn,
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

/**
 * 缓存模块不依赖 manager-node：这里只用配置入参和注入的时间戳，
 * 不构造任何 SDK mock。
 */
const ENV_ID = "envA-test";
const OTHER_ENV_ID = "envB-other";

function makeInput(
  buildStrategy: "cloud" | "local" | "image" = "cloud",
): FunctionDeployConfigInput {
  return {
    name: "hello-world",
    type: "HTTP",
    buildStrategy,
    imageConfig:
      buildStrategy === "image"
        ? { imageType: "personal", imageUri: "ccr.ccs.tencentyun.com/d/f:v1" }
        : { imageType: "personal", build: { cwd: "/workspace/fn" } },
  } as unknown as FunctionDeployConfigInput;
}

describe("function deploy task store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFunctionDeployTasks();
  });

  afterEach(() => {
    resetFunctionDeployTasks();
  });

  it("creates a task that is already running with matching timestamps", () => {
    const now = Date.parse("2026-09-03T10:00:00.000Z");
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);

    expect(task.status).toBe("running");
    expect(task.createdAt).toBe("2026-09-03T10:00:00.000Z");
    expect(task.startedAt).toBe("2026-09-03T10:00:00.000Z");
    expect(task.lastAccessAt).toBe("2026-09-03T10:00:00.000Z");
    expect(task.finishedAt).toBeUndefined();
    expect(task.result).toBeUndefined();
    expect(task.error).toBeUndefined();
  });

  it("starts a cloud build in the queued sub-state", () => {
    const task = createFunctionDeployTask(makeInput("cloud"), ENV_ID);
    expect(task.build).toEqual({ strategy: "cloud", status: "queued" });
  });

  it("issues a local build identifier that is not a cloud buildId", () => {
    const task = createFunctionDeployTask(makeInput("local"), ENV_ID);

    expect(task.build.status).toBe("queued");
    expect(task.build.localBuildId).toMatch(/^local-build-/);
    expect(task.build.buildId).toBeUndefined();
  });

  it("skips the build sub-state for an existing image", () => {
    const task = createFunctionDeployTask(makeInput("image"), ENV_ID);
    expect(task.build.status).toBe("skipped");
    expect(task.build.localBuildId).toBeUndefined();
  });

  it("treats only settled statuses as terminal", () => {
    expect(isTerminalFunctionDeployStatus("running")).toBe(false);
    expect(isTerminalFunctionDeployStatus("succeeded")).toBe(true);
    expect(isTerminalFunctionDeployStatus("failed")).toBe(true);
    expect(isTerminalFunctionDeployStatus("expired")).toBe(true);
  });

  it("refreshes lastAccessAt on each read", () => {
    const now = Date.parse("2026-09-03T10:00:00.000Z");
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);

    const found = getFunctionDeployTask(task.taskId, ENV_ID, now + 90_000);
    expect(found?.lastAccessAt).toBe(new Date(now + 90_000).toISOString());
  });

  it("returns undefined for an unknown taskId", () => {
    expect(getFunctionDeployTask("missing", ENV_ID)).toBeUndefined();
  });

  it("records the owning envId on the task", () => {
    const task = createFunctionDeployTask(makeInput(), ENV_ID);
    expect(task.envId).toBe(ENV_ID);
  });

  it("hides a task from another environment even with a valid taskId", () => {
    const task = createFunctionDeployTask(makeInput(), ENV_ID);

    // 任务表是进程内全局 Map；hosted 形态下同一进程服务多个租户，
    // 仅凭 taskId 不足以授权读取 functionName / imageUri / gatewayUrl
    expect(getFunctionDeployTask(task.taskId, OTHER_ENV_ID)).toBeUndefined();
    expect(getFunctionDeployTask(task.taskId, ENV_ID)).toBeDefined();
  });

  it("does not refresh lastAccessAt on a cross-environment read", () => {
    const now = Date.parse("2026-09-03T10:00:00.000Z");
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);

    getFunctionDeployTask(task.taskId, OTHER_ENV_ID, now + 90_000);

    // task 与缓存中的对象是同一引用，可直接断言：
    // 越权读取不应刷新生命周期，否则可以被用来无限续期别人的任务
    expect(task.lastAccessAt).toBe(new Date(now).toISOString());
  });

  it("removes a terminal task once the terminal TTL elapses", () => {
    const now = Date.now();
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);
    settleFunctionDeployTask(task, "succeeded", now);

    const beforeTtl = now + FUNCTION_DEPLOY_TASK_LIMITS.terminalTtlMs - 1_000;
    expect(getFunctionDeployTask(task.taskId, ENV_ID, beforeTtl)).toBeDefined();

    const result = cleanupFunctionDeployTasks(
      now + FUNCTION_DEPLOY_TASK_LIMITS.terminalTtlMs + 1_000,
    );
    expect(result).toEqual({ removed: 1, expired: 0 });
    expect(getFunctionDeployTaskCount()).toBe(0);
  });

  it("removes a terminal task that has not been read within the idle TTL", () => {
    const now = Date.now();
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);
    settleFunctionDeployTask(task, "failed", now);

    cleanupFunctionDeployTasks(now + FUNCTION_DEPLOY_TASK_LIMITS.idleTtlMs + 1_000);
    expect(getFunctionDeployTaskCount()).toBe(0);
  });

  it("does not let repeated reads keep a terminal task alive forever", () => {
    const now = Date.now();
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);
    settleFunctionDeployTask(task, "succeeded", now);

    // 反复访问会刷新 lastAccessAt，但终态 TTL 以 finishedAt 为准，不受影响
    for (let minute = 5; minute <= 25; minute += 5) {
      expect(getFunctionDeployTask(task.taskId, ENV_ID, now + minute * 60_000)).toBeDefined();
    }

    expect(
      getFunctionDeployTask(
        task.taskId,
        ENV_ID,
        now + FUNCTION_DEPLOY_TASK_LIMITS.terminalTtlMs + 1_000,
      ),
    ).toBeUndefined();
    expect(getFunctionDeployTaskCount()).toBe(0);
  });

  it("never deletes a running task, only expires it past the max age", () => {
    const now = Date.now();
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);

    const withinAge = cleanupFunctionDeployTasks(
      now + FUNCTION_DEPLOY_TASK_LIMITS.idleTtlMs + 60_000,
    );
    expect(withinAge).toEqual({ removed: 0, expired: 0 });
    expect(task.status).toBe("running");

    const pastAge = cleanupFunctionDeployTasks(
      now + FUNCTION_DEPLOY_TASK_LIMITS.maxAgeMs + 1_000,
    );
    expect(pastAge).toEqual({ removed: 0, expired: 1 });
    expect(task.status).toBe("expired");
    expect(getFunctionDeployTaskCount()).toBe(1);
  });

  it("records an expiry reason that points at cloud-side verification", () => {
    const now = Date.now();
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);
    cleanupFunctionDeployTasks(now + FUNCTION_DEPLOY_TASK_LIMITS.maxAgeMs + 1_000);

    expect(task.error).toMatchObject({ errorCode: DEPLOY_TASK_EXPIRED_ERROR_CODE });
    expect(task.error?.message).toContain("getFunctionDetail");
  });

  it("keeps an earlier failure reason when a task later expires", () => {
    const now = Date.now();
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);
    task.error = { stage: "build", message: "docker build 失败" };

    cleanupFunctionDeployTasks(now + FUNCTION_DEPLOY_TASK_LIMITS.maxAgeMs + 1_000);
    expect(task.error).toEqual({ stage: "build", message: "docker build 失败" });
  });

  it("fails in-flight sub-states when expiring a task", () => {
    const now = Date.now();
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);
    task.build.status = "pushing";
    task.deploy.status = "waiting-active";

    cleanupFunctionDeployTasks(now + FUNCTION_DEPLOY_TASK_LIMITS.maxAgeMs + 1_000);
    expect(task.build.status).toBe("failed");
    expect(task.deploy.status).toBe("failed");
  });

  it("does not let a settle call overwrite an expired task", () => {
    const now = Date.now();
    const task = createFunctionDeployTask(makeInput(), ENV_ID, now);
    cleanupFunctionDeployTasks(now + FUNCTION_DEPLOY_TASK_LIMITS.maxAgeMs + 1_000);
    const expiredAt = task.finishedAt;

    settleFunctionDeployTask(task, "succeeded", Date.now());

    expect(task.status).toBe("expired");
    expect(task.finishedAt).toBe(expiredAt);
  });

  it("evicts the oldest terminal task when the limit is reached", () => {
    const base = Date.now();
    const settled = [];
    for (let index = 0; index < FUNCTION_DEPLOY_TASK_LIMITS.maxTasks; index += 1) {
      const task = createFunctionDeployTask(makeInput(), ENV_ID, base + index);
      settleFunctionDeployTask(task, "succeeded", base + index);
      settled.push(task);
    }
    expect(getFunctionDeployTaskCount()).toBe(FUNCTION_DEPLOY_TASK_LIMITS.maxTasks);

    createFunctionDeployTask(makeInput(), ENV_ID, base + FUNCTION_DEPLOY_TASK_LIMITS.maxTasks);

    expect(getFunctionDeployTaskCount()).toBe(FUNCTION_DEPLOY_TASK_LIMITS.maxTasks);
    // 最旧的终态任务被淘汰
    expect(getFunctionDeployTaskCount()).toBeGreaterThan(0);
    expect(
      getFunctionDeployTask(settled[0].taskId, ENV_ID, base + FUNCTION_DEPLOY_TASK_LIMITS.maxTasks),
    ).toBeUndefined();
  });

  it("exceeds the limit rather than dropping running deployments, and warns once", () => {
    const base = Date.now();
    const overflow = FUNCTION_DEPLOY_TASK_LIMITS.maxTasks + 2;
    for (let index = 0; index < overflow; index += 1) {
      createFunctionDeployTask(makeInput(), ENV_ID, base + index);
    }

    expect(getFunctionDeployTaskCount()).toBe(overflow);
    expect(mockWarn).toHaveBeenCalled();
    expect(mockWarn.mock.calls[0][0]).toContain("上限");
  });

  it("stops tracking anything after a reset", () => {
    createFunctionDeployTask(makeInput(), ENV_ID);
    expect(getFunctionDeployTaskCount()).toBe(1);

    resetFunctionDeployTasks();
    expect(getFunctionDeployTaskCount()).toBe(0);
  });
});
