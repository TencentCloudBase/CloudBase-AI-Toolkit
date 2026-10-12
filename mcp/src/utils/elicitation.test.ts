import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  ELICITATION_DEFAULT_TIMEOUT_MS,
  isFormElicitationSupported,
  requestChoiceElicitation,
} from "./elicitation.js";
import { telemetryReporter } from "./telemetry.js";

// 与 telemetry.test.ts 同因：上报会读本地登录态取 uin，单测里必须挡住真实凭证与网络。
vi.mock("../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth.js")>();
  return { ...actual, peekLoginState: vi.fn(async () => null) };
});

vi.mock("../cloudbase-manager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudbase-manager.js")>();
  return { ...actual, fetchEnvOwnerUin: vi.fn(async () => null) };
});

type Mocked = { mock: { calls: any[][] } };

/** 取第 i 次调用的第 j 个参数；没调用过就返回空对象（断言随后自然失败，不用 `!`） */
const callArg = (fn: Mocked, i: number, j: number) =>
  (fn.mock.calls[i]?.[j] ?? {}) as Record<string, any>;

function makeServer(options: {
  capabilities?: unknown;
  elicitInput?: (params: any, opts?: any) => Promise<any>;
}) {
  return {
    server: {
      getClientCapabilities: () => options.capabilities,
      ...(options.elicitInput ? { elicitInput: options.elicitInput } : {}),
    },
  };
}

const FORM_CAPS = { elicitation: { form: {} } };

describe("isFormElicitationSupported", () => {
  it("认 elicitation.form；空对象 {} 在 SDK 里会被预处理成 form，原始值不算", () => {
    expect(isFormElicitationSupported(makeServer({ capabilities: FORM_CAPS }))).toBe(true);
    expect(
      isFormElicitationSupported(makeServer({ capabilities: { elicitation: {} } })),
    ).toBe(false);
    expect(
      isFormElicitationSupported(makeServer({ capabilities: { elicitation: { url: {} } } })),
    ).toBe(false);
    expect(isFormElicitationSupported(makeServer({ capabilities: undefined }))).toBe(false);
  });
});

describe("requestChoiceElicitation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const spyReport = () => vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

  it("客户端没声明能力：不弹、上报 unsupported、不抛错", async () => {
    const report = spyReport();
    const outcome = await requestChoiceElicitation(makeServer({ capabilities: {} }), {
      message: "你想做什么？",
      field: "goal",
      options: ["查数据", "部署上线"],
      context: { toolName: "auth" },
    });

    expect(outcome).toEqual({
      status: "unsupported",
      reason: "client_declares_no_form_elicitation",
    });
    expect(report.mock.calls.map((c) => c[0])).toEqual(["toolkit_elicitation"]);
    expect(callArg(report, 0, 1)).toMatchObject({
      phase: "unsupported",
      field: "goal",
      optionCount: "2",
    });
  });

  it("accept：回传选项内的值，上报 requested → accepted（带耗时）", async () => {
    const report = spyReport();
    const elicit = vi.fn(async () => ({ action: "accept", content: { goal: "查数据" } }));
    const outcome = await requestChoiceElicitation(
      makeServer({ capabilities: FORM_CAPS, elicitInput: elicit }),
      {
        message: "你想做什么？",
        field: "goal",
        options: ["查数据", "部署上线"],
        context: { toolName: "auth" },
      },
    );

    expect(outcome).toEqual({ status: "accepted", value: "查数据" });
    expect(report.mock.calls.map((c) => c[0])).toEqual([
      "toolkit_elicitation",
      "toolkit_elicitation",
    ]);
    expect(callArg(report, 0, 1).phase).toBe("requested");
    const accepted = callArg(report, 1, 1);
    expect(accepted).toMatchObject({ phase: "accepted", value: "查数据" });
    expect(Number(accepted.duration)).toBeGreaterThanOrEqual(0);

    // 表单必须是单选 enum（且不得出现凭据类字段 —— 规范 MUST NOT）
    const sentParams = callArg(elicit, 0, 0);
    expect(sentParams.mode).toBe("form");
    expect(sentParams.requestedSchema.properties.goal.enum).toEqual(["查数据", "部署上线"]);
  });

  it("decline / cancel 都归 declined（cancel 保留原始动作）", async () => {
    const report = spyReport();
    for (const action of ["decline", "cancel"]) {
      report.mockClear();
      const outcome = await requestChoiceElicitation(
        makeServer({ capabilities: FORM_CAPS, elicitInput: async () => ({ action }) }),
        { message: "?", field: "goal", options: ["a", "b"] },
      );
      expect(outcome.status).toBe("declined");
      const last = callArg(report, report.mock.calls.length - 1, 1);
      expect(last.phase).toBe("declined");
      expect(last.error).toBe(action === "cancel" ? "cancel" : undefined);
    }
  });

  it("超时（SDK RequestTimeout）→ timeout，且不抛错", async () => {
    const report = spyReport();
    const outcome = await requestChoiceElicitation(
      makeServer({
        capabilities: FORM_CAPS,
        elicitInput: async () => {
          throw new McpError(ErrorCode.RequestTimeout, "Request timed out");
        },
      }),
      { message: "?", field: "goal", options: ["a"], timeoutMs: 1234 },
    );
    expect(outcome).toEqual({ status: "timeout", reason: "no_answer_within_1234ms" });
    expect(callArg(report, report.mock.calls.length - 1, 1).phase).toBe("timeout");
  });

  it("协议异常 → error，不抛错", async () => {
    const report = spyReport();
    const outcome = await requestChoiceElicitation(
      makeServer({
        capabilities: FORM_CAPS,
        elicitInput: async () => {
          throw new Error("transport closed");
        },
      }),
      { message: "?", field: "goal", options: ["a"] },
    );
    expect(outcome).toEqual({ status: "error", reason: "transport closed" });
    expect(callArg(report, report.mock.calls.length - 1, 1).phase).toBe("error");
  });

  it("回传不在选项里的值按 error 记，不当成成功", async () => {
    const report = spyReport();
    const outcome = await requestChoiceElicitation(
      makeServer({
        capabilities: FORM_CAPS,
        elicitInput: async () => ({ action: "accept", content: { goal: "我自己编的" } }),
      }),
      { message: "?", field: "goal", options: ["a", "b"] },
    );
    expect(outcome).toEqual({ status: "error", reason: "unexpected_value" });
    expect(callArg(report, report.mock.calls.length - 1, 1).phase).toBe("error");
  });

  it("把在途请求 id 与超时透传给 SDK", async () => {
    spyReport();
    const elicit = vi.fn(async () => ({ action: "decline" }));
    await requestChoiceElicitation(makeServer({ capabilities: FORM_CAPS, elicitInput: elicit }), {
      message: "?",
      field: "goal",
      options: ["a"],
      context: { relatedRequestId: "req-42" as never },
    });
    const opts = callArg(elicit, 0, 1);
    expect(opts.relatedRequestId).toBe("req-42");
    expect(opts.timeout).toBe(ELICITATION_DEFAULT_TIMEOUT_MS);
  });
});
