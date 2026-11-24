import { describe, expect, it } from "vitest";
import {
  ALL_ERROR_CODES,
  ERROR_CATEGORIES,
  ERROR_CODES,
  STATUS_CODES,
  getErrorCategory,
  isActionRequired,
  type ErrorEntry,
} from "./error-codes.js";

const entries = Object.entries(ERROR_CODES) as [string, ErrorEntry][];
const statusNames = Object.keys(STATUS_CODES);

describe("error code registry", () => {
  it("registers codes without duplicate keys or overlap with status values", () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(statusNames.length).toBeGreaterThan(0);
    expect(new Set(ALL_ERROR_CODES).size).toBe(entries.length);
    expect(ALL_ERROR_CODES.length).toBe(entries.length);
    expect(new Set(statusNames).size).toBe(statusNames.length);
    for (const code of ALL_ERROR_CODES) {
      expect(statusNames).not.toContain(code);
    }
  });

  it("keeps every entry inside the declared vocabulary", () => {
    for (const [code, entry] of entries) {
      expect(ERROR_CATEGORIES).toContain(entry.category);
      expect(["self", "cloud_api"]).toContain(entry.origin);
      expect(["legacy", "next"]).toContain(entry.since);
      expect(entry.note.length).toBeGreaterThan(0);
      if (entry.origin === "self") {
        expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    }
  });

  it("keeps success and intermediate states out of the error surface", () => {
    for (const code of ["AUTH_READY", "ENV_CREATED", "STATUS", "NO_CHANGE"]) {
      expect(statusNames).toContain(code);
      expect(getErrorCategory(code)).toBeUndefined();
      expect(isActionRequired(code)).toBe(false);
    }
  });

  it("classifies representative codes for aggregation", () => {
    expect(getErrorCategory("ACTION_NOT_GRANTED")).toBe("permission");
    expect(getErrorCategory("SQL_REQUIRED")).toBe("invalid_argument");
    expect(getErrorCategory("OBJECT_NOT_FOUND")).toBe("not_found");
    expect(getErrorCategory("PG_NOT_READY")).toBe("precondition");
    expect(getErrorCategory("MIGRATION_TASK_TIMEOUT")).toBe("unavailable");
    expect(getErrorCategory("INTERNAL_ERROR")).toBe("internal");
    expect(getErrorCategory("NOT_REGISTERED_CODE")).toBeUndefined();
  });

  it("separates user-action prompts from failures", () => {
    for (const code of [
      "CONFIRM_REQUIRED",
      "REALTIME_CONFIRM_REQUIRED",
      "AUTH_REQUIRED",
      "LOG_SERVICE_NOT_ENABLED",
    ]) {
      expect(isActionRequired(code)).toBe(true);
    }
    expect(isActionRequired("ACTION_NOT_GRANTED")).toBe(false);
    expect(isActionRequired("DEPLOY_FAILED")).toBe(false);
    expect(isActionRequired("NOT_REGISTERED_CODE")).toBe(false);
  });

  it("keeps upstream cloud API codes verbatim", () => {
    const cloudCodes = entries.filter(([, entry]) => entry.origin === "cloud_api").map(([code]) => code);
    expect(cloudCodes).toContain("FailedOperation.PGConnectError");
    expect(cloudCodes).toContain("InvalidParameter.Cls");
    expect(cloudCodes).toContain("EXCEED_REQUEST_LIMIT");
    expect(cloudCodes).toContain("InsufficientBalance");
  });

  it("marks the first newly registered code as next", () => {
    expect(ERROR_CODES.ACTION_NOT_GRANTED.since).toBe("next");
    expect(ERROR_CODES.ACTION_NOT_GRANTED.category).toBe("permission");
  });
});
