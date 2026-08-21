import { describe, expect, it } from "vitest";
import {
  SessionEnvCache,
  buildListBoundEnvsPayload,
  buildMcpClientConfig,
  cloudbaseToolNeedsEnv,
  isCloudbasePublicTool,
  loginHint,
  parseToolArguments,
} from "../src/server/mcp-bridge.js";
import { parseMcpFrames } from "../src/server/mcp-client.js";

describe("mcp bridge env", () => {
  it("routes session MCP through env proxy without API key env", () => {
    const config = buildMcpClientConfig({ CLOUDBASE_API_KEY: "sk-test" });
    expect(config.command).toBe("node");
    expect(config.args[0]).toContain("mcp-env-proxy.mjs");
    expect("CLOUDBASE_API_KEY" in config.env).toBe(false);
    expect(config.env.CLOUDBASE_DSH_ENV_HINT_FILE).toBeTruthy();
  });

  it("parses Content-Length MCP frames", () => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
    const frame = Buffer.concat([
      Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),
      body,
    ]);
    const parsed = parseMcpFrames(frame);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]?.id).toBe(1);
  });

  it("parses Content-Length frames whose JSON body ends with a newline", () => {
    const body = Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id: 7, result: { ok: true } })}\n`);
    const frame = Buffer.concat([
      Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),
      body,
    ]);
    const parsed = parseMcpFrames(frame);
    expect(parsed.messages[0]?.id).toBe(7);
  });

  it("guides device-code login when signed out", () => {
    expect(loginHint(false)).toContain("start_auth");
    expect(loginHint(false)).toContain("device");
    expect(loginHint(true)).toContain("登录态");
  });

  it("tracks session env bindings in memory", () => {
    const cache = new SessionEnvCache();
    cache.set("s1", "env-a");
    cache.set("s2", "env-b");
    expect(cache.get("s1")?.envId).toBe("env-a");
    expect(cache.list()).toHaveLength(2);
    const payload = buildListBoundEnvsPayload(cache.listForSession("s1"));
    expect(payload.current_env_id).toBe("env-a");
    expect(payload.bound_envs).toHaveLength(2);
  });

  it("detects cloudbase public tools and env requirements", () => {
    expect(isCloudbasePublicTool("mcp__cloudbase__queryPgDatabase")).toBe(true);
    expect(cloudbaseToolNeedsEnv("queryPgDatabase", { action: "sql" })).toBe(true);
    expect(cloudbaseToolNeedsEnv("auth", { action: "set_env" })).toBe(false);
    expect(cloudbaseToolNeedsEnv("auth", { action: "list_bound_envs" })).toBe(false);
    expect(parseToolArguments('{"action":"status"}').action).toBe("status");
  });
});
