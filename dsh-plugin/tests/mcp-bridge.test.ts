import { describe, expect, it } from "vitest";
import { buildMcpPassthroughEnv } from "../src/shared/constants.js";
import { buildMcpClientConfig, loginHint } from "../src/server/mcp-bridge.js";
import { parseMcpFrames } from "../src/server/mcp-client.js";

describe("mcp bridge env", () => {
  it("always emits a string CLOUDBASE_ENV_ID and never API Key", () => {
    const empty = buildMcpPassthroughEnv({});
    expect(empty.CLOUDBASE_ENV_ID).toBe("ai-share-d2guukyxybb63b206");
    expect("CLOUDBASE_API_KEY" in empty).toBe(false);

    const custom = buildMcpPassthroughEnv({ CLOUDBASE_ENV_ID: "env-abc" });
    expect(custom.CLOUDBASE_ENV_ID).toBe("env-abc");

    const config = buildMcpClientConfig({ CLOUDBASE_ENV_ID: undefined });
    const envId = config.env.CLOUDBASE_ENV_ID;
    expect(typeof envId).toBe("string");
    expect(envId?.length).toBeGreaterThan(0);
    expect(JSON.stringify(config.env).includes("undefined")).toBe(false);
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
});
