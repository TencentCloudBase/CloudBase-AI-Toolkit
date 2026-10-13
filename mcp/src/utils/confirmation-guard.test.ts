import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { t } from "../i18n/index.js";
import {
    AUTO_APPROVE_ENV_NAME,
    AUTO_ANSWER_THRESHOLD_MS,
    CONFIRMATION_TIMEOUT_MS,
    guardDestructiveAction,
    SKIP_ENV_NAME,
    type ConfirmationServer,
} from "./confirmation-guard.js";

// 遥测在单测里不需要真发请求；只屏蔽上报，保留能力解析的真实实现
vi.mock("./telemetry.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./telemetry.js")>();
    return { ...actual, reportElicitationResult: vi.fn(async () => undefined) };
});

const FORM_CAPS = { elicitation: { form: {} } };
const CONFIRM_LABEL = t("confirmation.option.confirm");

type ElicitReply = { action: string; content?: Record<string, unknown> };

function makeServer(
    reply: ElicitReply | Error,
    options: { caps?: unknown; delayMs?: number } = {},
): { server: ConfirmationServer; elicitInput: ReturnType<typeof vi.fn> } {
    const elicitInput = vi.fn(async () => {
        if (options.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }
        if (reply instanceof Error) {
            throw reply;
        }
        return reply;
    });
    const server: ConfirmationServer = {
        server: {
            getClientCapabilities: () => options.caps ?? FORM_CAPS,
            elicitInput,
        },
        cloudBaseOptions: { envId: "env-abc" },
    };
    return { server, elicitInput };
}

const DELETE_ARGS = { action: "deleteFunction", functionName: "hello" };

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("破坏性动作执行前确认", () => {
    it("未命中名单时不做任何事（读操作零变化）", async () => {
        const { server, elicitInput } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        const decision = await guardDestructiveAction(server, {
            toolName: "manageFunctions",
            args: { action: "listFunctions" },
        });
        expect(decision).toEqual({ intercept: false, status: "not_applicable" });
        expect(elicitInput).not.toHaveBeenCalled();
    });

    it("客户端未声明 form 能力时不弹、照常执行", async () => {
        const { server, elicitInput } = makeServer({ action: "accept" }, { caps: { roots: {} } });
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });
        expect(decision).toEqual({ intercept: false, status: "unsupported" });
        expect(elicitInput).not.toHaveBeenCalled();
    });

    it("用户在确认框里确认后放行，且文案带目标与受控选项", async () => {
        const { server, elicitInput } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });

        expect(decision).toEqual({ intercept: false, status: "accepted" });
        const [params, options] = elicitInput.mock.calls[0];
        expect(params.mode).toBe("form");
        expect(params.message).toContain("hello");
        expect(params.message).toContain("env-abc");
        // 受控选项：只有"确认/取消"两个值，默认落在取消上
        expect(params.requestedSchema.properties.confirm.enum).toHaveLength(2);
        expect(params.requestedSchema.properties.confirm.default).toBe(t("confirmation.option.cancel"));
        expect(options.timeout).toBe(CONFIRMATION_TIMEOUT_MS);
    });

    it("用户在表单里选了『取消』（accept + 取消值）也不执行", async () => {
        const { server } = makeServer({
            action: "accept",
            content: { confirm: t("confirmation.option.cancel") },
        });
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });
        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("cancelled");
            expect(decision.result.content[0].text).toContain("未执行");
        }
    });

    it("客户端自行应答（<500ms）按『未询问』放行", async () => {
        const { server } = makeServer({ action: "decline" }, { delayMs: 1 });
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });
        expect(decision).toEqual({ intercept: false, status: "auto_approved" });
    });

    it("自动审批也拦下时（=block）返回未执行，且不标错、不带 success 字段", async () => {
        vi.stubEnv(AUTO_APPROVE_ENV_NAME, "block");
        const { server } = makeServer({ action: "decline" }, { delayMs: 1 });
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });

        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("auto_approved_blocked");
            expect(decision.result.content[0].text).toContain("未执行");
            expect(decision.result.content[0].text).toContain("hello");
            // 不标错：既没有 isError，也没有会被包装层标成错误的 success 字段
            expect((decision.result as Record<string, unknown>).isError).toBeUndefined();
            expect(decision.result.structuredContent.success).toBeUndefined();
            expect(decision.result.structuredContent.executed).toBe(false);
        }
    });

    it("人点了拒绝（耗时超过阈值）⇒ 不执行", async () => {
        const { server } = makeServer({ action: "decline" }, { delayMs: AUTO_ANSWER_THRESHOLD_MS + 50 });
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });
        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("cancelled");
            expect(decision.result.structuredContent.executed).toBe(false);
        }
    });

    it("超时 ⇒ 不执行", async () => {
        const { server } = makeServer(new McpError(ErrorCode.RequestTimeout, "Request timed out"));
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });
        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("timeout");
            expect(decision.result.content[0].text).toContain("未执行");
        }
    });

    it("确认流程出错 ⇒ 不执行（不放行）", async () => {
        const { server } = makeServer(new Error("transport closed"));
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });
        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("error");
            expect(decision.result.structuredContent.executed).toBe(false);
        }
    });

    it("跳过清单支持『工具名.action』与『工具名』两种写法", async () => {
        vi.stubEnv(SKIP_ENV_NAME, "manageFunctions.deleteFunction");
        const first = makeServer({ action: "decline" });
        expect(
            await guardDestructiveAction(first.server, { toolName: "manageFunctions", args: DELETE_ARGS }),
        ).toEqual({ intercept: false, status: "skipped" });
        expect(first.elicitInput).not.toHaveBeenCalled();

        vi.stubEnv(SKIP_ENV_NAME, "manageFunctions");
        const second = makeServer({ action: "decline" });
        expect(
            await guardDestructiveAction(second.server, { toolName: "manageFunctions", args: DELETE_ARGS }),
        ).toEqual({ intercept: false, status: "skipped" });
    });

    it("跳过清单区分大小写", async () => {
        vi.stubEnv(SKIP_ENV_NAME, "managefunctions.deletefunction");
        const { server, elicitInput } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });
        expect(decision.status).toBe("accepted");
        expect(elicitInput).toHaveBeenCalled();
    });

    it("跳过清单里的未知条目会显式告警（而不是静默忽略）", async () => {
        vi.resetModules();
        vi.stubEnv(SKIP_ENV_NAME, "noSuchTool,somethingElse");
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { readSkipList } = await import("./confirmation-guard.js");
        const entries = readSkipList();
        expect(entries).toEqual(["noSuchTool", "somethingElse"]);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("无法识别的条目"));
        errorSpy.mockRestore();
    });
});
