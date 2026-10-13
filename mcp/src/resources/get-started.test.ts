import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCloudBaseMcpServer } from "../server.js";
import { t } from "../i18n/index.js";
import {
  GET_STARTED_MIME_TYPE,
  GET_STARTED_RESOURCE_URI,
  buildGetStartedHtml,
  type GetStartedStatus,
} from "./get-started.js";

/**
 * 面板 HTML 是「纯 ASCII 模板 + 词典注入」，因此这层只锁三件事：
 *   1. 零外链（宿主 CSP 默认 deny-all，任何外链都会被拦）；
 *   2. bridge 需要的消息名都在（否则面板与宿主握不上手）；
 *   3. 注入值被转义、面板里没有任何密钥类字段。
 */
const UI_RESOURCE_URI = GET_STARTED_RESOURCE_URI;

const sampleStatus: GetStartedStatus = {
  envId: "env-abc123",
  site: "domestic",
  region: "ap-shanghai",
  credentialScope: "account",
};

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

  it("含 bridge 需要的全部消息名", () => {
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
  });

  it("zh / en 两个实例产出不同 HTML，且各自语言文案正确", () => {
    const zhHtml = buildGetStartedHtml("zh", sampleStatus);
    const enHtml = buildGetStartedHtml("en", sampleStatus);

    expect(zhHtml).not.toBe(enHtml);
    expect(zhHtml).toContain(t("mcpUi.title", undefined, "zh"));
    expect(enHtml).toContain(t("mcpUi.title", undefined, "en"));
    expect(zhHtml).toContain(t("mcpUi.paths.check.button", undefined, "zh"));
    expect(enHtml).toContain(t("mcpUi.paths.check.button", undefined, "en"));
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
});
