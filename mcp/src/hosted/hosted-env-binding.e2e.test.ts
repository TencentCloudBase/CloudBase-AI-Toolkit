/**
 * hosted 的槽必须跟着请求走（spec `specs/telemetry-env-binding` §4 / §6 / §10.5、§10.7）。
 *
 * 这条是端到端：真 http、真 `handleHostedMcpRequest`、真 `createCloudBaseMcpServer`、
 * 真 `reportToolkitSessionInitialized`，只把最终出网的 `telemetryReporter.report` 换掉。
 *
 * 为什么不能用 `reportToolCall` 的 mock 断言：`envId` 是上报函数内部解析出来的，
 * 工具 wrapper 只传 `cloudBaseOptions`。只有走到 `report` 才能看见最终写进灯塔列的值。
 *
 * 本机路径（stdio）的等价覆盖在 `utils/env-binding.e2e.test.ts`；这里只钉 hosted 的边界：
 * 每个请求一个槽、下个请求不记得上个请求、不读服务器上的进程变量与本地文件。
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { telemetryReporter } from "../utils/telemetry.js";
import { handleHostedMcpRequest } from "./handle-hosted-mcp-request.js";

type ReportedEvent = Record<string, any>;

const spyOnReport = () =>
  vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

let reportSpy: ReturnType<typeof spyOnReport>;

/**
 * `initialized` 走的是 `toolkit_lifecycle` 这个 eventCode，靠 `event` 字段区分
 * （与 `start` / `exit` 同一张表、同一列位 c19）。
 */
function initializedEvents(): ReportedEvent[] {
  return reportSpy.mock.calls
    .filter((call) => call[0] === "toolkit_lifecycle")
    .map((call) => call[1] as ReportedEvent)
    .filter((data) => data.event === "initialized");
}

/** 一个 hosted 端点：`x-test-env` 有值才注入 envId，没有就模拟「宿主没带环境」的请求。 */
async function listenHosted(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : undefined;
    const injected = req.headers["x-test-env"];
    const envId = typeof injected === "string" && injected ? injected : undefined;

    await handleHostedMcpRequest({
      req,
      res,
      body,
      serverOptions: {
        name: "cloudbase-mcp",
        enableTelemetry: true,
        cloudMode: true,
        cloudBaseOptions: {
          ...(envId ? { envId } : {}),
          secretId: "secret-test",
          secretKey: "secret-key",
          token: "token-test",
          site: "domestic",
        },
      },
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function post(
  port: number,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<void> {
  await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  }).then((res) => res.text());
}

/**
 * 上报是 fire-and-forget（`void ... .catch()`），`post` 返回时它可能还在 `await` 里。
 * 断言前等事件攒够，别用固定 sleep 猜。
 */
async function waitForInitialized(count: number, timeoutMs = 5000): Promise<ReportedEvent[]> {
  const t0 = Date.now();
  while (initializedEvents().length < count && Date.now() - t0 < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return initializedEvents();
}

/** 一次会话 = initialize + notifications/initialized。后者才触发 initialized 上报。 */
async function startSession(port: number, envId?: string): Promise<void> {
  const headers: Record<string, string> = envId ? { "x-test-env": envId } : {};
  await post(
    port,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "HostedSlotProbe", version: "1.0.0" },
      },
    },
    headers,
  );
  await post(port, { jsonrpc: "2.0", method: "notifications/initialized" }, headers);
}

describe("hosted 的环境槽跟着请求走", () => {
  beforeEach(() => {
    reportSpy = spyOnReport();
    // 进程里留一个环境变量：hosted 不读它，读了就是这个值
    process.env.CLOUDBASE_ENV_ID = "env-leaked-from-process";
  });

  afterEach(() => {
    reportSpy.mockRestore();
    delete process.env.CLOUDBASE_ENV_ID;
  });

  it("注入 envId 的请求上报 cloudBaseOptions；没注入的报告 default，不读进程变量", async () => {
    const endpoint = await listenHosted();
    try {
      await startSession(endpoint.port, "env-a");
      await waitForInitialized(1);
      await startSession(endpoint.port);
      const events = await waitForInitialized(2);
      expect(events.length).toBe(2);
      // Poll order is not guaranteed; compare the set, not array positions.
      const byEnv = events.map((e) => `${e.envId}|${e.envIdSource}`).sort();
      expect(byEnv).toEqual(["env-a|cloudBaseOptions", "unknown|default"]);
    } finally {
      await endpoint.close();
    }
  });

  it("两个请求交错发起时互不串：各自的槽只放自己的 envId", async () => {
    const endpoint = await listenHosted();
    try {
      await Promise.all([
        startSession(endpoint.port, "env-first"),
        startSession(endpoint.port, "env-second"),
        startSession(endpoint.port),
      ]);

      const events = await waitForInitialized(3);
      const byEnv = events.map((e) => `${e.envId}|${e.envIdSource}`).sort();
      expect(byEnv).toEqual([
        "env-first|cloudBaseOptions",
        "env-second|cloudBaseOptions",
        "unknown|default",
      ]);
    } finally {
      await endpoint.close();
    }
  });

  it("上个请求用过 env-a，下个请求不带 envId 也不会读到它", async () => {
    const endpoint = await listenHosted();
    try {
      // 一条一条等落地，顺序才有意义：上报是 fire-and-forget，连着发不保证先来的先报
      await startSession(endpoint.port, "env-a");
      await waitForInitialized(1);
      await startSession(endpoint.port);
      await waitForInitialized(2);
      await startSession(endpoint.port, "env-b");
      const events = await waitForInitialized(3);
      expect(events.map((e) => e.envId)).toEqual(["env-a", "unknown", "env-b"]);
      expect(events.map((e) => e.envIdSource)).toEqual([
        "cloudBaseOptions",
        "default",
        "cloudBaseOptions",
      ]);
    } finally {
      await endpoint.close();
    }
  });
});
