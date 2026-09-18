import { describe, expect, it, vi } from "vitest";
import {
  buildCloudRunDeployNextStep,
  isValidCloudRunBuildId,
  isValidCloudRunRunId,
  waitForCloudRunDeployRegistration,
} from "./cloudrun.js";

describe("isValidCloudRunBuildId", () => {
  it("accepts positive finite numbers only", () => {
    expect(isValidCloudRunBuildId(1)).toBe(true);
    expect(isValidCloudRunBuildId(42)).toBe(true);
    expect(isValidCloudRunBuildId(0)).toBe(false);
    expect(isValidCloudRunBuildId(-1)).toBe(false);
    expect(isValidCloudRunBuildId(undefined)).toBe(false);
    expect(isValidCloudRunBuildId("12")).toBe(false);
    expect(isValidCloudRunBuildId(Number.NaN)).toBe(false);
  });
});

describe("isValidCloudRunRunId", () => {
  it("accepts non-empty strings only", () => {
    expect(isValidCloudRunRunId("run-1")).toBe(true);
    expect(isValidCloudRunRunId("  run-2  ")).toBe(true);
    expect(isValidCloudRunRunId("")).toBe(false);
    expect(isValidCloudRunRunId("   ")).toBe(false);
    expect(isValidCloudRunRunId(undefined)).toBe(false);
    expect(isValidCloudRunRunId(12)).toBe(false);
  });
});

describe("buildCloudRunDeployNextStep", () => {
  it("routes image deploy to getProcessLog when RunId is ready", () => {
    expect(
      buildCloudRunDeployNextStep({
        deployType: "image",
        serverName: "svc",
        runId: "run-abc",
        registered: true,
      }),
    ).toMatchObject({
      action: "getProcessLog",
      suggested_args: {
        action: "getProcessLog",
        detailServerName: "svc",
        runId: "run-abc",
      },
    });
  });

  it("routes image deploy without RunId to getDeployRecords", () => {
    expect(
      buildCloudRunDeployNextStep({
        deployType: "image",
        serverName: "svc",
        registered: true,
      }),
    ).toMatchObject({
      action: "getDeployRecords",
    });
  });

  it("routes source deploy to getDeployLog and mentions getProcessLog", () => {
    const step = buildCloudRunDeployNextStep({
      deployType: "source",
      serverName: "svc",
      buildId: 88,
      registered: true,
    });
    expect(step.action).toBe("getDeployLog");
    expect(step.suggested_args.buildId).toBe(88);
    expect(step.note).toMatch(/getProcessLog/);
  });
});

describe("waitForCloudRunDeployRegistration", () => {
  it("returns immediately when BuildId appears on first poll", async () => {
    const call = vi.fn().mockResolvedValue({
      Task: { Id: 7, Status: "running" },
    });
    const getDeployRecords = vi.fn().mockResolvedValue({
      DeployRecords: [{ BuildId: 1001, Status: "building" }],
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForCloudRunDeployRegistration({
      manager: { commonService: () => ({ call }) },
      cloudrunService: { getDeployRecords },
      envId: "env-test",
      serverName: "svc-a",
      maxWaitMs: 30_000,
      intervalMs: 3_000,
      sleepFn,
    });

    expect(result).toMatchObject({
      registered: true,
      timedOut: false,
      taskId: 7,
      buildId: 1001,
      taskStatus: "running",
    });
    expect(result.waitMs).toBeLessThan(1000);
    expect(sleepFn).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith({
      Action: "DescribeServerManageTask",
      Param: {
        EnvId: "env-test",
        ServerName: "svc-a",
        TaskId: 0,
      },
    });
  });

  it("image mode returns on RunId even when BuildId is 0", async () => {
    const call = vi.fn().mockResolvedValue({
      Task: { Id: 11, Status: "running" },
    });
    const getDeployRecords = vi.fn().mockResolvedValue({
      DeployRecords: [{ BuildId: 0, RunId: "run-img-9", Status: "creating" }],
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForCloudRunDeployRegistration({
      manager: { commonService: () => ({ call }) },
      cloudrunService: { getDeployRecords },
      envId: "env-test",
      serverName: "svc-img",
      mode: "image",
      maxWaitMs: 30_000,
      intervalMs: 3_000,
      sleepFn,
    });

    expect(result).toMatchObject({
      registered: true,
      timedOut: false,
      taskId: 11,
      runId: "run-img-9",
    });
    expect(result.buildId).toBeUndefined();
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it("keeps polling until BuildId > 0 even if Task.Id appears first", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ Task: { Id: 9, Status: "todo" } })
      .mockResolvedValue({ Task: { Id: 9, Status: "running" } });
    const getDeployRecords = vi
      .fn()
      .mockResolvedValueOnce({ DeployRecords: [{ BuildId: 0 }] })
      .mockResolvedValueOnce({ DeployRecords: [] })
      .mockResolvedValue({ DeployRecords: [{ BuildId: 55 }] });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForCloudRunDeployRegistration({
      manager: { commonService: () => ({ call }) },
      cloudrunService: { getDeployRecords },
      envId: "env-test",
      serverName: "svc-b",
      maxWaitMs: 20_000,
      intervalMs: 10,
      sleepFn,
    });

    expect(result.registered).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.buildId).toBe(55);
    expect(result.taskId).toBe(9);
    expect(sleepFn).toHaveBeenCalled();
    expect(getDeployRecords.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("times out with taskId when BuildId never becomes valid", async () => {
    const call = vi.fn().mockResolvedValue({
      Task: { Id: 3, Status: "running" },
    });
    const getDeployRecords = vi.fn().mockResolvedValue({
      DeployRecords: [{ BuildId: 0 }],
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForCloudRunDeployRegistration({
      manager: { commonService: () => ({ call }) },
      cloudrunService: { getDeployRecords },
      envId: "env-test",
      serverName: "svc-c",
      maxWaitMs: 25,
      intervalMs: 10,
      sleepFn,
    });

    expect(result.registered).toBe(true);
    expect(result.timedOut).toBe(true);
    expect(result.taskId).toBe(3);
    expect(result.buildId).toBeUndefined();
  });

  it("times out unregistered when neither task nor BuildId appears", async () => {
    const call = vi.fn().mockResolvedValue({ Task: {} });
    const getDeployRecords = vi.fn().mockResolvedValue({ DeployRecords: [] });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForCloudRunDeployRegistration({
      manager: { commonService: () => ({ call }) },
      cloudrunService: { getDeployRecords },
      envId: "env-test",
      serverName: "svc-d",
      maxWaitMs: 25,
      intervalMs: 10,
      sleepFn,
    });

    expect(result.registered).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.buildId).toBeUndefined();
    expect(result.taskId).toBeUndefined();
  });

  it("tolerates missing commonService / getDeployRecords and still times out safely", async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const result = await waitForCloudRunDeployRegistration({
      manager: {},
      cloudrunService: {},
      envId: "env-test",
      serverName: "svc-e",
      maxWaitMs: 20,
      intervalMs: 5,
      sleepFn,
    });
    expect(result.registered).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  // maxWaitMs: 0 is how manageCloudRun(deploy, waitRegistration=false) skips the
  // blocking wait: one probe, then return — never sleep, never hang the tool.
  it("probes exactly once and never sleeps when maxWaitMs is 0", async () => {
    const call = vi.fn().mockResolvedValue({ Task: { Id: 21, Status: "creating" } });
    const getDeployRecords = vi
      .fn()
      .mockResolvedValue({ DeployRecords: [{ BuildId: 0, Status: "creating" }] });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForCloudRunDeployRegistration({
      manager: { commonService: () => ({ call }) },
      cloudrunService: { getDeployRecords },
      envId: "env-test",
      serverName: "svc-nowait",
      maxWaitMs: 0,
      intervalMs: 3_000,
      sleepFn,
    });

    expect(result.timedOut).toBe(true);
    expect(result.buildId).toBeUndefined();
    expect(result.taskId).toBe(21);
    expect(result.taskStatus).toBe("creating");
    expect(sleepFn).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(1);
    expect(getDeployRecords).toHaveBeenCalledTimes(1);
  });

  it("still reports registered on the single probe when maxWaitMs is 0", async () => {
    const call = vi.fn().mockResolvedValue({ Task: { Id: 22, Status: "running" } });
    const getDeployRecords = vi
      .fn()
      .mockResolvedValue({ DeployRecords: [{ BuildId: 4242, Status: "building" }] });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await waitForCloudRunDeployRegistration({
      manager: { commonService: () => ({ call }) },
      cloudrunService: { getDeployRecords },
      envId: "env-test",
      serverName: "svc-nowait-hit",
      maxWaitMs: 0,
      sleepFn,
    });

    expect(result.registered).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.buildId).toBe(4242);
    expect(sleepFn).not.toHaveBeenCalled();
  });
});
