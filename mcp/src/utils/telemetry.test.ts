import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractClientCapabilities,
  extractMcpClientInfo,
  normalizeClientName,
  readClientCapabilitiesFromServer,
  readMcpClientInfoFromServer,
  reportElicitationResult,
  reportResourceRead,
  reportToolCall,
  reportToolkitLifecycle,
  telemetryReporter,
} from "./telemetry.js";

// 遥测会读取本地登录态来取主账号 uin：单测里必须挡住真实凭证存储与网络，
// 否则用例会依赖本机 ~/.config/.cloudbase/auth.json（甚至触发临时密钥续期）。
vi.mock("../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth.js")>();
  return { ...actual, peekLoginState: vi.fn(async () => null) };
});

vi.mock("../cloudbase-manager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudbase-manager.js")>();
  return { ...actual, fetchEnvOwnerUin: vi.fn(async () => null) };
});

describe("telemetry payload serialization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should stringify duration and preserve requestId for tool calls", async () => {
    const reportSpy = vi
      .spyOn(telemetryReporter, "report")
      .mockResolvedValue(undefined);

    await reportToolCall({
      toolName: "readNoSqlDatabaseContent",
      success: true,
      requestId: "req-query",
      duration: 123,
    });

    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_tool_call",
      expect.objectContaining({
        requestId: "req-query",
        duration: "123",
      }),
    );
  });

  it("should include MCP clientInfo fields when provided", async () => {
    const reportSpy = vi
      .spyOn(telemetryReporter, "report")
      .mockResolvedValue(undefined);

    await reportToolCall({
      toolName: "queryEnv",
      success: true,
      mcpClientInfo: {
        name: "cursor-vscode",
        version: "1.2.3",
        title: "Cursor",
      },
    });

    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_tool_call",
      expect.objectContaining({
        mcpClientName: "cursor-vscode",
        mcpClientVersion: "1.2.3",
        mcpClientTitle: "Cursor",
      }),
    );
  });

  it("should include client, region and site fields when provided", async () => {
    const reportSpy = vi
      .spyOn(telemetryReporter, "report")
      .mockResolvedValue(undefined);

    await reportToolCall({
      toolName: "queryEnv",
      success: true,
      client: "Cursor",
      cloudBaseOptions: {
        region: "ap-singapore",
        site: "intl",
      } as any,
    });

    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_tool_call",
      expect.objectContaining({
        client: "cursor",
        region: "ap-singapore",
        site: "intl",
      }),
    );
  });

  it("should stringify lifecycle duration and exitCode", async () => {
    const reportSpy = vi
      .spyOn(telemetryReporter, "report")
      .mockResolvedValue(undefined);

    await reportToolkitLifecycle({
      event: "exit",
      duration: 456,
      exitCode: 2,
    });

    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_lifecycle",
      expect.objectContaining({
        duration: "456",
        exitCode: "2",
      }),
    );
  });

  it("should report login_uin as a per-event field on both events", async () => {
    const reportSpy = vi
      .spyOn(telemetryReporter, "report")
      .mockResolvedValue(undefined);

    await reportToolCall({
      toolName: "queryEnv",
      success: true,
      cloudBaseOptions: { envId: "env-1", uin: "123811017" } as any,
    });
    await reportToolkitLifecycle({
      event: "exit",
      cloudBaseOptions: { envId: "env-1", uin: "123811017" } as any,
    });

    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_tool_call",
      expect.objectContaining({ login_uin: "123811017" }),
    );
    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_lifecycle",
      expect.objectContaining({ login_uin: "123811017" }),
    );
  });

  it("should degrade login_uin to unknown when nothing can be resolved", async () => {
    const reportSpy = vi
      .spyOn(telemetryReporter, "report")
      .mockResolvedValue(undefined);

    await reportToolCall({ toolName: "queryEnv", success: true });

    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_tool_call",
      expect.objectContaining({ login_uin: "unknown" }),
    );
  });
});

describe("login_uin resolution", () => {
  // 模块内缓存（本地登录态只解析一次、按 secretId 缓存）与 mock 调用计数都需要每个用例独立实例
  const loadTelemetry = async () => {
    vi.resetModules();
    const telemetry = await import("./telemetry.js");
    const auth = await import("../auth.js");
    const peekLoginState = vi.mocked(auth.peekLoginState);
    // mock 实例跨用例复用：调用计数与实现都要逐用例重置
    peekLoginState.mockClear();
    peekLoginState.mockResolvedValue(null);
    return {
      resolveLoginUin: telemetry.resolveLoginUin,
      peekLoginState,
    };
  };

  afterEach(() => {
    delete process.env.CLOUDBASE_MCP_CLOUD_MODE;
  });

  it("prefers the uin injected by the host", async () => {
    const { resolveLoginUin, peekLoginState } = await loadTelemetry();

    await expect(resolveLoginUin({ uin: "123811017" } as any)).resolves.toBe(
      "123811017",
    );
    // DescribeEnvInfo 的 Uin 与本地凭证 uin 都是数字，需字符串化后上报
    await expect(resolveLoginUin({ uin: 123811017 } as any)).resolves.toBe(
      "123811017",
    );
    // 19 位「大 uin」以数字传递时已被 JS 精度截断（…5038 -> …5000）：
    // 上报一个错号比上报 unknown 更糟，必须丢弃
    await expect(
      resolveLoginUin({ uin: 4611686018428325038 } as any, {
        allowResolve: false,
      }),
    ).resolves.toBe("unknown");
    // 字符串传递则原样保留
    await expect(
      resolveLoginUin({ uin: "4611686018428325038" } as any, {
        allowResolve: false,
      }),
    ).resolves.toBe("4611686018428325038");
    expect(peekLoginState).not.toHaveBeenCalled();
  });

  it("ignores a non-numeric injected uin instead of reporting garbage", async () => {
    const { resolveLoginUin, peekLoginState } = await loadTelemetry();

    await expect(
      resolveLoginUin({ uin: "not-a-uin" } as any, { allowResolve: false }),
    ).resolves.toBe("unknown");
    // 带空白的合法 uin 归一化后照常上报（DescribeEnvInfo 侧返回数字，宿主侧可能是字符串）
    await expect(
      resolveLoginUin({ uin: "123811017\n" } as any, { allowResolve: false }),
    ).resolves.toBe("123811017");
    expect(peekLoginState).not.toHaveBeenCalled();
  });

  it("reads the local login state uin once for local processes", async () => {
    const { resolveLoginUin, peekLoginState } = await loadTelemetry();
    peekLoginState.mockResolvedValue({
      secretId: "id",
      secretKey: "key",
      uin: 123811017,
    } as any);

    await expect(resolveLoginUin()).resolves.toBe("123811017");
    await expect(resolveLoginUin()).resolves.toBe("123811017");
    // 只解析一次：本地登录态解析可能触发临时密钥续期（网络 + 写回），不能挂在每次上报上
    expect(peekLoginState).toHaveBeenCalledTimes(1);
  });

  it("does not touch the local login state in cloud mode", async () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    const { resolveLoginUin, peekLoginState } = await loadTelemetry();
    peekLoginState.mockResolvedValue({
      secretId: "id",
      secretKey: "key",
      uin: 123811017,
    } as any);

    // cloud mode 是 hosted 单进程多租户：不做本地读取，避免把 A 账号的 uin 报到 B 账号事件上
    await expect(resolveLoginUin()).resolves.toBe("unknown");
    expect(peekLoginState).not.toHaveBeenCalled();
  });

  it("does not resolve anything when allowResolve is false", async () => {
    const { resolveLoginUin, peekLoginState } = await loadTelemetry();
    peekLoginState.mockResolvedValue({
      secretId: "id",
      secretKey: "key",
      uin: 123811017,
    } as any);

    // 退出路径用这个开关：宁可上报 unknown，也不让进程退出多等一次网络调用
    await expect(
      resolveLoginUin(undefined, { allowResolve: false }),
    ).resolves.toBe("unknown");
    expect(peekLoginState).not.toHaveBeenCalled();
  });

  it("still honors an injected uin when allowResolve is false", async () => {
    const { resolveLoginUin } = await loadTelemetry();

    await expect(
      resolveLoginUin({ uin: "123811017" } as any, { allowResolve: false }),
    ).resolves.toBe("123811017");
  });
});

describe("normalizeClientName", () => {
  it("should trim, lowercase and strip disallowed characters", () => {
    expect(normalizeClientName("  Cursor ")).toBe("cursor");
    expect(normalizeClientName("claude-code")).toBe("claude-code");
    expect(normalizeClientName("CLine_v1")).toBe("cline_v1");
    expect(normalizeClientName("Cursor/VSCode 1.0")).toBe("cursorvscode10");
    expect(normalizeClientName("A".repeat(100))).toHaveLength(64);
  });

  it("should return undefined for empty or non-string values", () => {
    expect(normalizeClientName("")).toBeUndefined();
    expect(normalizeClientName("   ")).toBeUndefined();
    expect(normalizeClientName("///")).toBeUndefined();
    expect(normalizeClientName(undefined)).toBeUndefined();
    expect(normalizeClientName(123)).toBeUndefined();
  });
});

describe("MCP clientInfo helpers", () => {
  it("extractMcpClientInfo should keep name/version/title and drop empties", () => {
    expect(
      extractMcpClientInfo({
        name: " Claude Code ",
        version: "2.0.0",
        title: "Claude Code",
        extra: "ignored",
      }),
    ).toEqual({
      name: "Claude Code",
      version: "2.0.0",
      title: "Claude Code",
    });

    expect(extractMcpClientInfo({ name: "  ", version: "" })).toEqual({});
    expect(extractMcpClientInfo(undefined)).toEqual({});
  });

  it("readMcpClientInfoFromServer should read getClientVersion safely", () => {
    expect(
      readMcpClientInfoFromServer({
        server: {
          getClientVersion: () => ({ name: "cursor", version: "1.0.0" }),
        },
      }),
    ).toEqual({ name: "cursor", version: "1.0.0" });

    expect(readMcpClientInfoFromServer({})).toEqual({});
    expect(
      readMcpClientInfoFromServer({
        server: {
          getClientVersion: () => {
            throw new Error("not initialized");
          },
        },
      }),
    ).toEqual({});
  });

  it("uses clientInfo when the handshake client info is empty", () => {
    expect(
      readMcpClientInfoFromServer({
        server: { getClientVersion: () => ({}) },
        clientInfo: { name: "cursor-vscode", version: "1.2.3" },
      }),
    ).toEqual({ name: "cursor-vscode", version: "1.2.3" });
  });

  it("prefers handshake client info over a passed clientInfo", () => {
    expect(
      readMcpClientInfoFromServer({
        server: { getClientVersion: () => ({ name: "claude-code", version: "2.0.0" }) },
        clientInfo: { name: "other", version: "0.0.1" },
      }),
    ).toEqual({ name: "claude-code", version: "2.0.0" });
  });

  it("does not read clientInfo stored on a different server", () => {
    const withHint = {
      clientInfo: { name: "cursor", version: "9" },
    };
    const withoutHint = {};
    expect(readMcpClientInfoFromServer(withHint)).toEqual({ name: "cursor", version: "9" });
    expect(readMcpClientInfoFromServer(withoutHint)).toEqual({});
  });
});

describe("client capabilities (本地支持矩阵的唯一来源)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 取某次上报的 payload；没上报过返回空对象（断言随后失败，不用 `!`） */
  const payloadAt = (spy: { mock: { calls: any[][] } }, i: number) =>
    (spy.mock.calls[i]?.[1] ?? {}) as Record<string, any>;

  it("识别 elicitation 两种模式 / ui 扩展 / roots / sampling", () => {
    expect(
      extractClientCapabilities({ elicitation: { form: {} }, roots: {}, sampling: {} }),
    ).toMatchObject({
      elicitationForm: true,
      elicitationUrl: false,
      ui: false,
      roots: true,
      sampling: true,
      summary: "elicitation:form,roots,sampling",
    });

    expect(
      extractClientCapabilities({
        elicitation: { url: {} },
        extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [] } },
      }),
    ).toMatchObject({
      elicitationForm: false,
      elicitationUrl: true,
      ui: true,
      summary: "elicitation:url,ui",
    });
  });

  it("握手完成但什么都没声明 → summary=none；握手未完成 → undefined（两者必须分得开）", () => {
    expect(extractClientCapabilities({})).toMatchObject({ summary: "none" });
    // 未完成握手：拿不到就是拿不到，不能记成"客户端没有能力"
    expect(extractClientCapabilities(undefined)).toBeUndefined();
    expect(extractClientCapabilities(null)).toBeUndefined();
    expect(extractClientCapabilities("garbage")).toBeUndefined();
    expect(extractClientCapabilities([])).toBeUndefined();
  });

  it("elicitation 只写了未知子字段时，不伪造成 form", () => {
    expect(extractClientCapabilities({ elicitation: { applyDefaults: true } })).toMatchObject({
      elicitationForm: false,
      summary: "elicitation",
    });
  });

  it("readClientCapabilitiesFromServer 读不到或抛错都返回 undefined", () => {
    expect(
      readClientCapabilitiesFromServer({
        server: { getClientCapabilities: () => ({ elicitation: { form: {} } }) },
      }),
    ).toMatchObject({ elicitationForm: true });

    expect(readClientCapabilitiesFromServer({})).toBeUndefined();
    expect(
      readClientCapabilitiesFromServer({
        server: {
          getClientCapabilities: () => {
            throw new Error("not initialized");
          },
        },
      }),
    ).toBeUndefined();
  });

  it("工具调用上报带上能力字段（摘要 + 两个布尔）", async () => {
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await reportToolCall({
      toolName: "auth",
      success: true,
      mcpClientCapabilities: extractClientCapabilities({
        elicitation: { form: {} },
        extensions: { "io.modelcontextprotocol/ui": {} },
      }),
    });

    const payload = payloadAt(reportSpy, 0);
    expect(payload).toMatchObject({
      mcpCaps: "elicitation:form,ui",
      mcpCapsElicitation: "true",
      mcpCapsUi: "true",
    });
  });

  it("拿不到能力时不占用字段（不要写 unknown 假值）", async () => {
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await reportToolCall({ toolName: "auth", success: true });

    const payload = payloadAt(reportSpy, 0);
    expect(payload.mcpCaps).toBeUndefined();
    expect(payload.mcpCapsElicitation).toBeUndefined();
    expect(payload.mcpCapsUi).toBeUndefined();
  });

  it("elicitation 结果用独立事件上报，六个 phase 一个不少", async () => {
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    for (const phase of [
      "requested",
      "accepted",
      "declined",
      "timeout",
      "unsupported",
      "error",
    ] as const) {
      await reportElicitationResult({ phase, field: "goal", optionCount: 3, toolName: "auth" });
    }

    expect(reportSpy.mock.calls.map((c) => c[0])).toEqual(Array(6).fill("toolkit_elicitation"));
    expect(payloadAt(reportSpy, 1)).toMatchObject({
      phase: "accepted",
      field: "goal",
      optionCount: "3",
      toolName: "auth",
    });
  });

  it("工具调用上报带上 action 字段（区分同一工具做了什么）", async () => {
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await reportToolCall({ toolName: "auth", success: true, action: "status" });

    expect(payloadAt(reportSpy, 0)).toMatchObject({ action: "status" });
  });

  it("资源读取用独立事件上报（resourceUri / mimeType / bytes / duration / success）", async () => {
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await reportResourceRead({
      resourceUri: "ui://cloudbase/get-started",
      mimeType: "text/html;profile=mcp-app",
      bytes: 4096,
      durationMs: 7,
      success: true,
    });

    expect(reportSpy.mock.calls.map((c) => c[0])).toEqual(["toolkit_resource_read"]);
    expect(payloadAt(reportSpy, 0)).toMatchObject({
      resourceUri: "ui://cloudbase/get-started",
      mimeType: "text/html;profile=mcp-app",
      bytes: "4096",
      duration: "7",
      success: "true",
    });
  });
});
