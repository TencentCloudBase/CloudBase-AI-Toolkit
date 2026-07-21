// tests/hooks/plugin-telemetry.test.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLUGIN_DAU_EVENT,
  PLUGIN_FIRST_USE_EVENT,
  buildBeaconPayload,
  isPluginTelemetryEnabled,
  markDauSent,
  reportPluginSessionTelemetry,
  resolvePluginVersion,
  shouldSendDau,
  shouldSendFirstUse,
  utcDateStamp,
} from "../../plugin/cloudbase/hooks/plugin-telemetry.mjs";

const tempDirs = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "cloudbase-plugin-telemetry-"));
  tempDirs.push(dir);
  return dir;
}

describe("plugin telemetry gating", () => {
  it("is disabled by CLOUDBASE_PLUGIN_TELEMETRY=off", () => {
    expect(isPluginTelemetryEnabled({ CLOUDBASE_PLUGIN_TELEMETRY: "off" })).toBe(
      false,
    );
    expect(
      isPluginTelemetryEnabled({ CLOUDBASE_MCP_TELEMETRY_DISABLED: "true" }),
    ).toBe(false);
    expect(isPluginTelemetryEnabled({})).toBe(true);
  });

  it("shouldSendDau is once per UTC day", () => {
    const stampDir = makeTempDir();
    const day = new Date("2026-07-21T12:00:00.000Z");
    expect(shouldSendDau(stampDir, day)).toBe(true);
    markDauSent(stampDir, day);
    expect(shouldSendDau(stampDir, day)).toBe(false);
    expect(shouldSendDau(stampDir, new Date("2026-07-22T01:00:00.000Z"))).toBe(
      true,
    );
    expect(utcDateStamp(day)).toBe("2026-07-21");
  });

  it("shouldSendFirstUse is once forever", () => {
    const stampDir = makeTempDir();
    expect(shouldSendFirstUse(stampDir)).toBe(true);
    writeFileSync(join(stampDir, "first-use-stamp"), "done\n");
    expect(shouldSendFirstUse(stampDir)).toBe(false);
  });

  it("resolvePluginVersion reads .claude-plugin/plugin.json", () => {
    const root = makeTempDir();
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "cloudbase", version: "0.2.0" }),
    );
    expect(resolvePluginVersion(root)).toBe("0.2.0");
  });
});

describe("reportPluginSessionTelemetry", () => {
  it("sends first_use and dau, then stamps only after success", async () => {
    const stampDir = makeTempDir();
    const root = makeTempDir();
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ version: "9.9.9" }),
    );

    const posts = [];
    const postFetch = vi.fn(async (_url, payload) => {
      posts.push(payload);
      return { statusCode: 200, body: "ok" };
    });

    const first = await reportPluginSessionTelemetry({
      env: {},
      pluginRoot: root,
      stampDir,
      now: new Date("2026-07-21T08:00:00.000Z"),
      postFetch,
    });

    expect(first.enabled).toBe(true);
    expect(first.sent).toEqual([PLUGIN_FIRST_USE_EVENT, PLUGIN_DAU_EVENT]);
    expect(posts).toHaveLength(2);
    expect(posts[0].common.from).toBe("cloudbase-plugin");
    expect(posts[0].events[0].eventCode).toBe(PLUGIN_FIRST_USE_EVENT);
    expect(posts[0].events[0].mapValue).toMatchObject({
      pluginVersion: "9.9.9",
      event: "first_use",
      value: "1",
    });
    expect(posts[1].events[0].eventCode).toBe(PLUGIN_DAU_EVENT);
    expect(readFileSync(join(stampDir, "dau-stamp"), "utf-8").trim()).toBe(
      "2026-07-21",
    );
    expect(existsFirstUse(stampDir)).toBe(true);

    const second = await reportPluginSessionTelemetry({
      env: {},
      pluginRoot: root,
      stampDir,
      now: new Date("2026-07-21T18:00:00.000Z"),
      postFetch,
    });
    expect(second.sent).toEqual([]);
    expect(posts).toHaveLength(2);
  });

  it("does not stamp when upload fails", async () => {
    const stampDir = makeTempDir();
    const root = makeTempDir();
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ version: "1.0.0" }),
    );

    const result = await reportPluginSessionTelemetry({
      env: {},
      pluginRoot: root,
      stampDir,
      postFetch: async () => {
        throw new Error("network down");
      },
    });

    expect(result.sent).toEqual([]);
    expect(shouldSendFirstUse(stampDir)).toBe(true);
    expect(shouldSendDau(stampDir)).toBe(true);
  });

  it("skips entirely when telemetry is off", async () => {
    const postFetch = vi.fn();
    const result = await reportPluginSessionTelemetry({
      env: { CLOUDBASE_PLUGIN_TELEMETRY: "off" },
      stampDir: makeTempDir(),
      postFetch,
    });
    expect(result).toEqual({ enabled: false, sent: [] });
    expect(postFetch).not.toHaveBeenCalled();
  });
});

describe("buildBeaconPayload", () => {
  it("matches MCP beacon envelope shape", () => {
    const payload = buildBeaconPayload({
      eventCode: PLUGIN_DAU_EVENT,
      eventData: { pluginVersion: "0.2.0", value: "1" },
      deviceId: "abc",
      userAgent: "ua",
      now: 1000,
    });
    expect(payload.mainAppKey).toBe("0WEB0AD0GM4PUUU1");
    expect(payload.common.from).toBe("cloudbase-plugin");
    expect(payload.events[0].eventTime).toBe("1000");
  });
});

function existsFirstUse(stampDir) {
  try {
    readFileSync(join(stampDir, "first-use-stamp"), "utf-8");
    return true;
  } catch {
    return false;
  }
}
