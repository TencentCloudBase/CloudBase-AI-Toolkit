import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_EXPIRED_PATTERN,
  CREDENTIAL_SCOPE_LIMITED_PATTERN,
  enhanceErrorMessage,
  findErrorGuidance,
  isCredentialExpiredError,
  isCredentialScopeLimitedError,
} from "./error-guidance.js";

describe("temporary credential failures", () => {
  it("recognizes access-layer token messages without a structured code", () => {
    const samples = [
      "Token verification failed. Please check your Token is correct.",
      "[DescribeEnvInfo] Token verification failed. Please check your Token is correct.",
      "[request id:cc76683d-592-47be-9ddb-82e0fbdfe861]tmp secret key expire",
      "Token验证失败，请检查您的Token是否正确。",
    ];
    for (const message of samples) {
      expect(isCredentialExpiredError(new Error(message))).toBe(true);
    }
  });

  it("recognizes structured expiration codes", () => {
    expect(
      isCredentialExpiredError(
        Object.assign(new Error("request rejected"), { code: "AuthFailure.TokenFailure" }),
      ),
    ).toBe(true);
    expect(
      isCredentialExpiredError(
        Object.assign(new Error("request rejected"), { code: "11014" }),
      ),
    ).toBe(true);
  });

  it("does not classify unrelated failures as credential expiration", () => {
    expect(isCredentialExpiredError(new Error("Connection timeout"))).toBe(false);
    expect(isCredentialExpiredError(new Error("PG instance not found"))).toBe(false);
    expect(
      isCredentialExpiredError(
        Object.assign(new Error("request rejected"), { code: "UnauthorizedOperation" }),
      ),
    ).toBe(false);
  });

  it("provides guidance when the cloud returns no Code", () => {
    const error = new Error("Token verification failed. Please check your Token is correct.");
    const guidance = findErrorGuidance(error);
    expect(guidance?.code).toBe("AuthFailure.TokenFailure");
    expect(guidance?.summary).toContain("不要解绑重连");
    expect(enhanceErrorMessage(error, error.message)).toContain("临时密钥已过期");
  });

  it("keeps Code-based guidance ahead of the message fallback", () => {
    const error = Object.assign(new Error("write request overrun"), {
      code: "EXCEED_REQUEST_LIMIT",
    });
    expect(findErrorGuidance(error)?.summary).toContain("数据库写入配额");
  });

  it("does not guess guidance for an unknown message", () => {
    expect(findErrorGuidance(new Error("some unrelated backend error"))).toBeNull();
  });

  it("keeps the pattern scoped to authentication phrases", () => {
    expect(CREDENTIAL_EXPIRED_PATTERN.test("Token verification failed")).toBe(true);
    expect(CREDENTIAL_EXPIRED_PATTERN.test("token bucket is empty")).toBe(false);
  });
});

describe("access-layer error codes and message scope", () => {
  it("recognizes eCode 213 and nested upstream codes", () => {
    expect(isCredentialExpiredError({ eCode: 213 } as unknown)).toBe(true);
    expect(isCredentialExpiredError({ Response: { Error: { Code: "11014" } } } as unknown)).toBe(true);
    expect(isCredentialExpiredError({ meta: { upstreamCode: "11014" } } as unknown)).toBe(true);
    expect(isCredentialExpiredError({ original: { Code: "AuthFailure.TokenFailure" } } as unknown)).toBe(true);
  });

  it("does not let a non-auth code borrow a token phrase", () => {
    const error = Object.assign(new Error("Token verification failed"), {
      code: "EXCEED_REQUEST_LIMIT",
    });
    expect(isCredentialExpiredError(error)).toBe(false);
    expect(findErrorGuidance(error)?.code).toBe("EXCEED_REQUEST_LIMIT");
  });

  it("does not match token phrases used as ordinary configuration text", () => {
    expect(isCredentialExpiredError(new Error("invalid token bucket config"))).toBe(false);
    expect(isCredentialScopeLimitedError(new Error("invalid token bucket config"))).toBe(false);
  });
});

describe("credential scope boundary (invalid token)", () => {
  it("classifies account-level rejection as a scope boundary, not an expired token", () => {
    const samples = [
      "[tcb/DescribeEnvs] [request id:0]invalid token",
      "[DescribeVpcs] [request id:17f4580c-a94d-407e-900d-854c44b88af2]invalid token",
      "[queryEnv/list] [DescribeEnvs] [request id:0]invalid token",
      "[DescribeCertificates] `[request id:149838507]invalid token`",
    ];
    for (const message of samples) {
      const error = new Error(message);
      expect(isCredentialExpiredError(error)).toBe(false);
      expect(isCredentialScopeLimitedError(error)).toBe(true);
    }
  });

  it("gives action-oriented guidance instead of a retry hint", () => {
    const error = new Error("[DescribeEnvs] invalid token");
    const guidance = findErrorGuidance(error);
    expect(guidance?.code).toBe("AuthFailure.UnauthorizedOperation");
    expect(guidance?.summary).toContain("凭据权限边界");
    expect(guidance?.summary).toContain("重试同一请求都不会成功");
    expect(guidance?.summary).not.toContain("临时密钥已过期：这是短期凭据到期");
    expect(enhanceErrorMessage(error, error.message)).toContain("改用带 EnvId 的接口");
  });

  it("lets an explicit expiration signal win over an invalid-token phrase", () => {
    const mixed = new Error("invalid token; AuthServer 11014 tmp secret key expire");
    expect(isCredentialExpiredError(mixed)).toBe(true);
    expect(isCredentialScopeLimitedError(mixed)).toBe(false);

    const coded = Object.assign(new Error("invalid token"), {
      code: "AuthFailure.TokenFailure",
    });
    expect(isCredentialExpiredError(coded)).toBe(true);
    expect(isCredentialScopeLimitedError(coded)).toBe(false);
  });

  it("keeps the structured non-auth code short-circuit", () => {
    const error = Object.assign(new Error("invalid token"), {
      code: "EXCEED_REQUEST_LIMIT",
    });
    expect(isCredentialExpiredError(error)).toBe(false);
    expect(isCredentialScopeLimitedError(error)).toBe(false);
  });

  it("keeps the pattern scoped to the gateway phrase", () => {
    expect(CREDENTIAL_EXPIRED_PATTERN.test("invalid token")).toBe(false);
    expect(CREDENTIAL_SCOPE_LIMITED_PATTERN.test("invalid token")).toBe(true);
    expect(CREDENTIAL_SCOPE_LIMITED_PATTERN.test("token bucket is empty")).toBe(false);
  });
});
