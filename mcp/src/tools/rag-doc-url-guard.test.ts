import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";

const { mockCreateCloudBaseManagerWithOptions } = vi.hoisted(() => ({
  mockCreateCloudBaseManagerWithOptions: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  createCloudBaseManagerWithOptions: mockCreateCloudBaseManagerWithOptions,
}));

import {
  assertNoHostInDocPath,
  registerRagTools,
  toSiteRelativeDocPath,
} from "./rag.js";

function createMockServer() {
  const tools: Record<string, { handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    registerTool: vi.fn(
      (name: string, _meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { handler };
      },
    ),
  } as unknown as ExtendedMcpServer;

  return { server, tools };
}

async function callReadDoc(docPath: string) {
  const { server, tools } = createMockServer();
  const readDoc = vi.fn().mockResolvedValue("# 快速开始\n正文");
  mockCreateCloudBaseManagerWithOptions.mockReturnValue({ docs: { readDoc } });

  await registerRagTools(server);

  const result = await tools.searchKnowledgeBase.handler({
    mode: "docs",
    action: "readDoc",
    docPath,
  });

  return { readDoc, body: JSON.parse(result.content[0].text) };
}

describe("searchKnowledgeBase readDoc never lets the caller pick the fetch host", () => {
  beforeEach(() => {
    mockCreateCloudBaseManagerWithOptions.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a site-relative path and lets the SDK resolve it against the docs base", async () => {
    const { readDoc, body } = await callReadDoc("/quick-start");

    expect(readDoc).toHaveBeenCalledWith("/quick-start.md");
    expect(body.success).toBe(true);
  });

  it("strips the host from an official docs address before handing it to the SDK", async () => {
    // `category.json`（findByName / listModuleDocs 的数据源）里 1016 个文档值全是这个形态，
    // AI 拿到之后会原样喂回 readDoc —— 必须继续可用，但只能以「站内路径」的形式送达 SDK。
    const { readDoc, body } = await callReadDoc(
      "https://docs.cloudbase.net/quick-start/index",
    );

    expect(readDoc).toHaveBeenCalledWith("/quick-start.md");
    expect(body.success).toBe(true);
  });

  it("keeps the anchor of a searchDocs hit while still dropping its host", async () => {
    const { readDoc, body } = await callReadDoc(
      "https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/mcp-tools#searchknowledgebase",
    );

    expect(readDoc).toHaveBeenCalledWith(
      "/ai/cloudbase-ai-toolkit/mcp-tools.md#searchknowledgebase",
    );
    expect(body.success).toBe(true);
  });

  it("drops the query string, which is not part of the site's `.md` addressing", async () => {
    const { readDoc } = await callReadDoc(
      "https://docs.cloudbase.net/quick-start?from=search",
    );

    expect(readDoc).toHaveBeenCalledWith("/quick-start.md");
  });

  it("treats a trailing-dot docs host as the same host", async () => {
    const { readDoc } = await callReadDoc(
      "https://docs.cloudbase.net./quick-start",
    );

    expect(readDoc).toHaveBeenCalledWith("/quick-start.md");
  });

  it.each([
    ["loopback", "http://127.0.0.1:8080/secret.md"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/iam/security-credentials/"],
    ["rfc1918", "http://10.0.0.5/internal.md"],
    ["arbitrary host", "https://evil.example.com/doc.md"],
    ["protocol-relative", "//evil.example.com/doc.md"],
    ["non-http scheme", "file:///etc/passwd"],
    ["host suffix trick", "https://docs.cloudbase.net.evil.example.com/doc.md"],
    ["userinfo trick", "https://docs.cloudbase.net@evil.example.com/doc.md"],
    ["registrable TLD swap", "https://docs.cloudbase.net.md/doc.md"],
    ["uppercase loopback", "HTTP://127.0.0.1/secret.md"],
  ])("refuses %s without issuing any request", async (_label, docPath) => {
    const { readDoc, body } = await callReadDoc(docPath);

    expect(readDoc).not.toHaveBeenCalled();
    expect(body.success).toBe(false);
    expect(body.message).toContain("docs.cloudbase.net");
    expect(body.message).toContain(docPath);
  });

  it("asks for a concrete path when the input carries a host but no path", async () => {
    const { readDoc, body } = await callReadDoc("https://docs.cloudbase.net");

    expect(readDoc).not.toHaveBeenCalled();
    expect(body.success).toBe(false);
    expect(body.message).toContain("https://docs.cloudbase.net");
    expect(body.message).toContain("路径");
  });
});

describe("toSiteRelativeDocPath", () => {
  it("passes relative paths through and strips the host from official docs addresses", () => {
    expect(toSiteRelativeDocPath("/quick-start")).toBe("/quick-start");
    expect(
      toSiteRelativeDocPath("https://docs.cloudbase.net/quick-start/index"),
    ).toBe("/quick-start/index");
    expect(toSiteRelativeDocPath("https://docs.cloudbase.net./x#h")).toBe("/x#h");
  });

  it("refuses any other host, including look-alikes", () => {
    expect(() => toSiteRelativeDocPath("https://evil.example.com/x")).toThrow();
    expect(() =>
      toSiteRelativeDocPath("https://docs.cloudbase.net.evil.example.com/x"),
    ).toThrow();
    expect(() => toSiteRelativeDocPath("https://docs.cloudbase.net.md/x")).toThrow();
    expect(() => toSiteRelativeDocPath("http://127.0.0.1/x")).toThrow();
    expect(() => toSiteRelativeDocPath("file:///etc/passwd")).toThrow();
  });
});

describe("assertNoHostInDocPath", () => {
  it("accepts host-free paths and rejects anything that carries a host", () => {
    expect(() => assertNoHostInDocPath("/quick-start.md#step-1")).not.toThrow();
    expect(() => assertNoHostInDocPath("//evil.example.com/x.md")).toThrow();
    expect(() => assertNoHostInDocPath("https://evil.example.com/x.md")).toThrow();
  });
});
