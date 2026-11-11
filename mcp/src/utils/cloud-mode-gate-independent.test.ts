import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCloudBaseMcpServer } from "../server.js";
import {
  CLOUD_INCOMPATIBLE_TOOLS,
  CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS,
} from "./cloud-mode.js";

/**
 * 云模式的注册门禁不能挂在遥测开关上。
 *
 * 这里走真实 MCP 握手（InMemoryTransport + Client）取 tools/list，
 * 而不是只看源码或只调 shouldRegisterTool —— 后者测不到「包装层根本没安装」。
 */
const ENV_KEYS = ["CLOUDBASE_MCP_CLOUD_MODE", "MCP_CLOUD_MODE"] as const;
const ORIGINAL_ARGV = [...process.argv];

// enableCloudMode() 会写进程级环境变量，不清理会污染同进程后续测试。
afterEach(() => {
  process.argv = [...ORIGINAL_ARGV];
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

const EXCEPTIONS = new Set<string>(CLOUD_INCOMPATIBLE_ACTION_LEVEL_EXCEPTIONS);
const GATED_TOP_LEVEL_TOOLS = CLOUD_INCOMPATIBLE_TOOLS.filter(
  (name) => !EXCEPTIONS.has(name),
);

// 这几个插件足以覆盖全部 7 个被裁工具，且避开 rag 的资源下载。
const PLUGINS = ["env", "setup", "storage", "deploy", "cloudrun"];

async function listedTools(enableTelemetry: boolean): Promise<string[]> {
  const server = await createCloudBaseMcpServer({
    cloudMode: true,
    enableTelemetry,
    pluginsEnabled: PLUGINS,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "cloud-mode-gate-test", version: "0.0.1" });

  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name);
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

describe("cloud mode registration gate is independent of telemetry", () => {
  it("keeps local-file tools unregistered when telemetry is off", async () => {
    const names = await listedTools(false);

    expect(GATED_TOP_LEVEL_TOOLS.length).toBeGreaterThan(0);
    for (const toolName of GATED_TOP_LEVEL_TOOLS) {
      expect(names, `${toolName} must not be registered in cloud mode`).not.toContain(toolName);
    }
    // 对照组：未被裁的工具仍然可用，避免「整个工具面被关掉」的假绿。
    expect(names).toContain("queryEnv");
  });

  it("returns the same tool set whether telemetry is on or off", async () => {
    const withTelemetry = await listedTools(true);
    const withoutTelemetry = await listedTools(false);

    expect([...withoutTelemetry].sort()).toEqual([...withTelemetry].sort());
  });

  it("also filters server.toolDefs (external hosts re-register from it)", async () => {
    const server = await createCloudBaseMcpServer({
      cloudMode: true,
      enableTelemetry: false,
      pluginsEnabled: PLUGINS,
    });
    try {
      const names = server.toolDefs.map((tool) => tool.name);
      for (const toolName of GATED_TOP_LEVEL_TOOLS) {
        expect(names, `${toolName} must not appear in toolDefs`).not.toContain(toolName);
      }
    } finally {
      await server.close().catch(() => undefined);
    }
  });

  it("still installs the execution guards when telemetry is off", async () => {
    const server = await createCloudBaseMcpServer({
      cloudMode: true,
      enableTelemetry: false,
      pluginsEnabled: PLUGINS,
    });
    try {
      const handler = server.toolDefs.find((tool) => tool.name === "queryEnv")?.handler;
      expect(handler).toBeDefined();
      // 装了 wrapper 时 toolDefs 里存的是 wrappedHandler；没装则存原始工具 handler。
      // 用源码特征判断，不发起任何工具调用、不出网。
      const source = String(handler);
      expect(source).toContain("guardCredentialWrite");
      expect(source).toContain("guardDestructiveAction");
    } finally {
      await server.close().catch(() => undefined);
    }
  });
});
