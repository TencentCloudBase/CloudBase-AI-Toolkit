/**
 * Unit regression for mcp/scripts/verify-npm-tarball-smoke.mjs live assertion.
 *
 * Covers:
 * 1) primary-path success → PASS + WARN (no OPA fallback required)
 * 2) OPA fallback envelopes (nested data.fallback / message / top-level fallback)
 * 3) static guard: runLiveWithFreshServer must not bind a local `path` that
 *    shadows node:path (TDZ ReferenceError only visible in live smoke)
 *
 * Run:
 *   npx vitest run tests/verify-npm-tarball-smoke.test.js
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoRuntimeDependencies,
  evaluateLiveQueryPermissionsPayload,
} from "../mcp/scripts/verify-npm-tarball-smoke.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SMOKE_SCRIPT = path.join(ROOT, "mcp/scripts/verify-npm-tarball-smoke.mjs");

describe("evaluateLiveQueryPermissionsPayload", () => {
  test("primary path success PASSes with WARN flag (no OPA fallback)", () => {
    const evaluated = evaluateLiveQueryPermissionsPayload({
      success: true,
      message: "资源权限查询成功",
      data: {
        resourceType: "function",
        resourceId: "atoPgPermProbe",
      },
    });

    expect(evaluated.routePath).toBe("primary");
    expect(evaluated.usedOpaFallback).toBe(false);
    expect(evaluated.warnPrimaryWithoutOpa).toBe(true);
    expect(evaluated.fallback).toBeNull();
    expect(evaluated.message).toBe("资源权限查询成功");
  });

  test("nested data.fallback describeEnvAuthzConfig is opa-fallback without WARN", () => {
    const evaluated = evaluateLiveQueryPermissionsPayload({
      success: true,
      message: "资源权限查询成功（OPA fallback）",
      data: {
        fallback: "describeEnvAuthzConfig",
      },
    });

    expect(evaluated.routePath).toBe("opa-fallback");
    expect(evaluated.usedOpaFallback).toBe(true);
    expect(evaluated.warnPrimaryWithoutOpa).toBe(false);
    expect(evaluated.fallback).toBe("describeEnvAuthzConfig");
  });

  test("top-level fallback field is also accepted", () => {
    const evaluated = evaluateLiveQueryPermissionsPayload({
      success: true,
      message: "ok",
      fallback: "describeEnvAuthzConfig",
    });

    expect(evaluated.routePath).toBe("opa-fallback");
    expect(evaluated.fallback).toBe("describeEnvAuthzConfig");
    expect(evaluated.warnPrimaryWithoutOpa).toBe(false);
  });

  test("message mentioning describeEnvAuthzConfig counts as OPA fallback", () => {
    const evaluated = evaluateLiveQueryPermissionsPayload({
      success: true,
      message: "fell back to describeEnvAuthzConfig",
      data: {},
    });

    expect(evaluated.routePath).toBe("opa-fallback");
    expect(evaluated.warnPrimaryWithoutOpa).toBe(false);
  });

  test("failed payload throws (hard fail)", () => {
    expect(() =>
      evaluateLiveQueryPermissionsPayload({
        success: false,
        message: "权限查询失败",
      }),
    ).toThrow(/Live queryPermissions failed/);
  });
});

describe("assertNoRuntimeDependencies", () => {
  test("accepts a published package.json with no dependencies", () => {
    expect(() => assertNoRuntimeDependencies({ version: "1.0.0" })).not.toThrow();
    expect(() => assertNoRuntimeDependencies({ dependencies: {} })).not.toThrow();
  });

  test("fails and names the leftovers when prepare-publish did not run", () => {
    expect(() =>
      assertNoRuntimeDependencies({
        dependencies: {
          "@modelcontextprotocol/sdk": "1.32.2",
          zod: "3.25.76",
        },
      }),
    ).toThrow(/still declares 2 runtime dependencies/);

    expect(() =>
      assertNoRuntimeDependencies({ dependencies: { zod: "3.25.76" } }),
    ).toThrow(/still declares 1 runtime dependency \(zod\)/);
  });
});

describe("runLiveWithFreshServer path-shadowing guard", () => {
  test("does not declare local const/let path that would TDZ-shadow node:path", () => {
    const source = readFileSync(SMOKE_SCRIPT, "utf8");
    const fnMatch = source.match(
      /async function runLiveWithFreshServer\([\s\S]*?\n\}\n\nasync function main/,
    );
    expect(fnMatch, "runLiveWithFreshServer function body not found").toBeTruthy();

    const body = fnMatch[0];
    expect(body).toMatch(/\bconst routePath\b/);
    expect(body).not.toMatch(/\b(?:const|let)\s+path\s*=/);
    // Keep using the module-level node:path import inside the live helper.
    expect(body).toMatch(/\bpath\.join\(/);
  });

  test("documents why the binding must not be named path", () => {
    const source = readFileSync(SMOKE_SCRIPT, "utf8");
    expect(source).toMatch(/Do not name this `path`/);
    expect(source).toMatch(/shadows the node:path import/);
  });
});
