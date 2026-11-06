import { describe, expect, it } from "vitest";
import { normalizeEnvIdValue, sanitizeCredentialEnvId } from "./env-id.js";

describe("normalizeEnvIdValue", () => {
  it("should reject values that are not a usable environment id", () => {
    expect(normalizeEnvIdValue(undefined)).toBeUndefined();
    expect(normalizeEnvIdValue(null)).toBeUndefined();
    expect(normalizeEnvIdValue(123)).toBeUndefined();
    expect(normalizeEnvIdValue("")).toBeUndefined();
    expect(normalizeEnvIdValue("   ")).toBeUndefined();
    expect(normalizeEnvIdValue("undefined")).toBeUndefined();
    expect(normalizeEnvIdValue("UNDEFINED")).toBeUndefined();
    expect(normalizeEnvIdValue(" null ")).toBeUndefined();
  });

  it("should keep a real environment id and trim it", () => {
    expect(normalizeEnvIdValue("env-abc123")).toBe("env-abc123");
    expect(normalizeEnvIdValue("  env-abc123  ")).toBe("env-abc123");
  });
});

describe("sanitizeCredentialEnvId", () => {
  it("should delete a serialized undefined envId from the credential", () => {
    const credential = { secretId: "sid", secretKey: "skey", envId: "undefined" };
    const result = sanitizeCredentialEnvId(credential);

    expect(result.secretId).toBe("sid");
    expect(result.envId).toBeUndefined();
    expect(credential.envId).toBe("undefined");
  });

  it("should return the same object when the envId is real", () => {
    const credential = { secretId: "sid", secretKey: "skey", envId: "env-abc" };
    expect(sanitizeCredentialEnvId(credential)).toBe(credential);
  });

  it("should leave credentials without an envId untouched", () => {
    const credential = { secretId: "sid", secretKey: "skey" };
    expect(sanitizeCredentialEnvId(credential)).toBe(credential);
    expect(sanitizeCredentialEnvId(null)).toBeNull();
    expect(sanitizeCredentialEnvId(undefined)).toBeUndefined();
  });
});
