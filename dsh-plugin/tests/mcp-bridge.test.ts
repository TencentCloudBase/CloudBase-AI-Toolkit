import { describe, expect, it } from "vitest";
import { buildMcpClientConfig, loginHint } from "../src/server/mcp-bridge.js";
import { parseMcpFrames } from "../src/server/mcp-client.js";

describe("mcp bridge env", () => {
  it("forwards no CloudBase env and never an API Key", () => {
    const config = buildMcpClientConfig({ CLOUDBASE_API_KEY: "sk-test" });
    // 登录走 cloudbase-mcp 自身 device-code；不注入 CLOUDBASE_ENV_ID / API Key
    expect(Object.keys(config.env)).toHaveLength(0);
    expect("CLOUDBASE_ENV_ID" in config.env).toBe(false);
    expect("CLOUDBASE_API_KEY" in config.env).toBe(false);
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
