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
  // tool-wrapper 每次工具调用都会读一次客户端能力（A3）：mock 里必须存在，
  // 否则运行时抛 "No readClientCapabilitiesFromServer export is defined on the mock"。
  readClientCapabilitiesFromServer: vi.fn(() => ({
    elicitationForm: true,
    elicitationUrl: false,
    ui: false,
    roots: false,
    sampling: false,
    summary: "elicitation:form",
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
        client: "cursor",
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
          client: "cursor",
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

  it("reports a returned business failure as a failure (same as a throw)", async () => {
    // 行为变更（#50）：以前这里记 success=true，等于把"工具返回失败"记成成功。
    // 现在与抛错同口径：success=false + error。注意这个载荷没有 content，
    // 所以没有文本可增强——enhance 那一步对它是 no-op，message 仍进遥测。
    await withTelemetryEnabled(async () => {
      vi.mocked(reportToolCall).mockClear();
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
      server.registerTool("demo", {}, async () => ({ success: false }));

      const result = await wrappedHandler?.({});

      expect(result?.isError).toBe(true);
      expect(result?.success).toBe(false);
      expect(JSON.stringify(result)).not.toContain("github.com");
      expect(reportToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "demo",
          success: false,
          error: expect.any(String),
        }),
      );
    });
  });

  it("points tool errors at a pull request and a blank issue page", async () => {
    // The banner is built only outside the test-environment early return,
    // so withTelemetryEnabled has to clear NODE_ENV and VITEST.
    await withTelemetryEnabled(async () => {
      let wrappedHandler: ((args: any) => Promise<any>) | undefined;

      const server = {
        registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
          wrappedHandler = handler;
          return undefined;
        }),
        logger: vi.fn(),
        cloudBaseOptions: { site: "domestic", envId: "env-should-not-appear-9f3c" },
        ide: "Cursor",
      } as any;

      wrapServerWithTelemetry(server);
      server.registerTool("demo", {}, async () => {
        throw new Error("boom");
      });

      let message = "";
      try {
        await wrappedHandler?.({ secret: "should-not-appear" });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain("📦 CloudBase MCP v");
      expect(message).toContain("https://cnb.cool/tencent/cloud/cloudbase/CloudBase-AI-ToolKit/-/blob/main/CONTRIBUTING.md");
      expect(message).toContain("https://cnb.cool/tencent/cloud/cloudbase/community/-/issues/new");
      expect(message).not.toContain("body=");
      expect(message).not.toContain("env-should-not-appear-9f3c");
      expect(message).not.toContain("should-not-appear");
      expect(message).not.toMatch(/^\s*\/\//m);
      expect(message).not.toContain("宿主应用");
    });
  });

  it("uses the GitHub repo when the server site is international", async () => {
    await withTelemetryEnabled(async () => {
      let wrappedHandler: ((args: any) => Promise<any>) | undefined;

      const server = {
        registerTool: vi.fn((_name: string, _meta: any, handler: (args: any) => Promise<any>) => {
          wrappedHandler = handler;
          return undefined;
        }),
        logger: vi.fn(),
        cloudBaseOptions: { site: "intl" },
      } as any;

      wrapServerWithTelemetry(server);
      server.registerTool("demo", {}, async () => {
        throw new Error("boom");
      });

      let message = "";
      try {
        await wrappedHandler?.({});
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain("https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/blob/main/CONTRIBUTING.md");
      expect(message).toContain("https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues/new");
      expect(message).not.toContain("cnb.cool");
      expect(message).not.toContain("body=");
    });
  });

  /*
   * `auth` 的环境准备结果上报（2026-10-27 补，2026-11-04 改为 no_env）。
   * 背景：`env_setup_status` / `env_setup_reason` 只回给模型、没进埋点，
   * 于是「没环境 / 其他卡点」在数据里长得一模一样。
   */
  describe("auth 环境准备结果上报", () => {
    function makeServer(handler: (args: any) => Promise<any>) {
      let wrappedHandler: ((args: any) => Promise<any>) | undefined;
      const server = {
        registerTool: vi.fn((_name: string, _meta: any, h: (args: any) => Promise<any>) => {
          wrappedHandler = h;
          return undefined;
        }),
        logger: vi.fn(),
        cloudBaseOptions: undefined,
        ide: "Cursor",
        client: "cursor",
      } as any;
      wrapServerWithTelemetry(server);
      server.registerTool("auth", {}, handler);
      return () => wrappedHandler;
    }

    it("ACTION_REQUIRED + 无环境 → reason 原样进埋点", async () => {
      await withTelemetryEnabled(async () => {
        const getHandler = makeServer(async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                current_env_id: null,
                env_status: "NONE",
                env_setup_status: "ACTION_REQUIRED",
                env_setup_reason: "no_env",
                env_setup_help_url:
                  "https://buy.cloud.tencent.com/CloudBase?buyType=tcb&region=ap-shanghai&sqlType=pg",
              }),
            },
          ],
        }));

        await getHandler()?.({ action: "status" });

        expect(vi.mocked(reportToolCall)).toHaveBeenLastCalledWith(
          expect.objectContaining({
            toolName: "auth",
            envSetupStatus: "ACTION_REQUIRED",
            envSetupFailReason: "no_env",
          }),
        );
      });
    });

    it("正常有环境（NOT_NEEDED）时只带 status，不臆造 reason", async () => {
      await withTelemetryEnabled(async () => {
        const getHandler = makeServer(async () => ({
          content: [{ type: "text", text: JSON.stringify({ env_setup_status: "NOT_NEEDED" }) }],
        }));

        await getHandler()?.({ action: "status" });

        const call = vi.mocked(reportToolCall).mock.calls.at(-1)?.[0] as any;
        expect(call.envSetupStatus).toBe("NOT_NEEDED");
        expect(call.envSetupFailReason).toBeUndefined();
      });
    });

    it("非 auth 工具即使返回体里有同名字段也不带（避免误读别的工具的 payload）", async () => {
      await withTelemetryEnabled(async () => {
        let wrappedHandler: ((args: any) => Promise<any>) | undefined;
        const server = {
          registerTool: vi.fn((_name: string, _meta: any, h: (args: any) => Promise<any>) => {
            wrappedHandler = h;
            return undefined;
          }),
          logger: vi.fn(),
          cloudBaseOptions: undefined,
        } as any;
        wrapServerWithTelemetry(server);
        server.registerTool("queryEnv", {}, async () => ({
          content: [{ type: "text", text: JSON.stringify({ env_setup_status: "NOT_NEEDED" }) }],
        }));

        await wrappedHandler?.({});

        const call = vi.mocked(reportToolCall).mock.calls.at(-1)?.[0] as any;
        expect(call.envSetupStatus).toBeUndefined();
      });
    });

    it("返回体不是 JSON 时不上报、也不抛（不能因为解析失败影响工具返回）", async () => {
      await withTelemetryEnabled(async () => {
        const getHandler = makeServer(async () => ({
          content: [{ type: "text", text: "已登录。当前环境：env-abc" }],
        }));

        await expect(getHandler()?.({ action: "status" })).resolves.toBeTruthy();
        const call = vi.mocked(reportToolCall).mock.calls.at(-1)?.[0] as any;
        expect(call.envSetupStatus).toBeUndefined();
      });
    });
  });
});
