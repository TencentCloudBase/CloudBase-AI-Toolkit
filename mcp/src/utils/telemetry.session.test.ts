import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import https from "node:https";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCloudBaseMcpServer } from "../server.js";
import { reportToolkitSessionInitialized, telemetryReporter } from "./telemetry.js";

/**
 * 会话级上报（`toolkit_lifecycle` 的 `event: 'initialized'` 形态）的运行时测试。
 *
 * 为什么需要它：这条上报是"分母"——进程级 `start` 早于握手，所以 client 与能力声明只能在这里报。
 * 最容易悄悄失效的正是这几个点：**钩子没挂上**、**每个会话重复报**、**能力字段漏挂**、
 * **拿到了不存在的字段**（例如协议版本）。这里用**真实握手**（InMemoryTransport + Client）
 * 验证前三者，而不是直接在单测里调函数。
 */

/** 允许出现在载荷里的键（除它以外一律算"多报了东西"） */
const ALLOWED_KEYS = [
  "event",
  "envId",
  "region",
  "site",
  "login_uin",
  "nodeVersion",
  "osType",
  "osRelease",
  "arch",
  "mcpVersion",
  "ide",
  "client",
  "mcpClientName",
  "mcpClientVersion",
  "mcpClientTitle",
  "mcpCaps",
  "mcpCapsElicitation",
  "mcpCapsUi",
];

/** 只 spy 上报出口：载荷组装本身真跑，避免把被测代码 mock 掉 */
function spyOnReport() {
  return vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);
}

let reportSpy: ReturnType<typeof spyOnReport>;

beforeEach(() => {
  reportSpy = spyOnReport();
});

afterEach(() => {
  reportSpy.mockRestore();
  delete process.env.CLOUDBASE_MCP_TELEMETRY_DISABLED;
  vi.resetModules();
});

/** 取某次会话上报的 mapValue（eventData） */
function initializedPayloads(): Array<Record<string, unknown>> {
  return reportSpy.mock.calls
    .filter(([eventCode]) => eventCode === "toolkit_lifecycle")
    .map(([, data]) => data as Record<string, unknown>)
    .filter((data) => data.event === "initialized");
}

describe("会话建立后上报一次（真实握手）", () => {
  it("握手完成后报 `event: initialized`，并带上 client 身份与能力摘要；每会话只发一次", async () => {
    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["env"],
      // 钩子在 `if (enableTelemetry)` 里（S1）：要验会话上报就必须开总闸
      enableTelemetry: true,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: "session-probe-client", version: "9.9.9" },
      {
        capabilities: {
          elicitation: {},
          extensions: { "io.modelcontextprotocol/ui": {} },
        } as never,
      },
    );

    try {
      await server.connect(serverTransport);
      // connect 之前不该报（进程 start 那一条是另一个函数的事）
      expect(initializedPayloads()).toHaveLength(0);

      await client.connect(clientTransport);
      // oninitialized 是通知处理器，给它一个 tick 让 fire-and-forget 的 promise 跑到 report
      await new Promise((resolve) => setTimeout(resolve, 0));

      const payloads = initializedPayloads();
      expect(payloads).toHaveLength(1);
      const payload = payloads[0];
      expect(payload.event).toBe("initialized");
      // 握手后才有：client 名称/版本
      expect(payload.mcpClientName).toBe("session-probe-client");
      expect(payload.mcpClientVersion).toBe("9.9.9");
      // 握手后才有：能力摘要（这条上报存在的理由）
      expect(payload.mcpCaps).toContain("elicitation");
      expect(payload.mcpCapsElicitation).toBe("true");
      expect(payload.mcpCapsUi).toBe("true");
      // 进程级概念不该出现在会话级上报里
      expect(payload).not.toHaveProperty("duration");
      expect(payload).not.toHaveProperty("exitCode");
      expect(payload).not.toHaveProperty("error");

      // 重复的 initialized 通知不重复发（幂等）
      await client.notification({ method: "notifications/initialized" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(initializedPayloads()).toHaveLength(1);
    } finally {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  });

  it("载荷只含允许的键，且不报拿不到的字段（协议版本本版 SDK 拿不到）", async () => {
    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["env"],
      // 钩子在 `if (enableTelemetry)` 里（S1）：要验会话上报就必须开总闸
      enableTelemetry: true,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "io-probe", version: "0.0.1" });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const payload = initializedPayloads()[0];
      expect(payload).toBeTruthy();
      for (const key of Object.keys(payload)) {
        expect(ALLOWED_KEYS, `${key} 不在允许列表里（PII / 多报了字段）`).toContain(key);
      }
      // SDK 的 Server 只存 capabilities 与 clientInfo，不保留协商后的 protocolVersion ⇒ 不报
      expect(payload.protocolVersion).toBeUndefined();
    } finally {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  });
});

describe("`enableTelemetry: false` 是真的总闸", () => {
  it("关掉遥测时连会话事件都不发（oninitialized 根本没被挂上）", async () => {
    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["env"],
      enableTelemetry: false,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "gate-probe", version: "0.0.1" });

    try {
      // 钩子不挂：这条断言就是"总闸"的实现细节，也是复核探针实测到的那条回归
      expect(server.server.oninitialized).toBeUndefined();

      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(initializedPayloads()).toHaveLength(0);
      expect(reportSpy.mock.calls.filter(([code]) => code === "toolkit_lifecycle")).toHaveLength(0);
    } finally {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  });
});

describe("真实出网体（打桩 https.request，覆盖非 spy report 的路径）", () => {
  it("POST 体里 eventCode 是 toolkit_lifecycle、mapValue.event 是 initialized 且带能力", async () => {
    const bodies: string[] = [];
    const requestSpy = vi.spyOn(https, "request").mockImplementation(((options: any, cb: any) => {
      return {
        on() {
          return this;
        },
        write(chunk: unknown) {
          bodies.push(String(chunk));
          return true;
        },
        end() {
          cb?.({
            statusCode: 200,
            on(event: string, handler: () => void) {
              if (event === "end") {
                handler();
              }
              return this;
            },
          });
          return this;
        },
      } as never;
    }) as never);

    // 一个"打开"的 reporter（测试环境默认关了总闸，这里造一个开的实例走完整出网路径）
    delete process.env.CLOUDBASE_MCP_TELEMETRY_DISABLED;
    vi.resetModules();
    const fresh = await import("./telemetry.js");
    expect(fresh.telemetryReporter.isEnabled()).toBe(true);

    await fresh.reportToolkitSessionInitialized({
      cloudBaseOptions: { envId: "env-body-probe" },
      ide: "probe-ide",
      client: "probe-client",
      mcpClientInfo: { name: "body-probe", version: "1.2.3" },
      mcpClientCapabilities: {
        elicitationForm: true,
        elicitationUrl: false,
        ui: true,
        roots: false,
        sampling: false,
        summary: "elicitation:form, ui",
      },
    });

    expect(bodies).toHaveLength(1);
    const payload = JSON.parse(bodies[0]);
    expect(payload.events[0].eventCode).toBe("toolkit_lifecycle");
    const mapValue = payload.events[0].mapValue;
    expect(mapValue.event).toBe("initialized");
    expect(mapValue.mcpClientName).toBe("body-probe");
    expect(mapValue.mcpCapsElicitation).toBe("true");
    expect(mapValue.mcpCapsUi).toBe("true");
    expect(mapValue.envId).toBe("env-body-probe");
    expect(mapValue.ide).toBe("probe-ide");
    // 与既有事件同源的字段也必须真的在体里（漏一个就该红）
    expect(typeof mapValue.site).toBe("string");
    expect(typeof mapValue.region).toBe("string");
    expect(typeof mapValue.mcpVersion).toBe("string");
    expect(mapValue.mcpClientVersion).toBe("1.2.3");
    requestSpy.mockRestore();
  });
});

describe("遥测关闭时不出网", () => {
  it("`CLOUDBASE_MCP_TELEMETRY_DISABLED=true` 时 report() 第一行就 return（唯一网络边界）", async () => {
    process.env.CLOUDBASE_MCP_TELEMETRY_DISABLED = "true";
    vi.resetModules();
    const fresh = await import("./telemetry.js");
    // 不 spy report（那会绕过 disabled 判定），改 spy 真正的网络出口：
    const requestSpy = vi.spyOn(https, "request");

    expect(fresh.telemetryReporter.isEnabled()).toBe(false);
    await fresh.reportToolkitSessionInitialized({
      mcpClientInfo: { name: "x" },
      mcpClientCapabilities: {
        elicitationForm: true,
        elicitationUrl: false,
        ui: true,
        roots: false,
        sampling: false,
        summary: "elicitation:form, ui",
      },
    });

    expect(requestSpy).not.toHaveBeenCalled();
    requestSpy.mockRestore();
  });
});

describe("直接调用时的载荷纪律", () => {
  it("拿不到的东西留空，不臆造（能力缺失 ⇒ 不带能力字段）", async () => {
    await reportToolkitSessionInitialized({ cloudBaseOptions: { envId: "env-probe" } });

    const payload = initializedPayloads()[0];
    expect(payload.event).toBe("initialized");
    expect(payload.envId).toBe("env-probe");
    expect(payload).not.toHaveProperty("mcpCaps");
    expect(payload).not.toHaveProperty("mcpCapsElicitation");
    expect(payload).not.toHaveProperty("mcpCapsUi");
    expect(payload).not.toHaveProperty("mcpClientName");
    expect(payload).not.toHaveProperty("protocolVersion");
  });
});
