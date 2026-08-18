import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FUNCTION_BUSY_STATUSES,
  FUNCTION_UPDATING_ERROR_CODE,
  FUNCTION_UPDATING_RETRY_AFTER_SECONDS,
  buildFunctionUpdatingPayload,
  functionUpdatingRuntime,
  isFunctionBusyStatus,
  isFunctionUpdatingError,
  waitUntilFunctionActive,
} from "./function-updating.js";

describe("function updating helpers", () => {
  const originalSleep = functionUpdatingRuntime.sleep;

  afterEach(() => {
    functionUpdatingRuntime.sleep = originalSleep;
  });

  it("detects the SCF UpdateFunctionConfiguration Updating copy from beacons", () => {
    expect(
      isFunctionUpdatingError(
        new Error("[scf/UpdateFunctionConfiguration] 当前函数处于 Updating"),
      ),
    ).toBe(true);
    expect(
      isFunctionUpdatingError("[scf/UpdateFunctionCode] 当前函数处于 Updating"),
    ).toBe(true);
    expect(
      isFunctionUpdatingError("ResourceInUse: function is currently updating"),
    ).toBe(true);
    expect(isFunctionUpdatingError("函数状态异常，检查超时")).toBe(true);
  });

  it("does not treat unrelated SCF errors as Updating", () => {
    expect(isFunctionUpdatingError("Function not found")).toBe(false);
    expect(isFunctionUpdatingError("invalid parameter value")).toBe(false);
    expect(isFunctionUpdatingError("依赖安装失败")).toBe(false);
  });

  it("treats Creating/Updating/Publishing/Deleting as busy", () => {
    for (const status of FUNCTION_BUSY_STATUSES) {
      expect(isFunctionBusyStatus(status)).toBe(true);
    }
    expect(isFunctionBusyStatus("Active")).toBe(false);
    expect(isFunctionBusyStatus("UpdateFailed")).toBe(false);
    expect(isFunctionBusyStatus(undefined)).toBe(false);
  });

  it("builds a guided payload with retryAfterSeconds and executable nextActions", () => {
    const payload = buildFunctionUpdatingPayload({
      action: "updateFunctionConfig",
      functionName: "hello",
      status: "Updating",
      rawMessage: "[scf/UpdateFunctionConfiguration] 当前函数处于 Updating",
    });

    expect(payload.success).toBe(false);
    expect(payload.errorCode).toBe(FUNCTION_UPDATING_ERROR_CODE);
    expect(payload.retryAfterSeconds).toBe(FUNCTION_UPDATING_RETRY_AFTER_SECONDS);
    expect(payload.message).toContain("不要立即重试");
    expect(payload.message).toContain("getFunctionDetail");
    expect(payload.message).toContain("当前函数处于 Updating");
    expect(payload.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "queryFunctions",
          action: "getFunctionDetail",
          suggested_args: expect.objectContaining({
            functionName: "hello",
          }),
        }),
        expect.objectContaining({
          tool: "manageFunctions",
          action: "updateFunctionConfig",
        }),
      ]),
    );
  });

  it("returns immediately when initial Status is already Active", async () => {
    const getStatus = vi.fn();
    const result = await waitUntilFunctionActive(getStatus, {
      initialStatus: "Active",
    });
    expect(result).toEqual({
      ready: true,
      status: "Active",
      attempts: 0,
      timedOut: false,
    });
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("polls until Status leaves Updating, with a sleep between attempts", async () => {
    const sleep = vi.fn(async () => undefined);
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce("Updating")
      .mockResolvedValueOnce("Updating")
      .mockResolvedValueOnce("Active");

    const result = await waitUntilFunctionActive(getStatus, {
      initialStatus: "Updating",
      intervalMs: 50,
      maxAttempts: 5,
      timeoutMs: 1000,
      sleep,
    });

    expect(result.ready).toBe(true);
    expect(result.status).toBe("Active");
    expect(result.attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);
  });

  it("stops at maxAttempts without spinning forever", async () => {
    const sleep = vi.fn(async () => undefined);
    const getStatus = vi.fn().mockResolvedValue("Updating");

    const result = await waitUntilFunctionActive(getStatus, {
      initialStatus: "Updating",
      intervalMs: 10,
      maxAttempts: 3,
      timeoutMs: 10_000,
      sleep,
    });

    expect(result.ready).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.timedOut).toBe(false);
    expect(getStatus).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("honors timeoutMs and does not start another poll after the deadline", async () => {
    let now = 0;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const getStatus = vi.fn().mockResolvedValue("Updating");

    const result = await waitUntilFunctionActive(getStatus, {
      initialStatus: "Updating",
      intervalMs: 100,
      maxAttempts: 50,
      timeoutMs: 250,
      sleep,
      now: () => now,
    });

    expect(result.ready).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.attempts).toBeLessThanOrEqual(3);
    expect(getStatus.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
