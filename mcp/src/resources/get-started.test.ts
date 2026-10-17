import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCloudBaseMcpServer } from "../server.js";
import { t } from "../i18n/index.js";
import { debug } from "../utils/logger.js";
import {
  GET_STARTED_MIME_TYPE,
  GET_STARTED_RESOURCE_URI,
  buildGetStartedHtml,
  type GetStartedStatus,
} from "./get-started.js";

// 只有 read 回调的本地日志会被断言；其余 logger 调用保留真实实现。
vi.mock("../utils/logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/logger.js")>();
  return { ...actual, debug: vi.fn() };
});

/**
 * 面板 HTML 是「纯 ASCII 模板 + 词典注入」，因此这层只锁三件事：
 *   1. 零外链（宿主默认 CSP 只允许自身与内联，并禁止一切外部网络，任何外链都会被拦）；
 *   2. bridge 需要的消息名都在（否则面板与宿主握不上手）；
 *   3. 注入值被转义、面板里没有任何密钥类字段。
 */
const UI_RESOURCE_URI = GET_STARTED_RESOURCE_URI;

const sampleStatus: GetStartedStatus = {
  envId: "env-abc123",
  site: "domestic",
  region: "ap-shanghai",
};

/**
 * 面板正文里不允许出现的内部枚举 —— 用户在界面上看到的一律是人话。
 * 它们只允许出现在「查看原始返回」折叠区（运行时渲染的原始 JSON）里。
 */
const INTERNAL_ENUMS = [
  "domestic",
  "intl",
  "single_env",
  "account",
  "ap-",
  "READY",
  "auth(status)",
];

/** 可见正文 = 去掉 <script> 逻辑与原始返回折叠区之后的标记（枚举在脚本查表里是必要的）。 */
function visibleMarkup(html: string): string {
  return html
    .replace(/<script>[\s\S]*?<\/script>/gi, "")
    .replace(/<details[\s\S]*?<\/details>/gi, "");
}

describe("get-started 面板 HTML", () => {
  it("零外链：不含 http(s)、<link、以及任何外部 src=/href=", () => {
    const html = buildGetStartedHtml("zh", sampleStatus);

    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
    expect(html).not.toContain('src="//');
    expect(html).not.toContain("<link");
    expect(html).not.toMatch(/\bsrc=/);
    expect(html).not.toMatch(/\bhref=/);
  });

  it("含 bridge 需要的全部消息名，且面板发起的调用只有 auth 的 status / set_env", () => {
    const html = buildGetStartedHtml("en", sampleStatus);

    for (const method of [
      "ui/initialize",
      "ui/notifications/initialized",
      "ui/notifications/size-changed",
      "ui/message",
      "tools/call",
    ]) {
      expect(html).toContain(method);
    }

    // Three call sites on purpose: 「重新检查」(status), and one click on an environment row
    // (set_env followed by status so the card shows what the server actually bound). Every one of
    // them targets the same tool, so the panel still has no other way to touch the server.
    const calls = html.match(/\{ name: "([^"]+)", arguments: \{ action: "([^"]+)"/g) ?? [];
    expect(calls.length).toBe(3);
    expect(calls.every((call) => call.startsWith('{ name: "auth"'))).toBe(true);
    expect(html.split('"tools/call"').length - 1).toBe(3);
    expect(html).toContain('action: "set_env"');
  });

  it("可选环境只画结果里真有的候选：卡片默认隐藏，行从 env_candidates 生成", () => {
    const zhHtml = buildGetStartedHtml("zh", sampleStatus);
    const enHtml = buildGetStartedHtml("en", sampleStatus);

    // 默认不占位：没有候选时卡片必须整块收起来，不能留一个空壳。
    expect(zhHtml).toMatch(/id="env-card" hidden/);
    expect(zhHtml).toContain('id="env-list"');
    // 行由 env_candidates 现场造，不预置任何环境名。
    expect(zhHtml).toContain("payload.env_candidates");
    expect(zhHtml).toContain('createElement("button")');
    // 文案走词典，两种语言不同。
    expect(zhHtml).toContain("可选环境");
    expect(enHtml).toContain("Environments");
    expect(enHtml).not.toContain("可选环境");
  });

  it("正文不出现内部枚举（只允许在「查看原始返回」折叠区里）", () => {
    for (const lang of ["zh", "en"] as const) {
      const markup = visibleMarkup(buildGetStartedHtml(lang, sampleStatus));
      for (const token of INTERNAL_ENUMS) {
        expect(markup, `${lang} 正文不应出现内部枚举 ${token}`).not.toContain(token);
      }
    }
    // 地图类枚举确实进了脚本查表（否则上面这条会因为"压根没翻"而虚假通过）
    const html = buildGetStartedHtml("en", sampleStatus);
    expect(html).toContain("ap-shanghai");
    expect(visibleMarkup(html)).toContain("Shanghai");
    expect(visibleMarkup(html)).toContain("China");
  });

  it("zh / en 两个实例产出不同 HTML，且各自语言文案正确", () => {
    const zhHtml = buildGetStartedHtml("zh", sampleStatus);
    const enHtml = buildGetStartedHtml("en", sampleStatus);

    expect(zhHtml).not.toBe(enHtml);
    expect(zhHtml).toContain(t("mcpUi.title", undefined, "zh"));
    expect(enHtml).toContain(t("mcpUi.title", undefined, "en"));
    expect(zhHtml).toContain(t("mcpUi.next.action.refresh", undefined, "zh"));
    expect(enHtml).toContain(t("mcpUi.next.action.refresh", undefined, "en"));
    // 反向：英文面板里不该出现中文标题，中文面板里不该出现英文标题
    expect(enHtml).not.toContain(t("mcpUi.title", undefined, "zh"));
    expect(zhHtml).not.toContain(t("mcpUi.title", undefined, "en"));
  });

  it("注入含 '<script>' 的恶意 envId 会被 HTML 转义", () => {
    const malicious = '"><script>alert(1)</script>';
    const html = buildGetStartedHtml("zh", { ...sampleStatus, envId: malicious });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("面板不含任何密钥类字段名", () => {
    const html = buildGetStartedHtml("zh", sampleStatus);

    for (const secretKey of ["secretId", "secretKey", "apiKey", "accessKey", "token"]) {
      expect(html).not.toContain(secretKey);
    }
  });

  it("英文面板保持纯 ASCII（HTML 模板无 CJK 硬编码）", () => {
    const html = buildGetStartedHtml("en", sampleStatus);

    // eslint-disable-next-line no-control-regex
    const nonAscii = html.match(/[^\x00-\x7F]/g) ?? [];
    expect(nonAscii).toEqual([]);
  });

  it("面板脚本不做 HTML 注入：不用 innerHTML / outerHTML / insertAdjacentHTML", () => {
    const html = buildGetStartedHtml("zh", sampleStatus);

    expect(html).not.toContain("innerHTML");
    expect(html).not.toContain("outerHTML");
    expect(html).not.toContain("insertAdjacentHTML");
    expect(html).not.toContain("document.write");
  });
});

/**
 * 协议级：走真实握手（InMemoryTransport），锁住「能力位 + 空列表 + 可读 + 工具挂载」
 * 这一整条链路——单测只证明 HTML 写对了，证明不了它真的进了 initialize / resources/read。
 *
 * 移植自 specs/mcp-ui/probe/verify-ui.mjs 的断言（探针留在 specs/，不随包发布）。
 */
async function handshake() {
  const server = await createCloudBaseMcpServer({
    pluginsEnabled: ["env"],
    enableTelemetry: false,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "mcp-ui-client", version: "0.0.1" });
  await client.connect(clientTransport);

  return { server, client };
}

describe("MCP Apps 资源声明的协议级行为（真实握手）", () => {
  it("initialize 的 capabilities 同时带 extensions ui 与 resources 能力位", async () => {
    const { server, client } = await handshake();
    try {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.tools).toBeDefined();
      expect(capabilities?.resources).toBeDefined();
      expect(
        capabilities?.extensions?.["io.modelcontextprotocol/ui"],
      ).toBeDefined();
      // 必须断言到值：这个 false 是我们在 registerResource 之后用 registerCapabilities
      // 覆盖出来的，依赖 SDK「后写覆盖先写」的顺序——只断言 resources 存在会漏掉静默退回 true。
      expect(capabilities?.resources?.listChanged).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("resources/list 返回空数组（纯 UI 资源不进列表）", async () => {
    const { server, client } = await handshake();
    try {
      const listed = await client.listResources();
      expect(listed.resources).toEqual([]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("resources/read 命中 ui://cloudbase/get-started，MIME 与 HTML 正确", async () => {
    const { server, client } = await handshake();
    try {
      const result = await client.readResource({ uri: UI_RESOURCE_URI });
      expect(result.contents).toHaveLength(1);
      const content = result.contents[0] as {
        uri: string;
        mimeType?: string;
        text?: string;
        _meta?: Record<string, unknown>;
      };
      expect(content.uri).toBe(UI_RESOURCE_URI);
      expect(content.mimeType).toBe(GET_STARTED_MIME_TYPE);
      expect(content.text?.startsWith("<!doctype html>")).toBe(true);
      expect(content.text).toContain("ui/initialize");
      expect((content._meta?.ui as { prefersBorder?: boolean } | undefined)?.prefersBorder).toBe(
        true,
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("英文实例（lang=en）读资源得到英文面板", async () => {
    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["env"],
      enableTelemetry: false,
      lang: "en",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "mcp-ui-client-en", version: "0.0.1" });
    await client.connect(clientTransport);
    try {
      const result = await client.readResource({ uri: UI_RESOURCE_URI });
      const text = (result.contents[0] as { text?: string }).text ?? "";
      expect(text).toContain(t("mcpUi.title", undefined, "en"));
      expect(text).not.toContain(t("mcpUi.title", undefined, "zh"));
      expect(text).toContain('lang="en"');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("读资源时写一条本地 debug 日志（人工验证「宿主确实来拉了」的唯一服务端信号）", async () => {
    const { server, client } = await handshake();
    try {
      await client.readResource({ uri: UI_RESOURCE_URI });

      const call = vi
        .mocked(debug)
        .mock.calls.find(
          (args) => (args[1] as { uri?: string } | undefined)?.uri === UI_RESOURCE_URI,
        );
      expect(call).toBeDefined();
      const payload = call?.[1] as {
        mimeType?: string;
        bytes?: number;
        lang?: string;
      };
      expect(payload.mimeType).toBe(GET_STARTED_MIME_TYPE);
      expect(typeof payload.bytes).toBe("number");
      expect(payload.bytes).toBeGreaterThan(0);
      expect(["zh", "en"]).toContain(payload.lang);
      // 日志里不得出现环境/密钥类值
      expect(JSON.stringify(payload)).not.toMatch(/secret|token|apiKey|env-abc/i);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("auth 的 tools/list 条目带 _meta.ui.resourceUri，且其余字段未变", async () => {
    const { server, client } = await handshake();
    try {
      const listed = await client.listTools();
      const auth = listed.tools.find((tool) => tool.name === "auth");
      expect(auth).toBeDefined();

      // 新增的挂载点
      expect((auth?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri).toBe(
        UI_RESOURCE_URI,
      );
      // _meta 只多了 ui 一个键，category 仍在
      expect(Object.keys(auth?._meta ?? {}).sort()).toEqual(["category", "ui"]);
      expect((auth?._meta as { category?: string } | undefined)?.category).toBe("env");
      // visibility 未设成只含 "model"（缺省即 model + app，面板发起的 tools/call 不会被 reject）
      expect(
        (auth?._meta as { ui?: { visibility?: unknown } } | undefined)?.ui?.visibility,
      ).toBeUndefined();

      // 回归：描述/标题仍由词典解析，逐字未变
      expect(auth?.title).toBe(t("env.authTitle", undefined, "zh"));
      expect(auth?.description).toBe(t("env.authDescription", undefined, "zh"));

      // 回归：inputSchema 仍在，action 枚举仍含 status
      const schema = auth?.inputSchema as {
        properties?: { action?: { enum?: unknown[] } };
      };
      expect(schema.properties?.action?.enum ?? []).toContain("status");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("面板式 tools/call 的参数真的到达处理器（inputSchema 不会静默裁参）", async () => {
    const { server, client } = await handshake();
    try {
      // SDK 会把未写进 inputSchema 的参数静默裁掉（不报错、不日志），所以只有
      // 「处理器实际收到什么」能发现它。这里包一层 auth 的 handler 记录 zod 校验后的 args；
      // `_registeredTools` 是 SDK 内部注册表，字段若被改，本用例会因断言失败而显式暴露。
      const registered = (
        server as unknown as {
          _registeredTools?: Record<
            string,
            { handler: (args: any, extra?: any) => unknown; update: (u: { callback: any }) => void }
          >;
        }
      )._registeredTools?.auth;
      expect(registered).toBeDefined();

      let receivedAction: unknown;
      const originalHandler = registered!.handler;
      registered!.update({
        callback: async (args: any, extra?: any) => {
          receivedAction = args?.action;
          return originalHandler(args, extra);
        },
      });

      await client.callTool({ name: "auth", arguments: { action: "status" } });

      expect(receivedAction).toBe("status");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
