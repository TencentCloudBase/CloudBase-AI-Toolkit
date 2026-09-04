import { describe, expect, it, vi, beforeEach } from "vitest";
import { wrapServerWithTelemetry } from "./tool-wrapper.js";
import { ToolPayloadError } from "./tool-result.js";
import { reportToolCall } from "./telemetry.js";
import { __resetRepeatGuardForTests, REPEAT_GUARD_THRESHOLD } from "./repeat-error-guard.js";

vi.mock("./cloud-mode.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cloud-mode.js")>();
  return {
    ...actual,
    shouldRegisterTool: vi.fn(() => true),
  };
});

vi.mock("./telemetry.js", () => ({
  reportToolCall: vi.fn(() => Promise.resolve()),
  readMcpClientInfoFromServer: vi.fn(() => ({
    name: "test-client",
    version: "0.0.1",
  })),
}));

function withTelemetryEnabled<T>(run: () => Promise<T>) {
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

describe("wrapServerWithTelemetry", () => {
  beforeEach(() => {
    __resetRepeatGuardForTests();
  });

  it("should preserve ToolPayloadError for outer server wrapper", async () => {
    let wrappedHandler: ((args: any) => Promise<any>) | undefined;

    const server = {
      registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
        wrappedHandler = handler;
        return undefined;
      }),
      logger: vi.fn(),
      cloudBaseOptions: undefined,
      ide: "Cursor",
    } as any;

    wrapServerWithTelemetry(server);
    server.registerTool("demo", {}, async () => {
      throw new ToolPayloadError({
        ok: false,
        code: "ENV_REQUIRED",
        message: "当前已登录，但尚未绑定环境，请先调用 auth 工具选择环境。",
        next_step: {
          tool: "auth",
          action: "set_env",
          required_params: ["envId"],
        },
      });
    });

    await expect(wrappedHandler?.({})).rejects.toMatchObject({
      name: "ToolPayloadError",
      payload: expect.objectContaining({
        code: "ENV_REQUIRED",
        next_step: expect.objectContaining({
          tool: "auth",
          action: "set_env",
        }),
      }),
    });
  });

  it("should report requestId from successful tool payloads", async () => {
    await withTelemetryEnabled(async () => {
      let wrappedHandler: ((args: any) => Promise<any>) | undefined;

      const server = {
        registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
          wrappedHandler = handler;
          return undefined;
        }),
        logger: vi.fn(),
        cloudBaseOptions: undefined,
        ide: "Cursor",
      } as any;

      wrapServerWithTelemetry(server);
      server.registerTool("demo", {}, async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, requestId: "req-success" }),
          },
        ],
      }));

      await wrappedHandler?.({});

      expect(reportToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-success",
          mcpClientInfo: {
            name: "test-client",
            version: "0.0.1",
          },
        }),
      );
    });
  });

  it("sets isError=true on structured business-failure results", async () => {
    let wrappedHandler: ((args: any) => Promise<any>) | undefined;

    const server = {
      registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
        wrappedHandler = handler;
        return undefined;
      }),
      logger: vi.fn(),
      cloudBaseOptions: undefined,
      ide: "Cursor",
    } as any;

    wrapServerWithTelemetry(server);
    server.registerTool("demo", {}, async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, errorCode: "MIGRATION_TASK_FAILED", message: "boom" }),
        },
      ],
    }));

    const result = await wrappedHandler?.({});
    expect(result?.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
  });

  it("sets isError=true on structuredContent business failures and leaves successes untouched", async () => {
    let wrappedHandler: ((args: any) => Promise<any>) | undefined;
    let handlerImpl: (args: any) => Promise<any> = async () => ({});

    const server = {
      registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
        wrappedHandler = handler;
        return undefined;
      }),
      logger: vi.fn(),
      cloudBaseOptions: undefined,
      ide: "Cursor",
    } as any;

    wrapServerWithTelemetry(server);
    server.registerTool("demo", {}, (args: any) => handlerImpl(args));

    handlerImpl = async () => ({
      structuredContent: { success: false, message: "query failed" },
      content: [],
    });
    const failure = await wrappedHandler?.({});
    expect(failure?.isError).toBe(true);

    handlerImpl = async () => ({
      structuredContent: { success: true },
      content: [],
    });
    const ok = await wrappedHandler?.({});
    expect(ok?.isError).toBeUndefined();

    handlerImpl = async () => ({
      content: [{ type: "text", text: "plain text without structured payload" }],
    });
    const plain = await wrappedHandler?.({});
    expect(plain?.isError).toBeUndefined();
  });

  it("should keep failure requestId extraction for errored handlers", async () => {
    await withTelemetryEnabled(async () => {
      let wrappedHandler: ((args: any) => Promise<any>) | undefined;

      const server = {
        registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
          wrappedHandler = handler;
          return undefined;
        }),
        logger: vi.fn(),
        cloudBaseOptions: undefined,
        ide: "Cursor",
      } as any;

      wrapServerWithTelemetry(server);
      server.registerTool("demo", {}, async () => {
        const error = new Error("boom") as Error & { requestId?: string };
        error.requestId = "req-error";
        throw error;
      });

      await expect(wrappedHandler?.({})).rejects.toThrow("boom");

      expect(reportToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-error",
        }),
      );
    });
  });

  it("should escalate repeated identical payload errors and reset after success", async () => {
    await withTelemetryEnabled(async () => {
      let handlerImpl: () => Promise<any> = async () => ({});
      let wrappedHandler: ((args: any) => Promise<any>) | undefined;

      const server = {
        registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
          wrappedHandler = handler;
          return undefined;
        }),
        logger: vi.fn(),
        cloudBaseOptions: undefined,
        ide: "Cursor",
      } as any;

      wrapServerWithTelemetry(server);
      server.registerTool("demo", {}, (...handlerArgs: any[]) => {
        void handlerArgs;
        return handlerImpl();
      });

      const envRequiredPayload = {
        ok: false,
        code: "ENV_REQUIRED",
        message: "当前已登录，但尚未绑定环境。重试当前工具不会成功。",
        next_step: {
          tool: "auth",
          action: "set_env",
          required_params: ["envId"],
        },
      };
      handlerImpl = async () => {
        throw new ToolPayloadError(envRequiredPayload);
      };

      const captureRejection = async () => {
        try {
          await wrappedHandler?.({});
        } catch (error) {
          return error as ToolPayloadError;
        }
        throw new Error("expected rejection");
      };

      for (let i = 1; i < REPEAT_GUARD_THRESHOLD; i += 1) {
        const rejected = await captureRejection();
        expect(rejected.payload).toMatchObject({ code: "ENV_REQUIRED" });
        expect((rejected.payload as any).repeat_guard).toBeUndefined();
      }

      // 达到阈值：注入 repeat_guard 升级提示
      const escalated = await captureRejection();
      expect((escalated.payload as any).repeat_guard).toMatchObject({
        code: "ENV_REQUIRED",
        consecutive_count: REPEAT_GUARD_THRESHOLD,
        threshold: REPEAT_GUARD_THRESHOLD,
      });
      expect((escalated.payload as any).repeat_guard.notice).toContain("停止重试");
      // message 保持稳定，便于遥测按文案聚合
      expect(escalated.message).toBe(envRequiredPayload.message);

      // 成功一次后计数清零，再次失败重新从零累计
      handlerImpl = async () => ({
        content: [{ type: "text", text: "ok" }],
      });
      await wrappedHandler?.({});

      handlerImpl = async () => {
        throw new ToolPayloadError(envRequiredPayload);
      };
      const restarted = await captureRejection();
      expect((restarted.payload as any).repeat_guard).toBeUndefined();
    });
  });
});
