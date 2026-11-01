/**
 * 环境绑定的契约测试 —— 独立于实现，按 `specs/telemetry-env-binding/design.md` 写。
 *
 * 为什么单开一个文件：实现方正在改 `cloudbase-manager.ts` / `telemetry.ts` /
 * `tool-wrapper.ts` 与它们各自的测试文件。这个文件只依赖**公共行为**，不碰实现内部，
 * 两边可以并行、互不冲突。
 *
 * 分两组：
 *
 * - **A 组（现在就该绿）**：spec §9 写着「不改」的东西 —— 本机梯子的优先级、
 *   登录态不写缓存、两条对外函数一致。这些是重构**不许破坏**的既有契约，
 *   一旦被改坏，这里的 5 条会先红。
 * - **B 组**：spec §10 的验收。**已启用** —— 实现（`utils/env-binding.ts` 的
 *   `AsyncLocalStorage` 槽 + `runInEnvSlot`）落地后跑通了，现在是活的回归保护。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCloudBaseCtor = vi.fn();
const mockAuthGetProgressState = vi.fn();
const mockPeekLoginState = vi.fn();
const mockEnsureLogin = vi.fn();
const mockCommonServiceCall = vi.fn();
const mockListEnvs = vi.fn();

const { mockReadProjectConfig, mockReadProjectEnvId, mockReadCloudbaseRcBinding } = vi.hoisted(
  () => ({
    mockReadProjectConfig: vi.fn(),
    mockReadProjectEnvId: vi.fn(),
    mockReadCloudbaseRcBinding: vi.fn(),
  }),
);

vi.mock("./project-config.js", () => ({
  readProjectConfig: mockReadProjectConfig,
  readProjectEnvId: mockReadProjectEnvId,
  readCloudbaseRcBinding: mockReadCloudbaseRcBinding,
}));

vi.mock("../auth.js", () => ({
  buildDeviceAuthChallengePayload: vi.fn(),
  getAuthProgressState: mockAuthGetProgressState,
  peekLoginState: mockPeekLoginState,
  getLoginState: mockEnsureLogin,
}));

vi.mock("@cloudbase/manager-node", () => ({
  // vitest 4 起，被 `new` 调用的 mock 实现必须是 function/class。
  default: mockCloudBaseCtor.mockImplementation(function () {
    return {
      commonService: vi.fn(() => ({ call: mockCommonServiceCall })),
      env: { listEnvs: mockListEnvs },
    };
  }),
}));

/** 每个用例的干净起点：清模块级缓存（`envManager`、槽、`process.env`） */
function resetEnv() {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.CLOUDBASE_ENV_ID;
  delete process.env.CLOUDBASE_LOCAL_ENDPOINT;
  delete process.env.CLOUDBASE_MCP_CLOUD_MODE;
  delete process.env.MCP_CLOUD_MODE;
  delete process.env.TCB_REGION;
  delete process.env.TCB_SITE;
  mockReadProjectConfig.mockReturnValue(undefined);
  mockReadProjectEnvId.mockReturnValue(undefined);
  mockReadCloudbaseRcBinding.mockReturnValue(undefined);
  mockAuthGetProgressState.mockResolvedValue({ status: "IDLE", updatedAt: Date.now() });
  mockPeekLoginState.mockResolvedValue(undefined);
}

function loginStateWith(envId?: string) {
  return { secretId: "sid", secretKey: "skey", token: "token", ...(envId ? { envId } : {}) };
}

describe("环境绑定契约 · A 组（重构不许破坏）", () => {
  beforeEach(resetEnv);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("A1 显式传入的 envId 优先，不去读项目配置和登录态", async () => {
    const { getEnvId } = await import("../cloudbase-manager.js");

    await expect(getEnvId({ envId: "env-explicit" } as any)).resolves.toBe("env-explicit");

    // 第一档命中就不该再往下探 —— 读盘和读登录态都要是 0 次
    expect(mockReadProjectEnvId).not.toHaveBeenCalled();
    expect(mockPeekLoginState).not.toHaveBeenCalled();
  });

  it("A2 本地端点标记是 'local'，它不是云环境 ID", async () => {
    process.env.CLOUDBASE_LOCAL_ENDPOINT = "http://127.0.0.1:3000";
    const { getEnvId } = await import("../cloudbase-manager.js");

    await expect(getEnvId()).resolves.toBe("local");
    // 'local' 是点位标记，不能当成环境写进缓存
    const { getCachedEnvId } = await import("../cloudbase-manager.js");
    expect(getCachedEnvId()).toBeNull();
  });

  it("A3 登录态命中返回那个环境，但**不写** envManager 缓存", async () => {
    mockPeekLoginState.mockResolvedValue(loginStateWith("env-from-authjson"));
    const { getEnvId, getCachedEnvId } = await import("../cloudbase-manager.js");

    await expect(getEnvId()).resolves.toBe("env-from-authjson");
    // 这条是整份 spec 的前提：运行时拿得到、缓存里没有。
    // 若有人以「修上报」的名义在这里补 setEnvId，A4 的「项目配置优先」会被破坏。
    expect(getCachedEnvId()).toBeNull();
  });

  it("A4 项目配置优先于登录态，并且**会**写缓存（与 A3 成对照）", async () => {
    mockPeekLoginState.mockResolvedValue(loginStateWith("env-from-authjson"));
    mockReadProjectEnvId.mockReturnValue("env-from-project");
    const { getEnvId, getCachedEnvId } = await import("../cloudbase-manager.js");

    await expect(getEnvId()).resolves.toBe("env-from-project");
    expect(getCachedEnvId()).toBe("env-from-project");
    // 项目配置命中后就不该再去读登录态
    expect(mockPeekLoginState).not.toHaveBeenCalled();
  });

  it("A5 两条对外函数在同一场景下给出同一个环境", async () => {
    mockPeekLoginState.mockResolvedValue(loginStateWith("env-from-authjson"));
    const { getEnvId, getCloudBaseManager } = await import("../cloudbase-manager.js");

    await expect(getEnvId()).resolves.toBe("env-from-authjson");
    await getCloudBaseManager();

    // 两条梯子（getEnvId 52 处调用 / getManager 其余工具）必须对同一台机器说同一个环境，
    // 否则上报按哪个都对不上一半的工具
    expect(mockCloudBaseCtor).toHaveBeenLastCalledWith(
      expect.objectContaining({ envId: "env-from-authjson" }),
    );
  });

  it("A6 已有 CLOUDBASE_ENV_ID 时走它，不读盘", async () => {
    process.env.CLOUDBASE_ENV_ID = "env-from-var";
    const { getEnvId } = await import("../cloudbase-manager.js");

    await expect(getEnvId()).resolves.toBe("env-from-var");
    expect(mockReadProjectEnvId).not.toHaveBeenCalled();
    expect(mockPeekLoginState).not.toHaveBeenCalled();
  });

  it("A7 启动预热只进一次 peekLoginState（72h 约 105 万条 start）", async () => {
    mockPeekLoginState.mockResolvedValue(loginStateWith("env-from-authjson"));
    const { reportToolkitLifecycle } = await import("./telemetry.js");

    await reportToolkitLifecycle({ event: "start" });

    // 一条 start 就是一次进程启动（连接器普遍不保活）。一旦这里变成「每次事件都读盘/换票」，
    // 等于给启动路径加上百万次文件 IO 与网络 —— 这条守的是性能，不是功能。
    expect(mockPeekLoginState.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

/**
 * B 组：spec §10 的验收 —— 已启用。
 *
 * 每条的 body 都要在「一个槽」里跑（`runInSlot`），因为上报只读当前槽：
 * 在槽外调用任何上报，拿到的永远是 `default`。实现侧的入口是
 * `utils/env-binding.ts` 的 `runInEnvSlot`（经 `cloudbase-manager.ts` re-export）。
 */
async function runInSlot<T>(fn: () => Promise<T>): Promise<T> {
  // 走实现对外暴露的同一个入口；不从 env-binding.js 直接拿，是为了顺带守住
  // 「cloudbase-manager 仍然 re-export 了它」这件事（调用方是那 52 处 import 方）
  const mod: any = await import("../cloudbase-manager.js");
  const runner = mod.runInEnvSlot ?? mod.__runInEnvSlot;
  if (typeof runner !== "function") {
    throw new Error("cloudbase-manager 不再 re-export runInEnvSlot（spec §6 的槽入口）");
  }
  return runner(fn);
}

describe("环境绑定契约 · B 组（spec §10 验收）", () => {
  beforeEach(resetEnv);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("B1（§10.1）登录态命中：上报的 source 是 login_state，缓存仍是空", async () => {
    mockPeekLoginState.mockResolvedValue(loginStateWith("env-from-authjson"));
    const { telemetryReporter } = await import("./telemetry.js");
    const { getEnvId, getCachedEnvId } = await import("../cloudbase-manager.js");
    const { reportToolCall } = await import("./telemetry.js");
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await runInSlot(async () => {
      await getEnvId();
      await reportToolCall({ toolName: "readNoSqlDatabaseContent", success: true });
    });

    expect(getCachedEnvId()).toBeNull();
    expect(reportSpy).toHaveBeenCalledWith(
      "toolkit_tool_call",
      expect.objectContaining({ envId: "env-from-authjson", envIdSource: "login_state" }),
    );
  });

  it("B2（§10.2）set_env 之后同进程的下一次上报是新环境", async () => {
    mockPeekLoginState.mockResolvedValue(loginStateWith("env-old"));
    const { telemetryReporter } = await import("./telemetry.js");
    const { getEnvId } = await import("../cloudbase-manager.js");
    const { reportToolCall } = await import("./telemetry.js");
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await runInSlot(async () => {
      await getEnvId();
      // 模拟 set_env：本机照旧写 envManager
      const { getCachedEnvId } = await import("../cloudbase-manager.js");
      void getCachedEnvId;
      process.env.CLOUDBASE_ENV_ID = "env-new";
      await getEnvId();
      await reportToolCall({ toolName: "queryEnv", success: true });
    });

    // 后写入的覆盖先写入的：拿新环境建了客户端，就该报新环境
    expect(reportSpy).toHaveBeenLastCalledWith(
      "toolkit_tool_call",
      expect.objectContaining({ envId: "env-new" }),
    );
  });

  it("B3（§10.3）同一次 run 里，工具与资源读取看到同一个环境", async () => {
    mockPeekLoginState.mockResolvedValue(loginStateWith("env-same"));
    const { telemetryReporter } = await import("./telemetry.js");
    const { getEnvId } = await import("../cloudbase-manager.js");
    const { reportToolCall, reportResourceRead } = await import("./telemetry.js");
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await runInSlot(async () => {
      await getEnvId();
      await reportToolCall({ toolName: "auth", success: true });
      // resources/read 不经过 tool-wrapper，但同在这条异步链上，必须看得到同一个槽
      await reportResourceRead({
        resourceUri: "ui://cloudbase/get-started",
        mimeType: "text/html",
        bytes: 1,
        durationMs: 1,
        success: true,
      });
    });

    const calls = reportSpy.mock.calls;
    const tool = calls.find((c) => c[0] === "toolkit_tool_call")?.[1] as any;
    const res = calls.find((c) => c[0] === "toolkit_resource_read")?.[1] as any;
    expect(tool?.envId).toBe("env-same");
    expect(res?.envId).toBe("env-same");
  });

  it("B4（§10.5）两个并发 run 各自带不同环境，上报互不串", async () => {
    const { telemetryReporter } = await import("./telemetry.js");
    const { getEnvId } = await import("../cloudbase-manager.js");
    const { reportToolCall } = await import("./telemetry.js");
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await Promise.all([
      runInSlot(async () => {
        await getEnvId({ envId: "env-a" } as any);
        // 拉开窗口，让两个 run 真的重叠
        await new Promise((r) => setTimeout(r, 20));
        await reportToolCall({ toolName: "queryEnv", success: true, action: "a" });
      }),
      runInSlot(async () => {
        await getEnvId({ envId: "env-b" } as any);
        await new Promise((r) => setTimeout(r, 5));
        await reportToolCall({ toolName: "queryEnv", success: true, action: "b" });
      }),
    ]);

    const byAction = (a: string) =>
      (reportSpy.mock.calls.find((c) => (c[1] as any)?.action === a)?.[1] as any)?.envId;
    expect(byAction("a")).toBe("env-a");
    expect(byAction("b")).toBe("env-b");
  });

  it("B5（§10.4）只命中登录态时不写缓存；随后出现项目配置，下一次切到 project", async () => {
    mockPeekLoginState.mockResolvedValue(loginStateWith("env-from-authjson"));
    const { telemetryReporter } = await import("./telemetry.js");
    const { getEnvId, getCachedEnvId } = await import("../cloudbase-manager.js");
    const { reportToolCall } = await import("./telemetry.js");
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await runInSlot(async () => {
      await getEnvId();
      await reportToolCall({ toolName: "auth", success: true, action: "before" });
      expect(getCachedEnvId()).toBeNull();

      // 同一进程里中途出现项目配置：不能被登录态粘住
      mockReadProjectEnvId.mockReturnValue("env-from-project");
      await getEnvId();
      await reportToolCall({ toolName: "auth", success: true, action: "after" });
    });

    const env = (a: string) =>
      (reportSpy.mock.calls.find((c) => (c[1] as any)?.action === a)?.[1] as any)?.envId;
    expect(env("before")).toBe("env-from-authjson");
    expect(env("after")).toBe("env-from-project");
  });


  it("B7（§10.7）hosted 的 initialized：有注入记 cloudBaseOptions，没有记 default", async () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = "true";
    const { telemetryReporter } = await import("./telemetry.js");
    const { reportToolkitSessionInitialized } = await import("./telemetry.js");
    const reportSpy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);

    await runInSlot(async () => {
      await reportToolkitSessionInitialized({
        cloudBaseOptions: { envId: "env-hosted" } as any,
      } as any);
    });
    const withEnv = (reportSpy.mock.calls.at(-1)?.[1] ?? {}) as any;
    expect(withEnv.envIdSource).toBe("cloudBaseOptions");

    // 没有注入时不能去读这台机器上的 auth.json
    mockPeekLoginState.mockClear();
    await runInSlot(async () => {
      await reportToolkitSessionInitialized({ cloudBaseOptions: undefined } as any);
    });
    const noEnv = (reportSpy.mock.calls.at(-1)?.[1] ?? {}) as any;
    expect(noEnv.envIdSource).toBe("default");
    expect(mockPeekLoginState).not.toHaveBeenCalled();
  });

  it("B8（§3/§9 冻结）source 取值只有约定的 7 个，不再发出 envManager.lastResolvedEnvId", async () => {
    const fs = await import("node:fs/promises");
    // 枚举只有一处定义：`env-binding.ts`。上报侧只引用它的类型。
    const src = await fs.readFile(new URL("./env-binding.ts", import.meta.url), "utf8");
    const telemetrySrc = await fs.readFile(new URL("./telemetry.ts", import.meta.url), "utf8");

    // 这四档必须保留（历史数据要对得上），新增三档
    for (const keep of [
      "cloudBaseOptions",
      "process.env.CLOUDBASE_ENV_ID",
      "envManager.cachedEnvId",
      "default",
    ]) {
      expect(src).toContain(keep);
    }
    for (const added of ["project", "login_state", "auto_bound"]) {
      expect(src).toContain(added);
    }
    // 影子变量的取值必须消失 —— 它会把上一次的环境写到这次没解析的调用上，是错报
    expect(src).not.toContain("envManager.lastResolvedEnvId");
    expect(telemetrySrc).not.toContain("envManager.lastResolvedEnvId");
    // 上报侧不许再抄一份枚举：抄了就一定会漂
    expect(telemetrySrc).not.toContain("const ENV_ID_SOURCES");
    // `default` 不改名为 unresolved，否则「三处都空」的查询要换词
    expect(src).not.toContain("'unresolved'");
    expect(telemetrySrc).not.toContain("'unresolved'");
  });

  /**
   * §10.3 的另一半：确认框和两个面板显示什么。
   *
   * 这三处共用一个入口 `readDisplayedEnvId()`，出了问题只有「面板显示错环境」这一种表现，
   * 不会报错、不会崩、单测也照绿 —— 所以直接钉住它的三条取值和解两个特殊值。
   * 各自模块的用例在 `get-started.test.ts` / `env-credits.test.ts` /
   * `confirmation-guard.test.ts`，这里只管这个入口本身。
   */
  it("B9（§10.3）显示口径：显式 > 槽；`local` 与 `unknown` 都不当环境显示", async () => {
    const { noteEnvBinding, readDisplayedEnvId, runInEnvSlot } = await import("./env-binding.js");

    // 槽外：只有显式传进来的才算
    expect(readDisplayedEnvId("env-explicit")).toBe("env-explicit");
    expect(readDisplayedEnvId()).toBeNull();

    runInEnvSlot(() => {
      noteEnvBinding({ envId: "env-slot", source: "login_state" });
      expect(readDisplayedEnvId()).toBe("env-slot");
      // 这次请求自己带的 envId 压过槽里的
      expect(readDisplayedEnvId("env-explicit")).toBe("env-explicit");
      // 本地端点标记和空值不是环境 ID，不能写进确认文案或面板
      expect(readDisplayedEnvId("local")).toBe("env-slot");
      expect(readDisplayedEnvId("unknown")).toBe("env-slot");
    });

    // 想记 `local`：记不进槽，显示侧落到「未知环境」，不会把 local 当环境 ID 写出去
    runInEnvSlot(() => {
      noteEnvBinding({ envId: "local", source: "cloudBaseOptions" });
      expect(readDisplayedEnvId()).toBeNull();
    });
  });

  /**
   * 灯塔侧登记名与上报键必须逐字一致，差一个字数据就被静默丢掉（`code 20201`）。
   *
   * 这三列 2026-10-28 回读灯塔 `resource/event/query` 确认已登记：
   * `c25 envIdSource` / `c26 envSetupStatus` / `c27 envSetupFailReason`。
   * 这条不测灯塔（测试不该联网），只钉住「我们发出去的键就叫这三个名字」。
   */
  it("B10（灯塔 c25–c27）上报键与登记名逐字一致", async () => {
    const fs = await import("node:fs/promises");
    const telemetrySrc = await fs.readFile(new URL("./telemetry.ts", import.meta.url), "utf8");
    // `envIdSource` 在 eventData 里是简写（`envIdSource,`），另外两个是显式赋值
    expect(telemetrySrc).toMatch(/\benvIdSource,/);
    for (const key of ["envSetupStatus", "envSetupFailReason"]) {
      expect(telemetrySrc).toContain(`eventData.${key} =`);
    }
    // 上报侧不许把键名改写成别的拼法（驼峰/下划线混用最容易被当成"反正都在"）
    expect(telemetrySrc).not.toContain("env_id_source");
    expect(telemetrySrc).not.toContain("envSetupFailedReason");
  });
});
