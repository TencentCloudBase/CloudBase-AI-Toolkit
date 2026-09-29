import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRepeatGuardForTests } from "../utils/repeat-error-guard.js";
import { ToolPayloadError } from "../utils/tool-result.js";
import {
  clearToolOutcomes,
  FEEDBACK_SESSION_LIMIT,
  readRepeatPeak,
  recordToolOutcome,
} from "../utils/feedback-session.js";
import { wrapServerWithTelemetry } from "../utils/tool-wrapper.js";
import {
  buildCasePrefillUrl,
  buildFeedbackPayload,
  FEEDBACK_TOOL_NAME,
  registerFeedbackTools,
  resolveMcpVersion,
} from "./feedback.js";

const ENV_ID = "env-should-not-appear-9f3c";
const SECRET_ID = "AKIDshouldnotappear999";
const HIDDEN_COLLECTION = "orders_collection";
const HIDDEN_FUNCTION = "payCallbackFn";

function makeServer() {
  return {
    ide: undefined as string | undefined,
    client: undefined as string | undefined,
    cloudBaseOptions: {
      envId: ENV_ID,
      secretId: SECRET_ID,
      secretKey: "secret-key-should-not-appear",
    },
  };
}

describe("feedback drafts", () => {
  const previousPackageVersion = process.env.npm_package_version;
  const previousIde = process.env.INTEGRATION_IDE;
  const previousClient = process.env.CLOUDBASE_MCP_CLIENT;
  const previousCaseUrl = process.env.CLOUDBASE_FEEDBACK_CNB_NEW_ISSUE_URL;

  beforeEach(() => {
    __resetRepeatGuardForTests();
    process.env.npm_package_version = "2.34.5-test";
    delete process.env.INTEGRATION_IDE;
    delete process.env.CLOUDBASE_MCP_CLIENT;
    delete process.env.CLOUDBASE_FEEDBACK_CNB_NEW_ISSUE_URL;
  });

  afterEach(() => {
    if (previousPackageVersion === undefined) {
      delete process.env.npm_package_version;
    } else {
      process.env.npm_package_version = previousPackageVersion;
    }
    if (previousIde === undefined) {
      delete process.env.INTEGRATION_IDE;
    } else {
      process.env.INTEGRATION_IDE = previousIde;
    }
    if (previousClient === undefined) {
      delete process.env.CLOUDBASE_MCP_CLIENT;
    } else {
      process.env.CLOUDBASE_MCP_CLIENT = previousClient;
    }
    if (previousCaseUrl === undefined) {
      delete process.env.CLOUDBASE_FEEDBACK_CNB_NEW_ISSUE_URL;
    } else {
      process.env.CLOUDBASE_FEEDBACK_CNB_NEW_ISSUE_URL = previousCaseUrl;
    }
  });

  it("does not register a tool until the public name is set", () => {
    const registerTool = vi.fn();
    registerFeedbackTools({ registerTool } as any);
    expect(FEEDBACK_TOOL_NAME).toBe("");
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("returns a draft only before the user confirms", () => {
    process.env.CLOUDBASE_FEEDBACK_CNB_NEW_ISSUE_URL = "https://example.test/issues/new";
    const server = makeServer();
    const payload = buildFeedbackPayload({
      server,
      channel: "case",
      confirmed: false,
    });

    expect(payload.submittable).toBe(false);
    expect(payload.url).toBeUndefined();
    expect(payload.draft.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).not.toContain("http");
    expect(payload.draft).toContain("作品名称：留空");
    expect(payload.nextStep).toContain("展示给用户");
  });

  it("leaves unknown fields blank", () => {
    const server = makeServer();
    const payload = buildFeedbackPayload({
      server,
      channel: "case",
      confirmed: false,
    });

    expect(payload.draft).toContain("所用模型：留空");
    expect(payload.draft).toContain("作品名称：留空");
    expect(payload.draft).toContain("公网访问地址：留空");
    expect(payload.draft).toContain("Agent / CLI：留空");
    expect(payload.draft).toContain("部署耗时：留空");
    expect(payload.draft).toContain("部署时间：留空");
    expect(payload.draft).toContain("用到的云资源：留空");
    expect(payload.draft).not.toContain("DeepSeek");
    expect(payload.draft).not.toContain("tcloudbaseapp.com");
  });

  it("falls back to npm_package_version when the build version is absent", () => {
    expect(resolveMcpVersion(undefined, "2.34.5-test")).toBe("2.34.5-test");
    expect(resolveMcpVersion("9.9.9", "2.34.5-test")).toBe("9.9.9");
    expect(resolveMcpVersion("  ", undefined)).toBe("");

    const payload = buildFeedbackPayload({
      server: makeServer(),
      channel: "case",
      confirmed: false,
    });
    expect(payload.draft).toContain("MCP 版本：2.34.5-test");
  });

  it("omits env id, secrets, collection names, and function names from the retrospective", () => {
    const server = makeServer();
    server.ide = "Cursor";
    recordToolOutcome(server, {
      toolName: "manageHosting",
      durationMs: 10,
      failed: false,
      at: "2026-09-29T06:00:00.000Z",
    });
    recordToolOutcome(server, {
      toolName: "queryPgDatabase",
      durationMs: 10,
      failed: false,
      at: "2026-09-29T06:01:00.000Z",
    });
    recordToolOutcome(server, {
      toolName: "manageFunctions",
      durationMs: 10,
      failed: true,
      at: "2026-09-29T06:02:00.000Z",
    });
    recordToolOutcome(server, {
      toolName: HIDDEN_COLLECTION,
      durationMs: 10,
      failed: true,
      at: "2026-09-29T06:03:00.000Z",
    });
    recordToolOutcome(server, {
      toolName: HIDDEN_FUNCTION,
      durationMs: 10,
      failed: true,
      at: "2026-09-29T06:04:00.000Z",
    });

    const payload = buildFeedbackPayload({
      server,
      channel: "retrospective",
      confirmed: true,
    });

    expect(payload.draft).toContain("静态托管");
    expect(payload.draft).toContain("云数据库（PostgreSQL）");
    expect(payload.draft).toContain("manageFunctions");
    expect(payload.draft).not.toContain("云函数");
    expect(payload.draft).not.toContain(ENV_ID);
    expect(payload.draft).not.toContain(SECRET_ID);
    expect(payload.draft).not.toContain("secret-key-should-not-appear");
    expect(payload.draft).not.toContain(HIDDEN_COLLECTION);
    expect(payload.draft).not.toContain(HIDDEN_FUNCTION);
    expect(payload.draft).not.toMatch(/envId|secretId|secretKey/i);
    expect(payload.url).toBeUndefined();
    expect(payload.nextStep).toContain("复制");
    expect(payload.submittable).toBe(false);
  });

  it("leaves turn counts blank when there is no local signal", () => {
    const payload = buildFeedbackPayload({
      server: makeServer(),
      channel: "retrospective",
      confirmed: false,
    });

    expect(payload.draft).toContain("总轮次：留空");
    expect(payload.draft).toContain("阶段分布：留空");
    expect(payload.draft).toContain("额外轮次：留空");
    expect(payload.draft).not.toMatch(/总轮次：\s*\d+/);
    expect(payload.draft).not.toMatch(/阶段分布：.*\d+/);
    expect(payload.submittable).toBe(false);
    expect(payload.url).toBeUndefined();
  });

  it("reports verifiable failures and repeat-guard peak without inventing turns", async () => {
    const errorMessage = `${ENV_ID} leaked in error text`;
    const server = makeServer();
    let handlerImpl: () => Promise<any> = async () => {
      throw new ToolPayloadError({ code: "ENV_REQUIRED", message: errorMessage });
    };
    let wrappedHandler: ((args: any) => Promise<any>) | undefined;
    const mcpServer = {
      ...server,
      registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
        wrappedHandler = handler;
        return undefined;
      }),
      logger: vi.fn(),
    };
    wrapServerWithTelemetry(mcpServer as any);
    mcpServer.registerTool("deployApply", {}, () => handlerImpl());

    for (let index = 0; index < 3; index += 1) {
      await expect(wrappedHandler?.({})).rejects.toBeInstanceOf(ToolPayloadError);
    }
    handlerImpl = async () => ({ content: [{ type: "text", text: "ok" }] });
    await wrappedHandler?.({});

    const payload = buildFeedbackPayload({
      server: mcpServer,
      channel: "retrospective",
      confirmed: false,
    });

    expect(readRepeatPeak(mcpServer)).toBe(3);
    expect(payload.draft).toContain("总轮次：留空");
    expect(payload.draft).toContain("deployApply ×3");
    expect(payload.draft).toContain("峰值 3");
    expect(payload.draft).not.toContain(errorMessage);
    expect(payload.draft).not.toContain(ENV_ID);
    expect(payload.draft).not.toMatch(/总轮次：\s*\d+/);
  });

  it("records resource types and deploy duration from the wrapped handler", async () => {
    const server = makeServer();
    server.ide = "Cursor";
    server.client = "cursor";
    let wrappedHandler: ((args: any) => Promise<any>) | undefined;
    const mcpServer = {
      ...server,
      registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
        wrappedHandler = handler;
        return undefined;
      }),
      logger: vi.fn(),
    };
    wrapServerWithTelemetry(mcpServer as any);
    mcpServer.registerTool("deployBuild", {}, async () => ({
      content: [{ type: "text", text: JSON.stringify({ success: true, functionName: HIDDEN_FUNCTION }) }],
    }));

    await wrappedHandler?.({
      envId: ENV_ID,
      functionName: HIDDEN_FUNCTION,
      collectionName: HIDDEN_COLLECTION,
    });

    const payload = buildFeedbackPayload({
      server: mcpServer,
      channel: "case",
      confirmed: true,
      caseIssueBaseUrl: "https://example.test/issues/new",
    });

    expect(payload.submittable).toBe(true);
    expect(payload.url).toContain("template=1-case-showcase.yml");
    expect(payload.url).toContain("issue[description]=");
    expect(payload.draft).toContain("deployBuild");
    expect(payload.draft).toContain("无法区分云端构建与端到端");
    expect(payload.draft).toContain("Agent / CLI：Cursor / cursor");
    expect(payload.draft).not.toContain(HIDDEN_FUNCTION);
    expect(payload.draft).not.toContain(HIDDEN_COLLECTION);
    expect(payload.draft).not.toContain(ENV_ID);
    expect(payload.draft).toMatch(/部署时间：\d{4}-\d{2}-\d{2}T/);
    clearToolOutcomes(mcpServer);
  });

  it("does not emit a case link when the collection repository is unset", () => {
    const payload = buildFeedbackPayload({
      server: makeServer(),
      channel: "case",
      confirmed: true,
    });
    expect(payload.confirmed).toBe(true);
    expect(payload.submittable).toBe(false);
    expect(payload.url).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("http");
  });

  it("keeps the prefill query on the configured base", () => {
    const url = buildCasePrefillUrl("https://example.test/issues/new?unused=1", "作品名称：留空");
    expect(url.startsWith("https://example.test/issues/new?")).toBe(true);
    expect(url).toContain("template=1-case-showcase.yml");
    expect(url).not.toContain("unused=1");
  });

  it("drops outcomes beyond the session buffer", () => {
    const server = makeServer();
    for (let index = 0; index < FEEDBACK_SESSION_LIMIT + 5; index += 1) {
      recordToolOutcome(server, {
        toolName: "manageHosting",
        durationMs: index,
        failed: false,
        at: "2026-09-29T06:00:00.000Z",
      });
    }
    const payload = buildFeedbackPayload({
      server,
      channel: "case",
      confirmed: false,
    });
    expect(payload.draft).toContain("静态托管");
  });
});
