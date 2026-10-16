import { afterEach, describe, expect, it, vi } from "vitest";
import { wrapServerWithTelemetry } from "./tool-wrapper.js";

/**
 * 包装层级别的端到端：证明"客户端没确认时，工具的处理函数**真的没被执行**"。
 *
 * 这是唯一能证明护栏接上了的测试 —— 只测 guard 函数本身，无法发现"接线位置接错/被跳过"。
 */

vi.mock("./cloud-mode.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./cloud-mode.js")>();
    return { ...actual, shouldRegisterTool: vi.fn(() => true) };
});

vi.mock("./telemetry.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./telemetry.js")>();
    return {
        ...actual,
        reportToolCall: vi.fn(() => Promise.resolve()),
        reportElicitationResult: vi.fn(() => Promise.resolve()),
        readMcpClientInfoFromServer: vi.fn(() => ({ name: "test-client", version: "0.0.1" })),
        readClientCapabilitiesFromServer: vi.fn(() => ({ elicitationForm: true })),
    };
});

const CONFIRM_LABEL = "确认删除";
const CANCEL_LABEL = "取消";

/**
 * 注册一个工具并取回**包装后**的 handler。
 * `wrapServerWithTelemetry` 靠覆盖 `server.registerTool` 注入包装，所以这里用一个假的注册入口接住。
 */
function registerWrappedTool(
    handler: (args: any, extra?: any) => Promise<any>,
    elicitInput: (params: any, options?: any) => Promise<any>,
    caps: unknown = { elicitation: { form: {} } },
) {
    const registered: any[][] = [];
    const server: any = {
        registerTool: (...args: any[]) => {
            registered.push(args);
        },
        cloudBaseOptions: { envId: "env-abc" },
    };
    wrapServerWithTelemetry(server);
    server.registerTool(
        "manageFunctions",
        { title: "manageFunctions", description: "test tool", inputSchema: {} },
        handler,
    );
    // 注入客户端能力与 elicitInput（真实 server 由 SDK 提供这两个入口）
    server.server = {
        getClientCapabilities: () => caps,
        elicitInput,
    };
    const wrapped = registered[0][2] as (args: any, extra?: any) => Promise<any>;
    return { wrapped, server };
}

const DELETE_ARGS = { action: "deleteFunction", functionName: "hello" };

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("破坏性动作的执行前确认（经包装层）", () => {
    it("客户端确认后才真正执行", async () => {
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "已删除" }] }));
        const { wrapped } = registerWrappedTool(handler, async () => ({
            action: "accept",
            content: { confirm: CONFIRM_LABEL },
        }));

        const result = await wrapped(DELETE_ARGS, { requestId: 1 });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(result.content[0].text).toBe("已删除");
    });

    it("用户取消 ⇒ 处理函数一次都没被调用，且返回体不标错", async () => {
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "已删除" }] }));
        const { wrapped } = registerWrappedTool(handler, async () => ({
            action: "accept",
            content: { confirm: CANCEL_LABEL },
        }));

        const result = await wrapped(DELETE_ARGS, { requestId: 2 });

        expect(handler).not.toHaveBeenCalled();
        expect(result.content[0].text).toContain("未执行");
        expect(result.content[0].text).toContain("hello");
        expect(result.isError).toBeUndefined();
        expect(result.structuredContent.success).toBeUndefined();
    });

    it("客户端自行应答（完全访问模式）⇒ 按未询问放行，照常执行", async () => {
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "已删除" }] }));
        const { wrapped } = registerWrappedTool(handler, async () => ({ action: "decline" }));

        const result = await wrapped(DELETE_ARGS, { requestId: 3 });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(result.content[0].text).toBe("已删除");
    });

    it("客户端未声明 form 能力 ⇒ 不弹窗、照常执行", async () => {
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "已删除" }] }));
        const elicitInput = vi.fn(async () => ({ action: "decline" }));
        const { wrapped } = registerWrappedTool(handler, elicitInput, { roots: {} });

        await wrapped(DELETE_ARGS, { requestId: 4 });

        expect(elicitInput).not.toHaveBeenCalled();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("非破坏性 action 的行为零变化（不弹窗、不打扰）", async () => {
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
        const elicitInput = vi.fn(async () => ({ action: "decline" }));
        const { wrapped } = registerWrappedTool(handler, elicitInput);

        await wrapped({ action: "listFunctions" }, { requestId: 5 });

        expect(elicitInput).not.toHaveBeenCalled();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("跳过清单命中 ⇒ 不弹窗、照常执行", async () => {
        vi.stubEnv("CLOUDBASE_MCP_SKIP_ELICITATIONS", "manageFunctions.deleteFunction");
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "已删除" }] }));
        const elicitInput = vi.fn(async () => ({ action: "decline" }));
        const { wrapped } = registerWrappedTool(handler, elicitInput);

        await wrapped(DELETE_ARGS, { requestId: 6 });

        expect(elicitInput).not.toHaveBeenCalled();
        expect(handler).toHaveBeenCalledTimes(1);
    });
});
