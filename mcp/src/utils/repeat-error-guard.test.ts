import { beforeEach, describe, expect, it } from "vitest";
import {
  applyRepeatGuardToPayload,
  resetRepeatGuard,
  REPEAT_GUARD_THRESHOLD,
  __resetRepeatGuardForTests,
} from "./repeat-error-guard.js";

describe("repeat-error-guard", () => {
  beforeEach(() => {
    __resetRepeatGuardForTests();
  });

  const buildEnvRequiredPayload = () => ({
    ok: false,
    code: "ENV_REQUIRED",
    message: "当前已登录，但尚未绑定环境。重试当前工具不会成功。",
  });

  it("should not inject repeat_guard below threshold", () => {
    for (let i = 1; i < REPEAT_GUARD_THRESHOLD; i += 1) {
      const result = applyRepeatGuardToPayload(buildEnvRequiredPayload());
      expect(result.repeat_guard).toBeUndefined();
    }
  });

  it("should inject repeat_guard with consecutive count at threshold and beyond", () => {
    for (let i = 1; i < REPEAT_GUARD_THRESHOLD; i += 1) {
      applyRepeatGuardToPayload(buildEnvRequiredPayload());
    }

    const escalated = applyRepeatGuardToPayload(buildEnvRequiredPayload()) as any;
    expect(escalated.repeat_guard).toBeDefined();
    expect(escalated.repeat_guard.code).toBe("ENV_REQUIRED");
    expect(escalated.repeat_guard.consecutive_count).toBe(REPEAT_GUARD_THRESHOLD);
    expect(escalated.repeat_guard.threshold).toBe(REPEAT_GUARD_THRESHOLD);
    expect(escalated.repeat_guard.notice).toContain("停止重试");

    const again = applyRepeatGuardToPayload(buildEnvRequiredPayload()) as any;
    expect(again.repeat_guard.consecutive_count).toBe(REPEAT_GUARD_THRESHOLD + 1);
  });

  it("should not mutate the original payload when escalating", () => {
    const payload = buildEnvRequiredPayload();
    for (let i = 0; i < REPEAT_GUARD_THRESHOLD; i += 1) {
      applyRepeatGuardToPayload(payload);
    }
    expect((payload as any).repeat_guard).toBeUndefined();
  });

  it("should restart counting when a different error arrives", () => {
    for (let i = 0; i < REPEAT_GUARD_THRESHOLD; i += 1) {
      applyRepeatGuardToPayload(buildEnvRequiredPayload());
    }

    applyRepeatGuardToPayload({
      ok: false,
      code: "AUTH_REQUIRED",
      message: "当前未登录，请先调用 auth 工具完成认证。",
    });
    const restarted = applyRepeatGuardToPayload({
      ok: false,
      code: "AUTH_REQUIRED",
      message: "当前未登录，请先调用 auth 工具完成认证。",
    }) as any;
    expect(restarted.repeat_guard).toBeUndefined();
  });

  it("should treat different messages of same code as distinct errors", () => {
    applyRepeatGuardToPayload(buildEnvRequiredPayload());
    const differentMessage = applyRepeatGuardToPayload({
      ...buildEnvRequiredPayload(),
      message: "另一条不同文案",
    }) as any;
    expect(differentMessage.repeat_guard).toBeUndefined();
  });

  it("should default code to UNKNOWN when missing", () => {
    for (let i = 0; i < REPEAT_GUARD_THRESHOLD; i += 1) {
      applyRepeatGuardToPayload({ message: "no code payload" });
    }
    const escalated = applyRepeatGuardToPayload({ message: "no code payload" }) as any;
    expect(escalated.repeat_guard.code).toBe("UNKNOWN");
  });

  it("should pass through non-object payloads untouched", () => {
    const passthrough = applyRepeatGuardToPayload(null as any);
    expect(passthrough).toBeNull();
  });

  it("resetRepeatGuard should clear the streak", () => {
    for (let i = 1; i < REPEAT_GUARD_THRESHOLD; i += 1) {
      applyRepeatGuardToPayload(buildEnvRequiredPayload());
    }

    resetRepeatGuard();

    for (let i = 1; i < REPEAT_GUARD_THRESHOLD; i += 1) {
      const result = applyRepeatGuardToPayload(buildEnvRequiredPayload());
      expect(result.repeat_guard).toBeUndefined();
    }
  });

  it("long messages should be truncated in the dedup key", () => {
    const longSuffix = "x".repeat(500);
    applyRepeatGuardToPayload({
      code: "SOME_CODE",
      message: `前缀相同 ${longSuffix}A`,
    });
    // 超过截断长度的尾部差异不影响去重 key：第 3 次即视为同一错误并升级
    applyRepeatGuardToPayload({
      code: "SOME_CODE",
      message: `前缀相同 ${longSuffix}B`,
    });
    const result = applyRepeatGuardToPayload({
      code: "SOME_CODE",
      message: `前缀相同 ${longSuffix}B`,
    }) as any;
    expect(result.repeat_guard.consecutive_count).toBe(3);
  });
});
