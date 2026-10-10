// tests/hooks/plugin-telemetry.test.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLUGIN_DAU_EVENT,
  PLUGIN_FIRST_USE_EVENT,
  buildAuthAttribution,
  buildBeaconPayload,
  isPluginTelemetryEnabled,
  markDauSent,
  reportPluginSessionTelemetry,
  resolveLocalAuthFacts,
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

    const noAuth = join(stampDir, "absent-auth.json");
    const first = await reportPluginSessionTelemetry({
      env: {},
      pluginRoot: root,
      stampDir,
      now: new Date("2026-07-21T08:00:00.000Z"),
      postFetch,
      authFile: noAuth,
      cliConfigFile: join(stampDir, "absent-cli.json"),
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
      // 读不到登录态 ⇒ 与 MCP 侧同一约定：上报 unknown，而不是缺字段
      login_uin: "unknown",
      envId: "unknown",
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

describe("resolveLocalAuthFacts · 登录态形状", () => {
  function write(file, value) {
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  }

  /** 搭一套临时的 auth.json + config.json，返回可直接传给读取函数的 options */
  function fixture(auth, cli) {
    const dir = makeTempDir();
    const authFile = join(dir, "auth.json");
    const cliConfigFile = join(dir, "config.json");
    if (auth !== undefined) write(authFile, auth);
    if (cli !== undefined) write(cliConfigFile, cli);
    return { authFile, cliConfigFile };
  }

  it("flat：直接取 uin / envId（uin 是数字也给字符串）", () => {
    const f = fixture(
      { credential: { uin: 123811017, envId: "ai-native-d1ggefhgb8c27e3e8", tmpSecretKey: "x" } },
    );
    expect(resolveLocalAuthFacts(f)).toEqual({
      loginUin: "123811017",
      envId: "ai-native-d1ggefhgb8c27e3e8",
    });
  });

  it("flat 缺 envId（最常见）：envId 为 undefined，uin 照常", () => {
    const f = fixture({ credential: { uin: "123811017", tmpSecretKey: "x" } });
    expect(resolveLocalAuthFacts(f)).toEqual({ loginUin: "123811017", envId: undefined });
  });

  it("没有 credential 包裹（形状 C）也能读", () => {
    const f = fixture({ uin: "200031025858", envId: "env-a" });
    expect(resolveLocalAuthFacts(f)).toEqual({ loginUin: "200031025858", envId: "env-a" });
  });

  it("slotted + isIntl=false ⇒ 取 domestic", () => {
    const f = fixture(
      { credential: { domestic: { uin: "1" }, intl: { uin: "2" } } },
      { isIntl: false },
    );
    expect(resolveLocalAuthFacts(f).loginUin).toBe("1");
  });

  it("slotted + isIntl=true ⇒ 取 intl（取错槽会拿到另一个站点的 uin）", () => {
    const f = fixture(
      { credential: { domestic: { uin: "1" }, intl: { uin: "2" } } },
      { isIntl: true },
    );
    expect(resolveLocalAuthFacts(f).loginUin).toBe("2");
  });

  it("slotted 但 config.json 缺失 / isIntl 不是布尔 ⇒ 退化为优先 domestic", () => {
    const both = { credential: { domestic: { uin: "1" }, intl: { uin: "2" } } };
    expect(resolveLocalAuthFacts(fixture(both)).loginUin).toBe("1");
    expect(resolveLocalAuthFacts(fixture(both, { isIntl: "yes" })).loginUin).toBe("1");
  });

  it("slotted 且选中的槽不存在 ⇒ 回退到另一个槽", () => {
    const f = fixture({ credential: { intl: { uin: "2" } } }, { isIntl: false });
    expect(resolveLocalAuthFacts(f).loginUin).toBe("2");
  });

  it("文件不存在 / JSON 坏掉 ⇒ 两个都 undefined，且不抛错", () => {
    expect(resolveLocalAuthFacts(fixture(undefined))).toEqual({
      loginUin: undefined,
      envId: undefined,
    });
    expect(resolveLocalAuthFacts(fixture("{ not json"))).toEqual({
      loginUin: undefined,
      envId: undefined,
    });
  });

  it("脏值一律忽略：uin 空 / '0'、envId 非字符串 / 空白", () => {
    for (const uin of [undefined, null, "", "  ", 0, "0"]) {
      expect(resolveLocalAuthFacts(fixture({ credential: { uin } })).loginUin).toBeUndefined();
    }
    for (const envId of [undefined, null, 123, "", "   "]) {
      expect(resolveLocalAuthFacts(fixture({ credential: { uin: "1", envId } })).envId).toBeUndefined();
    }
    expect(
      resolveLocalAuthFacts(fixture({ credential: { uin: "1", envId: "  env-a  " } })).envId,
    ).toBe("env-a");
  });

  it("buildAuthAttribution：读不到报 unknown，不省字段", () => {
    expect(buildAuthAttribution(fixture(undefined))).toEqual({
      login_uin: "unknown",
      envId: "unknown",
    });
    expect(buildAuthAttribution(fixture({ credential: { uin: "1", envId: "e" } }))).toEqual({
      login_uin: "1",
      envId: "e",
    });
  });

  it("两条事件都带上归因字段", async () => {
    const dir = makeTempDir();
    const root = makeTempDir();
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "1.0.0" }));
    const authFile = join(dir, "auth.json");
    writeFileSync(authFile, JSON.stringify({ credential: { uin: 123811017, envId: "env-x" } }));

    const posts = [];
    await reportPluginSessionTelemetry({
      env: {},
      pluginRoot: root,
      stampDir: dir,
      authFile,
      cliConfigFile: join(dir, "config.json"),
      postFetch: async (_u, payload) => {
        posts.push(payload);
        return { statusCode: 200, body: "ok" };
      },
    });
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.events[0].mapValue).toMatchObject({ login_uin: "123811017", envId: "env-x" });
    }
  });
});
