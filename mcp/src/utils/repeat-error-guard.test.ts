import { beforeEach, describe, expect, it } from "vitest";
import {
  applyRepeatGuardToPayload,
  getRepeatGuardSnapshot,
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

  it("getter returns the live streak and not the error text", () => {
    applyRepeatGuardToPayload(buildEnvRequiredPayload());
    applyRepeatGuardToPayload(buildEnvRequiredPayload());
    expect(getRepeatGuardSnapshot()).toEqual({ consecutiveCount: 2 });

    resetRepeatGuard();
    expect(getRepeatGuardSnapshot()).toEqual({ consecutiveCount: 0 });
    expect(JSON.stringify(getRepeatGuardSnapshot())).not.toContain("尚未绑定环境");
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

  function serverFor(secretId: string) {
    return { cloudBaseOptions: { secretId, token: "tok", site: "domestic" } };
  }

  it("keeps credential buckets separate so tenant A does not escalate tenant B", () => {
    const tenantA = serverFor("secret-a");
    const tenantB = serverFor("secret-b");
    for (let i = 0; i < REPEAT_GUARD_THRESHOLD; i += 1) {
      applyRepeatGuardToPayload(buildEnvRequiredPayload(), tenantA);
    }
    const escalated = applyRepeatGuardToPayload(buildEnvRequiredPayload(), tenantA) as any;
    const other = applyRepeatGuardToPayload(buildEnvRequiredPayload(), tenantB) as any;
    expect(escalated.repeat_guard).toBeDefined();
    expect(other.repeat_guard).toBeUndefined();
    expect(getRepeatGuardSnapshot(tenantB).consecutiveCount).toBe(1);
  });

  it("does not let tenant B's success clear tenant A's streak", () => {
    const tenantA = serverFor("secret-a");
    const tenantB = serverFor("secret-b");
    applyRepeatGuardToPayload(buildEnvRequiredPayload(), tenantA);
    applyRepeatGuardToPayload(buildEnvRequiredPayload(), tenantA);
    resetRepeatGuard(tenantB);
    expect(getRepeatGuardSnapshot(tenantA).consecutiveCount).toBe(2);
    const escalated = applyRepeatGuardToPayload(buildEnvRequiredPayload(), tenantA) as any;
    expect(escalated.repeat_guard.consecutive_count).toBe(3);
  });

  it("counts callers with no credential in one local bucket", () => {
    const localA = {};
    const localB = {};
    applyRepeatGuardToPayload(buildEnvRequiredPayload(), localA);
    applyRepeatGuardToPayload(buildEnvRequiredPayload(), localB);
    const escalated = applyRepeatGuardToPayload(buildEnvRequiredPayload()) as any;
    expect(escalated.repeat_guard.consecutive_count).toBe(REPEAT_GUARD_THRESHOLD);
    expect(getRepeatGuardSnapshot().consecutiveCount).toBe(REPEAT_GUARD_THRESHOLD);
    resetRepeatGuard(localA);
    expect(getRepeatGuardSnapshot(localB).consecutiveCount).toBe(0);
  });
});
