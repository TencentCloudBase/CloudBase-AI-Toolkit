import { describe, expect, it, vi } from "vitest";
import {
  detectCloudRunBuildRecordLost,
  verifyCloudRunBuildRecordNotLost,
} from "./cloudrun.js";

describe("detectCloudRunBuildRecordLost", () => {
  it("matches the 300502 build not found run-log symptom", () => {
    const log =
      "create_build_image : creating\ncheck_build_image : fail, [ErrorCode]:300502, [ErrorMessage]:build not found";
    expect(detectCloudRunBuildRecordLost(log)).toBe(true);
  });

  it("matches errorcode 300502 case-insensitively", () => {
    expect(detectCloudRunBuildRecordLost("ErrorCode:300502 something")).toBe(true);
  });

  it("does not match a healthy run log", () => {
    const log =
      "create_build_image : creating\ncheck_build_image : success\nImage pushed successfully.";
    expect(detectCloudRunBuildRecordLost(log)).toBe(false);
  });

  it("returns false for empty/non-string input", () => {
    expect(detectCloudRunBuildRecordLost("")).toBe(false);
    expect(detectCloudRunBuildRecordLost(undefined as unknown as string)).toBe(false);
  });
});

describe("verifyCloudRunBuildRecordNotLost", () => {
  const sleepFn = vi.fn(async () => {});

  it("returns lost:true when version is creating and log shows build not found", async () => {
    const runId = "run-123";
    const cloudrunService = {
      getDeployRecords: vi.fn(async () => ({
        DeployRecords: [{ Status: "creating", RunId: runId }],
      })),
      getProcessLog: vi.fn(async () => ({
        Logs: "check_build_image : fail, [ErrorCode]:300502, [ErrorMessage]:build not found",
      })),
    };
    const result = await verifyCloudRunBuildRecordNotLost({
      cloudrunService: cloudrunService as any,
      serverName: "svc",
      sleepFn,
    });
    expect(result).toEqual({ lost: true, status: "creating", reason: expect.any(String) });
  });

  it("returns lost:false once the version leaves creating", async () => {
    const cloudrunService = {
      getDeployRecords: vi.fn(async () => ({
        DeployRecords: [{ Status: "normal", RunId: "run-1" }],
      })),
      getProcessLog: vi.fn(async () => ({ Logs: "ok" })),
    };
    const result = await verifyCloudRunBuildRecordNotLost({
      cloudrunService: cloudrunService as any,
      serverName: "svc",
      sleepFn,
    });
    expect(result).toEqual({ lost: false, status: "normal" });
  });

  it("returns null (inconclusive) when status stays creating but no failure evidence yet", async () => {
    const cloudrunService = {
      getDeployRecords: vi.fn(async () => ({
        DeployRecords: [{ Status: "creating", RunId: "run-1" }],
      })),
      getProcessLog: vi.fn(async () => ({ Logs: "still building..." })),
    };
    const result = await verifyCloudRunBuildRecordNotLost({
      cloudrunService: cloudrunService as any,
      serverName: "svc",
      maxWaitMs: 1,
      intervalMs: 1,
      sleepFn,
    });
    expect(result).toBeNull();
  });
});
