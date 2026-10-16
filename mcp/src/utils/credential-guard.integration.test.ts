import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";
import { wrapServerWithTelemetry } from "./tool-wrapper.js";

/**
 * 包装层级别的端到端：证明"凭证核对未通过时，工具的处理函数**真的没被执行**"，
 * 以及返回体不标错、不带 `success`（否则模型会当失败并重试）。
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

const CONFIRM_LABEL = t("credential.option.confirm");
const JWT = `eyJhbGciOiJSUzI1NiJ9.${"a".repeat(60)}.${"B".repeat(342)}`;

const registered: any[][] = [];

function registerWrappedTool(
    handler: (args: any, extra?: any) => Promise<any>,
    elicitInput: (params: any, options?: any) => Promise<any>,
    caps: unknown = { elicitation: { form: {} } },
) {
    const server: any = {
        registerTool: (...args: any[]) => {
            registered.push(args);
        },
        cloudBaseOptions: { envId: "env-abc" },
    };
    wrapServerWithTelemetry(server);
    server.registerTool("manageCloudRun", { title: "manageCloudRun", description: "test tool", inputSchema: {} }, handler);
    server.server = { getClientCapabilities: () => caps, elicitInput };
    return { wrapped: registered[registered.length - 1][2] as (args: any, extra?: any) => Promise<any>, server };
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("凭证写入软确认（经包装层）", () => {
    it("秒回（未经人工核对）⇒ 处理函数一次都没被调用，且返回体不标错、不带 success", async () => {
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "已写入" }] }));
        const elicitInput = vi.fn(async () => {
            await new Promise((r) => setTimeout(r, 1)); // 秒回
            return { action: "accept", content: { confirm: CONFIRM_LABEL } };
        });
        const { wrapped } = registerWrappedTool(handler, elicitInput);

        const result = await wrapped({ action: "updateConfig", envVariables: { TOKEN: JWT } }, { requestId: 1 });

        expect(handler).not.toHaveBeenCalled();
        expect(result.isError).toBeUndefined();
        expect(result.structuredContent.success).toBeUndefined();
        expect(result.structuredContent.executed).toBe(false);
        expect(result.content[0].text).toContain("未执行");
    });

    it("人确认（非秒回）⇒ 照常执行", async () => {
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "已写入" }] }));
        const elicitInput = vi.fn(async () => {
            await new Promise((r) => setTimeout(r, 600));
            return { action: "accept", content: { confirm: CONFIRM_LABEL } };
        });
        const { wrapped } = registerWrappedTool(handler, elicitInput);

        const result = await wrapped({ action: "updateConfig", envVariables: { TOKEN: JWT } }, { requestId: 2 });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(result.content[0].text).toBe("已写入");
    });

    it("参数里没有凭证 ⇒ 零变化（不弹、照常执行）", async () => {
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
        const elicitInput = vi.fn(async () => ({ action: "decline" }));
        const { wrapped } = registerWrappedTool(handler, elicitInput);

        await wrapped({ action: "updateConfig", envVariables: { NORMAL: "on" } }, { requestId: 3 });

        expect(elicitInput).not.toHaveBeenCalled();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("客户端不支持表单 elicitation ⇒ 放行、照常执行", async () => {
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
        const elicitInput = vi.fn(async () => ({ action: "decline" }));
        const { wrapped } = registerWrappedTool(handler, elicitInput, { roots: {} });

        await wrapped({ action: "updateConfig", envVariables: { TOKEN: JWT } }, { requestId: 4 });

        expect(elicitInput).not.toHaveBeenCalled();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("跳过清单命中 ⇒ 不弹、照常执行", async () => {
        vi.stubEnv("CLOUDBASE_MCP_SKIP_CREDENTIAL_GUARD", "manageCloudRun.updateConfig");
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
        const elicitInput = vi.fn(async () => ({ action: "decline" }));
        const { wrapped } = registerWrappedTool(handler, elicitInput);

        await wrapped({ action: "updateConfig", envVariables: { TOKEN: JWT } }, { requestId: 5 });

        expect(elicitInput).not.toHaveBeenCalled();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("凭证护栏先于破坏性确认：凭证被拦时破坏性确认不会被发起", async () => {
        vi.stubEnv("CLOUDBASE_MCP_SKIP_ELICITATIONS", "");
        const handler = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
        const messages: string[] = [];
        const elicitInput = vi.fn(async (params: any) => {
            messages.push(params.message);
            await new Promise((r) => setTimeout(r, 1));
            return { action: "decline" };
        });
        const server: any = {
            registerTool: (...args: any[]) => registered.push(args),
            cloudBaseOptions: { envId: "env-abc" },
        };
        wrapServerWithTelemetry(server);
        // 同时命中两个名单：manageFunctions.deleteFunction（破坏性）与凭证形态
        server.registerTool("manageFunctions", { title: "manageFunctions", description: "t", inputSchema: {} }, handler);
        server.server = { getClientCapabilities: () => ({ elicitation: { form: {} } }), elicitInput };
        const wrapped = registered[registered.length - 1][2] as (args: any, extra?: any) => Promise<any>;

        await wrapped({ action: "deleteFunction", functionName: JWT }, { requestId: 6 });

        expect(handler).not.toHaveBeenCalled();
        // 只发起了一次询问，且是凭证核对（不是删除确认）
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("原始来源");
    });
});
