/**
 * 环境上报的端到端测试 —— 走真实的 MCP 协议握手与真实的本地凭据文件。
 *
 * 为什么单测不够：`env-binding.contract.test.ts` 把 `peekLoginState` / `readProjectEnvId`
 * 全 mock 掉了，它证明的是「梯子的分支走对了」，证明不了下面三件事 ——
 *
 * 1. 真实的 `~/.config/.cloudbase/auth.json` 读进来之后，解析结果真的到达 `reportToolCall`；
 * 2. `initialize` → `tools/call` 这条真实异步链上，上下文（槽）没有在半路丢掉；
 * 3. 上报体里的 `envId` 与建 CloudBase 客户端时用的那个是同一个值。
 *
 * 那三件正是线上 27% `unknown` 的现场，所以必须有这一层。
 *
 * **哪些是真的**：真 `http`-free 的 MCP 协议（`InMemoryTransport` + 真 `Client`）、
 * 真 `createCloudBaseMcpServer`、真文件（临时 HOME 下的 `auth.json`）、真 telemetry reporter。
 * **唯一被替换的**：`@cloudbase/manager-node` —— 不让测试发真网络请求。它只负责建客户端，
 * 环境 ID 是构造参数，不参与解析，所以换掉它不影响本文件要验的东西。
 */
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const mockCloudBaseCtor = vi.fn();
vi.mock("@cloudbase/manager-node", () => ({
  // vitest 4 起，被 `new` 调用的 mock 实现必须是 function/class。
  default: mockCloudBaseCtor.mockImplementation(function () {
    return {
      commonService: vi.fn(() => ({ call: vi.fn(async () => ({ EnvList: [] })) })),
      env: { listEnvs: vi.fn(async () => ({ EnvList: [] })) },
    };
  }),
}));

let fakeHome: string;
let realHome: string | undefined;
let realHomedir: string;

/**
 * 起一次真实的 server + client 握手。
 *
 * ⚠️ `cloudbaseConfigDir` 是 `@cloudbase/toolbox` 在**模块加载时**算出来的常量，
 * 所以必须在把 HOME 指到临时目录**之后**再动态 import，否则读的还是真机凭据。
 */
async function connect(options: { envId?: string } = {}) {
  const { createCloudBaseMcpServer } = await import("../server.js");
  const server = await createCloudBaseMcpServer({
    pluginsEnabled: [],
    enableTelemetry: true,
    cloudBaseOptions: options.envId ? ({ envId: options.envId } as any) : undefined,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "env-e2e", version: "1.0.0" });
  await client.connect(clientTransport);

  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

/**
 * 把**真机上那份** `auth.json` 复制进临时 HOME，返回里面的 envId。
 *
 * 为什么不手造一份：`peekLoginState()` 会对凭据做有效性校验（站点、密钥形态、
 * 临时密钥字段等），手造的假 secretId 一律被判无效、返回 null —— 那样这条用例
 * 红了也分不清是「实现没改」还是「夹具本身无效」。
 * 真机没有登录态（CI、干净机器）时返回 null，调用方据此 skip。
 */
async function seedRealAuthJson(): Promise<string | null> {
  const src = join(realHomedir, ".config", ".cloudbase", "auth.json");
  try {
    const raw = await readFile(src, "utf8");
    const envId = (JSON.parse(raw) as any)?.credential?.envId;
    if (typeof envId !== "string" || !envId) return null;
    const dir = join(fakeHome, ".config", ".cloudbase");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "auth.json"), raw, "utf8");
    return envId;
  } catch {
    return null;
  }
}

/**
 * tool-wrapper 的 `finally` 里有一段 `isTestEnvironment` 早退（`VITEST === "true"` 就不上报）。
 * 想在测试里观察到上报，必须在这段窗口内把它摘掉 —— 与 `tool-wrapper.test.ts`
 * 里的 `withTelemetryEnabled` 同一手法。
 */
async function withTelemetryOn<T>(run: () => Promise<T>): Promise<T> {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVitest = process.env.VITEST;
  delete process.env.NODE_ENV;
  delete process.env.VITEST;
  try {
    return await run();
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = prevVitest;
  }
}

async function captureReports() {
  const { telemetryReporter } = await import("../utils/telemetry.js");
  const spy = vi.spyOn(telemetryReporter, "report").mockResolvedValue(undefined);
  const payloadOf = (eventCode: string) =>
    (spy.mock.calls.filter((c) => c[0] === eventCode).at(-1)?.[1] ?? {}) as Record<string, any>;
  return { spy, payloadOf };
}

beforeAll(async () => {
  realHomedir = homedir();
  fakeHome = await mkdtemp(join(tmpdir(), "cbmcp-env-e2e-"));
  realHome = process.env.HOME;
  process.env.HOME = fakeHome;
  // 真机上可能存在这些变量，会把梯子的前几档遮住，测不出想测的那一档
  delete process.env.CLOUDBASE_ENV_ID;
  delete process.env.CLOUDBASE_LOCAL_ENDPOINT;
});

afterAll(async () => {
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  await rm(fakeHome, { recursive: true, force: true });
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.CLOUDBASE_ENV_ID;
  delete process.env.CLOUDBASE_LOCAL_ENDPOINT;
});

describe("环境上报 E2E · 现在就该通", () => {
  it("E1 注入 envId：一次真实 tools/call 的上报 envId 与建客户端用的相同", async () => {
    await withTelemetryOn(async () => {
      const { payloadOf } = await captureReports();
      const { client, close } = await connect({ envId: "env-injected-e2e" });

      try {
        await client.callTool({ name: "queryEnv", arguments: { action: "list" } });

        await vi.waitFor(() => {
          const p = payloadOf("toolkit_tool_call");
          expect(p.envId).toBe("env-injected-e2e");
          // 这一档（显式注入）本来就有 source；E3 才验 initialized 那条
          expect(p.envIdSource).toBe("cloudBaseOptions");
        });
      } finally {
        await close();
      }
    });
  }, 30000);

  it("E4 同一 server 连调两次：两次上报的环境一致，不会被上一次污染", async () => {
    await withTelemetryOn(async () => {
      const { spy, payloadOf } = await captureReports();
      const { client, close } = await connect({ envId: "env-stable-e2e" });

      try {
        await client.callTool({ name: "queryEnv", arguments: { action: "list" } });
        await vi.waitFor(() => expect(payloadOf("toolkit_tool_call").envId).toBe("env-stable-e2e"));

        const first = spy.mock.calls.filter((c) => c[0] === "toolkit_tool_call").length;
        await client.callTool({ name: "auth", arguments: { action: "status" } });
        await vi.waitFor(() =>
          expect(spy.mock.calls.filter((c) => c[0] === "toolkit_tool_call").length).toBeGreaterThan(
            first,
          ),
        );

        // 第二次调的是一个「换了工具」的调用：环境不能因为工具变了就丢
        const p = payloadOf("toolkit_tool_call");
        expect(p.envId).toBe("env-stable-e2e");
      } finally {
        await close();
      }
    });
  }, 30000);

  it("E3 initialize 的会话上报带 envIdSource：没注入记 default，注入记 cloudBaseOptions", async () => {
    // 会话事件与进程级 initialized 都发 `toolkit_lifecycle`，靠 mcpClientName 区分 ——
    // 只有会话事件（reportToolkitSessionInitialized）带 clientInfo
    const sessionReports = (spy: { mock: { calls: any[][] } }) =>
      spy.mock.calls
        .filter((c) => c[0] === "toolkit_lifecycle" && (c[1] as any)?.mcpClientName)
        .map((c) => c[1] as Record<string, any>);

    await withTelemetryOn(async () => {
      const { spy } = await captureReports();

      const plain = await connect();
      try {
        await vi.waitFor(() => {
          expect(sessionReports(spy).length).toBeGreaterThan(0);
          // 没注入、本地也没有环境时就是 default —— 线上那批「unknown」在 source 上的样子
          expect(sessionReports(spy).at(-1)!.envIdSource).toBe("default");
        });
      } finally {
        await plain.close();
      }

      const injected = await connect({ envId: "env-session-e2e" });
      try {
        await vi.waitFor(() => {
          const p = sessionReports(spy).at(-1)!;
          expect(p.envId).toBe("env-session-e2e");
          expect(p.envIdSource).toBe("cloudBaseOptions");
        });
      } finally {
        await injected.close();
      }
    });
  }, 30000);
});

/**
 * 真凭据链路：用真机上那份 `auth.json` 的副本，验「登录态命中 → 上报 login_state」。
 *
 * 本机没有登录态时（CI、干净机器）自动 skip —— 不手造假凭据，因为
 * `peekLoginState()` 会对凭据做有效性校验，假 secretId 一律被判无效，
 * 那样红了也分不清是「实现没改」还是「夹具无效」。
 */
describe("环境上报 E2E · 登录态", () => {
  it("E2 真实 auth.json + 无项目配置：上报 source=login_state，且缓存仍空", async (ctx) => {
    const expected = await seedRealAuthJson();
    if (!expected) {
      ctx.skip();
      return;
    }
    vi.resetModules();

    const { payloadOf } = await captureReports();
    const { getCachedEnvId } = await import("../cloudbase-manager.js");
    const { peekLoginState } = await import("../auth.js");

    const state = await peekLoginState();
    expect(state?.envId).toBe(expected);

    await withTelemetryOn(async () => {
      const { client, close } = await connect();
      try {
        await client.callTool({ name: "queryEnv", arguments: { action: "list" } });
        await vi.waitFor(() => {
          const p = payloadOf("toolkit_tool_call");
          expect(p.envId).toBe(expected);
          expect(p.envIdSource).toBe("login_state");
        });
        expect(getCachedEnvId()).toBeNull();
      } finally {
        await close();
      }
    });
  }, 30000);
});
