import { describe, expect, it, vi } from "vitest";
import { wrapServerWithTelemetry } from "./tool-wrapper.js";
import { ToolPayloadError } from "./tool-result.js";
import { reportToolCall } from "./telemetry.js";

vi.mock("./cloud-mode.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cloud-mode.js")>();
  return {
    ...actual,
    shouldRegisterTool: vi.fn(() => true),
  };
});

vi.mock("./telemetry.js", () => ({
  reportToolCall: vi.fn(() => Promise.resolve()),
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
        }),
      );
    });
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
});
