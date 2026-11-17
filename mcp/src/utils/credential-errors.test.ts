import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_EXPIRED_PATTERN,
  enhanceErrorMessage,
  findErrorGuidance,
  isCredentialExpiredError,
} from "./error-guidance.js";

describe("temporary credential failures", () => {
  it("recognizes access-layer token messages without a structured code", () => {
    const samples = [
      "Token verification failed. Please check your Token is correct.",
      "[DescribeEnvInfo] Token verification failed. Please check your Token is correct.",
      "[request id:cc76683d-592-47be-9ddb-82e0fbdfe861]tmp secret key expire",
      "[DescribeEnvs] invalid token",
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
