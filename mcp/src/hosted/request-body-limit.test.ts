import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleHostedMcpRequest } from "./handle-hosted-mcp-request.js";

/**
 * 托管入口按声明的 content-length 挡掉超大请求。
 *
 * 这里直接喂假的 req/res：真的发 4 MiB 只能证明 Node 能收包，证明不了这道闸——
 * 而这道闸存在的理由正是调用方已经把 body 解析完、SDK 自己读流的检查用不上。
 */
function fakeRequest(contentLength?: string): IncomingMessage {
  return {
    headers: contentLength === undefined ? {} : { "content-length": contentLength },
  } as unknown as IncomingMessage;
}

function fakeResponse() {
  const state = { statusCode: 200, headers: {} as Record<string, string>, body: "", ended: false };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    get headersSent() {
      return state.ended;
    },
    get writableEnded() {
      return state.ended;
    },
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
      return res;
    },
    end(chunk?: string) {
      state.body = chunk ?? "";
      state.ended = true;
      return res;
    },
  } as unknown as ServerResponse;
  return { res, state };
}

const serverOptions = {
  name: "cloudbase-mcp",
  cloudMode: true,
  cloudBaseOptions: { envId: "env-test", secretId: "secret-test", secretKey: "secret-key" },
};

describe("hosted MCP request body limit", () => {
  it("answers 413 when the declared body exceeds the limit", async () => {
    const { res, state } = fakeResponse();
    const logger = vi.fn();

    await handleHostedMcpRequest({
      req: fakeRequest(String(5 * 1024 * 1024)),
      res,
      body: { jsonrpc: "2.0", id: 7, method: "tools/list" },
      serverOptions,
      logger,
    });

    expect(state.statusCode).toBe(413);
    expect(state.headers["content-type"]).toBe("application/json");
    const payload = JSON.parse(state.body);
    expect(payload.id).toBe(7);
    expect(payload.error.code).toBe(-32000);
    expect(payload.error.message).toContain("4194304");
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cloudbase-mcp-request-body-too-large" }),
    );
  });

  it("does not reject a request that declares nothing", async () => {
    const { res, state } = fakeResponse();

    await handleHostedMcpRequest({
      req: fakeRequest(),
      res,
      body: { jsonrpc: "2.0", id: 8, method: "notifications/initialized" },
      serverOptions,
    });

    // 没有 content-length 时放行，交给下游正常处理（这里只关心不是 413）
    expect(state.statusCode).not.toBe(413);
  });
});
