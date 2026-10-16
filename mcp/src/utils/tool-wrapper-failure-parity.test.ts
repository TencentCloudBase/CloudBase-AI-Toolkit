import { describe, expect, it, vi, afterEach } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapServerWithTelemetry } from "./tool-wrapper.js";
import { buildJsonToolResult, buildTextErrorResult } from "./tool-result.js";
import { reportToolCall } from "./telemetry.js";

vi.mock("./cloud-mode.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cloud-mode.js")>();
  return { ...actual, shouldRegisterTool: vi.fn(() => true) };
});

// 只替掉"出网"的两处，其余（尤其是 elicitation 链路用的 extractClientCapabilities）保持真实：
// 全靠 mock 会把护栏判成"客户端不支持 form"从而放行，用例就测不到拦截路径了。
vi.mock("./telemetry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./telemetry.js")>();
  return {
    ...actual,
    reportToolCall: vi.fn(() => Promise.resolve()),
    reportElicitationResult: vi.fn(() => Promise.resolve()),
  };
});

/**
 * 「工具自己返回的失败」必须与「抛错」同款收尾（#50）：
 * 遥测按失败记、文案吃同一套增强 + RequestId + 版本页脚；**护栏拦截的返回不算失败**。
 *
 * 这些断言必须在"非测试环境"下跑：包装层对抛错本来就有 `isTestEnvironment` 短路
 * （测试里不增强、不阻断），所以只有把 NODE_ENV/VITEST 摘掉，才能比较两条路径的真实文案。
 */
function withProductionLikeEnv<T>(run: () => Promise<T>) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVitest = process.env.VITEST;
  delete process.env.NODE_ENV;
  delete process.env.VITEST;
  return run().finally(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = previousVitest;
    }
  });
}

type CapturedTool = { meta: unknown; handler: (args: unknown, extra?: unknown) => Promise<unknown> };

/** 最小的 wrapper 宿主：只捕获 registerTool 的 handler */
function createHost(tools: Record<string, (args: any) => Promise<unknown>>) {
  const captured = new Map<string, CapturedTool>();
  const server = {
    registerTool: (
      name: string,
      meta: unknown,
      handler: (args: unknown, extra?: unknown) => Promise<unknown>,
    ) => {
      captured.set(name, { meta, handler });
      return undefined;
    },
    logger: vi.fn(),
    cloudBaseOptions: { envId: "env-parity" },
    ide: "Cursor",
  } as any;

  wrapServerWithTelemetry(server);
  for (const [name, handler] of Object.entries(tools)) {
    server.registerTool(name, {}, handler);
  }
  return { captured, server };
}

const BOOM = "boom: deploy rejected";

function lastCall() {
  const calls = vi.mocked(reportToolCall).mock.calls;
  return calls[calls.length - 1]?.[0] as Record<string, unknown> | undefined;
}

/** 取某次遥测上报里的文案 */
function textOf(result: unknown): string {
  const content = (result as any)?.content ?? [];
  const item = content.find((entry: any) => entry?.type === "text" && typeof entry.text === "string");
  return item?.text ?? "";
}

afterEach(() => {
  vi.mocked(reportToolCall).mockClear();
});

describe("返回的失败与抛错同等收尾", () => {
  it("同一条底层错误：抛 vs 返回 ⇒ 客户端文案逐字相同，遥测都按失败记", async () => {
    await withProductionLikeEnv(async () => {
      vi.mocked(reportToolCall).mockClear();
      const { captured } = createHost({
        throws: async () => {
          throw new Error(BOOM);
        },
        returns: async () => buildTextErrorResult(BOOM),
      });

      let thrownText = "";
      let thrownError = "";
      try {
        await captured.get("throws")!.handler({});
      } catch (error) {
        thrownText = error instanceof Error ? error.message : String(error);
      }
      thrownError = String(lastCall()?.error ?? "");

      const returned = await captured.get("returns")!.handler({});
      const returnedText = textOf(returned);
      const returnedTelemetry = lastCall();

      // ① 文案逐字相同（同一处构造：增强文案 + RequestId + 版本页脚）
      expect(returnedText).toBe(thrownText);
      expect(returnedText).toContain(BOOM);
      expect(returnedText).toMatch(/📦 CloudBase MCP v/);
      // 遥测口径也一致
      expect(thrownError).toBe(returnedTelemetry?.error);
      expect(returnedTelemetry).toMatchObject({ toolName: "returns", success: false });
      expect(typeof returnedTelemetry?.error).toBe("string");
      // 失败回执必须带 isError（客户端唯一可靠的失败标记）
      expect((returned as any).isError).toBe(true);
    });
  });

  it("结构化 JSON 失败回执：只增强 message 字段，其余字段与可解析性都保住", async () => {
    await withProductionLikeEnv(async () => {
      vi.mocked(reportToolCall).mockClear();
      const { captured } = createHost({
        returnsJson: async () =>
          buildJsonToolResult({
            success: false,
            errorCode: "HOSTING_UPLOAD_FAILED",
            message: BOOM,
            nextActions: [{ tool: "queryHosting", action: "findFiles" }],
          }),
      });

      const returned = await captured.get("returnsJson")!.handler({});
      const parsed = JSON.parse(textOf(returned));

      expect(parsed.success).toBe(false);
      expect(parsed.errorCode).toBe("HOSTING_UPLOAD_FAILED");
      // 结构化字段一个不丢
      expect(parsed.nextActions).toEqual([{ tool: "queryHosting", action: "findFiles" }]);
      // message 被增强（与抛错同款结尾），且 JSON 仍可解析
      expect(String(parsed.message)).toContain(BOOM);
      expect(String(parsed.message)).toMatch(/📦 CloudBase MCP v/);
      expect((returned as any).isError).toBe(true);
      expect(lastCall()).toMatchObject({ toolName: "returnsJson", success: false });
    });
  });

  it("成功路径一字不改：结果原样返回、遥测仍记成功", async () => {
    await withProductionLikeEnv(async () => {
      vi.mocked(reportToolCall).mockClear();
      const payload = { success: true, data: { accessUrl: "https://example.test" } };
      const { captured } = createHost({ ok: async () => buildJsonToolResult(payload) });

      const returned = await captured.get("ok")!.handler({});

      expect(textOf(returned)).toBe(JSON.stringify(payload, null, 2));
      expect((returned as any).isError).toBeUndefined();
      expect(lastCall()).toMatchObject({ toolName: "ok", success: true });
      expect(lastCall()?.error).toBeUndefined();
    });
  });
});

describe("护栏拦截的返回不是失败", () => {
  it("用户拒绝执行后：遥测不得记为失败、文案不得被增强成错误", async () => {
    const server = new McpServer({ name: "parity-guard-server", version: "0.0.1" });
    (server as unknown as { cloudBaseOptions?: unknown }).cloudBaseOptions = { envId: "env-parity" };
    wrapServerWithTelemetry(server);

    const handler = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "handler 执行了（不该发生）" }],
    }));
    server.registerTool(
      "manageFunctions",
      {
        title: "manageFunctions",
        description: "parity guard probe",
        inputSchema: { action: z.string(), functionName: z.string().optional() },
      },
      handler,
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: "parity-guard-client", version: "0.0.1" },
      { capabilities: { elicitation: { form: {} } } },
    );
    client.setRequestHandler(ElicitRequestSchema, async () => {
      // 护栏判据是耗时：<500ms 视为客户端自动审批（按放行）。这里模拟"人点的拒绝"。
      await new Promise((resolve) => setTimeout(resolve, 600));
      return { action: "decline" } as never;
    });

    await withProductionLikeEnv(async () => {
      vi.mocked(reportToolCall).mockClear();
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        const call = await client.callTool({
          name: "manageFunctions",
          arguments: { action: "deleteFunction", functionName: "hello" },
        });

        // 没执行：这是"用户的选择"，不是失败
        expect(handler).not.toHaveBeenCalled();
        const text = textOf(call);
        expect(text).not.toMatch(/📦 CloudBase MCP v/);
        expect(text).not.toContain("github.com");
        // 遥测：不得出现失败
        const telemetry = lastCall();
        expect(telemetry).toMatchObject({ toolName: "manageFunctions", success: true });
        expect(telemetry?.error).toBeUndefined();
      } finally {
        await client.close().catch(() => undefined);
        await server.close().catch(() => undefined);
      }
    });
  });
});
