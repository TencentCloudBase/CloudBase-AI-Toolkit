import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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
const registered = new Set([...ALL_ERROR_CODES, ...statusNames]);

const EXTERNAL = new Set([
  "ENOTFOUND", "ENOENT", "ETIMEDOUT", "EACCES", "SIGINT", "SIGTERM",
]);
const NOT_A_CODE = new Set([
  "FAILED", "SUCCEED", "SUCCESS", "READY", "PENDING", "ACTIVE", "AVAILABLE",
  "NORMAL", "EXPIRED", "IDLE", "RUNNING", "string", "number", "boolean",
  "object", "undefined", "function",
]);
const CODE_LIKE = /^(?:[A-Z][A-Z0-9_]{4,}|[A-Z][A-Za-z0-9]*\.[A-Za-z0-9.]+|InsufficientBalance)$/;

/**
 * 独立扫产品源码，验证「源码里用到的码都登记了」。
 * 字段赋值与比较式是两种最常见的写法；其余写法由 scripts/check-error-codes.mjs 覆盖。
 */
function sourceCodeLiterals(): string[] {
  const out: string[] = [];
  const srcDir = path.resolve(process.cwd(), "src");
  const re = /(?:errorCode|(?<![A-Za-z])code)\s*(?::|===|!==|==)\s*(?:"([^"]+)"|'([^']+)')/g;

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      if (full.endsWith("error-codes.ts")) continue;
      for (const line of readFileSync(full, "utf8").split("\n")) {
        for (const match of line.matchAll(re)) {
          const value = match[1] ?? match[2];
          if (CODE_LIKE.test(value) && !NOT_A_CODE.has(value) && !EXTERNAL.has(value)) {
            out.push(value);
          }
        }
      }
    }
  }

  walk(srcDir);
  return out;
}

describe("error code registry", () => {
  it("covers every error code literal used in product sources", () => {
    const missing = [...new Set(sourceCodeLiterals())].filter((code) => !registered.has(code));
    expect(missing).toEqual([]);
  });

  it("keeps every entry inside the declared vocabulary", () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(statusNames.length).toBeGreaterThan(0);
    expect(ALL_ERROR_CODES.length).toBe(entries.length);
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
    expect(getErrorCategory("FailedOperation.DataSourceNotExist")).toBe("not_found");
    expect(getErrorCategory("PG_NOT_READY")).toBe("precondition");
    expect(getErrorCategory("CLOUD_MODE_ACTION_UNAVAILABLE")).toBe("precondition");
    expect(getErrorCategory("MIGRATION_TASK_TIMEOUT")).toBe("unavailable");
    expect(getErrorCategory("INTERNAL_ERROR")).toBe("internal");
    expect(getErrorCategory("NOT_REGISTERED_CODE")).toBeUndefined();
    expect(getErrorCategory("FailedOperation.DataSourceNotExist")).not.toBe("internal");
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
    expect(cloudCodes).toContain("FailedOperation.DataSourceNotExist");
    expect(cloudCodes).toContain("InvalidParameter.Cls");
    expect(cloudCodes).toContain("EXCEED_REQUEST_LIMIT");
    expect(cloudCodes).toContain("InsufficientBalance");
    expect(cloudCodes).toContain("AuthFailure.UnauthorizedOperation");
  });

  it("keeps CAM resource denials on the permission path", () => {
    expect(getErrorCategory("AuthFailure.UnauthorizedOperation")).toBe("permission");
    expect(isActionRequired("AuthFailure.UnauthorizedOperation")).toBe(false);
    expect(ERROR_CODES["AuthFailure.UnauthorizedOperation"].origin).toBe("cloud_api");
  });

  it("marks the first newly registered code as next", () => {
    expect(ERROR_CODES.ACTION_NOT_GRANTED.since).toBe("next");
    expect(ERROR_CODES.ACTION_NOT_GRANTED.category).toBe("permission");
  });

  it("does not treat prototype keys as registered codes", () => {
    for (const key of ["toString", "__proto__", "constructor", "hasOwnProperty"]) {
      expect(getErrorCategory(key)).toBeUndefined();
      expect(isActionRequired(key)).toBe(false);
    }
  });
});
