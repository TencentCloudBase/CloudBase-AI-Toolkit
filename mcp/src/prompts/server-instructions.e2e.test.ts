import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCloudBaseMcpServer } from "../server.js";
import { readClientCapabilitiesFromServer } from "../utils/telemetry.js";
import { SERVER_INSTRUCTIONS } from "./server-instructions.js";

/**
 * 为什么要有这一层：单测只证明「常量写对了」，证明不了「它真的进了 initialize 返回体」——
 * 中间隔着 McpServer 的构造参数与 SDK 的 `_oninitialize` 拼装。这里走一次真实握手，
 * 用客户端的 `getInstructions()` 断言，端到端锁住这条链路。
 *
 * 这也是本项目里唯一能被客户端看到、且**我们改一行就全网生效**的引导位（`instructions`
 * 不属于 tools/list，不占工具面上下文）。
 */
async function handshake(
  options: { lang?: string } = {},
  clientCapabilities?: Record<string, unknown>,
) {
  const server = await createCloudBaseMcpServer({
    pluginsEnabled: [],
    enableTelemetry: false,
    ...options,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: "e2e-client", version: "1.0.0" },
    ...(clientCapabilities ? [{ capabilities: clientCapabilities as never }] : []),
  );
  await client.connect(clientTransport);

  const instructions = client.getInstructions();
  const capabilities = client.getServerCapabilities();
  const clientCaps = readClientCapabilitiesFromServer(server);
  await client.close();
  await server.close();

  return { instructions, capabilities, clientCaps };
}

describe("initialize 返回体里的 instructions（真实握手）", () => {
  it("默认 zh：非空、且与常量一致", async () => {
    const { instructions, capabilities } = await handshake();
    expect(instructions).toBe(SERVER_INSTRUCTIONS.zh);
    expect(instructions?.length).toBeGreaterThan(0);
    // 不能因为加了 instructions 把原有的 tools 能力弄丢
    expect(capabilities?.tools).toBeDefined();
  });

  it("lang=en 时给英文版", async () => {
    const { instructions } = await handshake({ lang: "en" });
    expect(instructions).toBe(SERVER_INSTRUCTIONS.en);
  });

  it("实例语言在构造时就定稿（不是等工具注册才生效）", async () => {
    // 回归防线：instructions 只能在构造参数里给，一旦有人把它挪到 registerTool 之后，
    // 这里会立刻变成 zh（默认值），而工具 description 仍是 en —— 用不一致暴露问题。
    const { instructions } = await handshake({ lang: "en" });
    expect(instructions).not.toBe(SERVER_INSTRUCTIONS.zh);
  });
});

/**
 * A3 的端到端版本：能力声明从「客户端构造参数 → initialize → SDK 缓存 → 我们的读取器」
 * 全链路走通，而不是只测自己的解构函数。
 */
describe("客户端能力上报链路（真实握手）", () => {
  it("客户端声明 elicitation + ui 时能读到（这是本地支持矩阵的唯一来源）", async () => {
    const { clientCaps } = await handshake({}, {
      elicitation: { form: {} },
      extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
    });

    expect(clientCaps).toMatchObject({
      elicitationForm: true,
      ui: true,
      summary: "elicitation:form,ui",
    });
  });

  it("空 elicitation {} 由 SDK 预处理成 form —— 这正是判「能不能弹表单」的依据", async () => {
    const { clientCaps } = await handshake({}, { elicitation: {} });

    expect(clientCaps).toMatchObject({ elicitationForm: true, summary: "elicitation:form" });
  });

  it("客户端什么都没声明 → summary=none（与「握手未完成」区分开）", async () => {
    const { clientCaps } = await handshake();

    expect(clientCaps).toMatchObject({ elicitationForm: false, ui: false, summary: "none" });
  });
});
