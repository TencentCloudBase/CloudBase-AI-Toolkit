import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { t } from "../i18n/index.js";
import { noteEnvBinding, runInEnvSlot } from "./env-binding.js";
import {
    AUTO_APPROVE_ENV_NAME,
    AUTO_ANSWER_THRESHOLD_MS,
    CONFIRMATION_TIMEOUT_MS,
    DESTRUCTIVE_POLICY_ENV,
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

    it("文档删除按 isMulti 说明范围，不把缺省条数写成 1", async () => {
        const one = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        await guardDestructiveAction(one.server, {
            toolName: "writeNoSqlDatabaseContent",
            args: { action: "delete", collectionName: "todos", query: { done: true }, documents: [1, 2] },
        });
        const oneMessage = one.elicitInput.mock.calls[0][0].message as string;
        expect(oneMessage).toContain("一条");
        expect(oneMessage).not.toContain("1 条");

        const many = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        await guardDestructiveAction(many.server, {
            toolName: "writeNoSqlDatabaseContent",
            args: { action: "delete", collectionName: "todos", query: {}, isMulti: true },
        });
        const manyMessage = many.elicitInput.mock.calls[0][0].message as string;
        expect(manyMessage).toContain("所有匹配查询");
        expect(manyMessage).not.toContain("1 条");
    });

    it("callCloudApi 的已知删除会确认，查询和其它产品的删除不会", async () => {
        const hit = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        const decision = await guardDestructiveAction(hit.server, {
            toolName: "callCloudApi",
            args: {
                service: "tcb",
                action: "deletefunction",
                params: { FunctionName: "hello", EnvId: "env-abc" },
            },
        });
        expect(decision).toEqual({ intercept: false, status: "accepted" });
        expect(hit.elicitInput.mock.calls[0][0].message).toContain("hello");

        const miss = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        expect(
            await guardDestructiveAction(miss.server, {
                toolName: "callCloudApi",
                args: { service: "cvm", action: "TerminateInstances", params: { InstanceIds: ["ins-1"] } },
            }),
        ).toEqual({ intercept: false, status: "not_applicable" });
        expect(miss.elicitInput).not.toHaveBeenCalled();
    });

    it("销毁环境时点名 params.EnvId，不把会话环境写成被删的那个", async () => {
        const { server, elicitInput } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        await guardDestructiveAction(server, {
            toolName: "callCloudApi",
            args: { service: "tcb", action: "DestroyEnv", params: { EnvId: "env-gone" } },
        });
        const message = elicitInput.mock.calls[0][0].message as string;
        expect(message).toContain("env-gone");
        expect(message).toContain("销毁环境");
        expect(message).not.toContain("env-abc");
    });

    it("销毁 MySQL 时读出 instanceId，没有时说明是当前环境的实例", async () => {
        const named = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        await guardDestructiveAction(named.server, {
            toolName: "manageMysqlDatabase",
            args: { action: "destroyMySQL", dbInstance: { instanceId: "mysql-1" } },
        });
        expect(named.elicitInput.mock.calls[0][0].message).toContain("mysql-1");

        const unnamed = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        await guardDestructiveAction(unnamed.server, {
            toolName: "manageMysqlDatabase",
            args: { action: "destroyMySQL", dbInstance: { schema: "app" } },
        });
        const message = unnamed.elicitInput.mock.calls[0][0].message as string;
        expect(message).toContain("当前环境的 MySQL 实例");
        expect(message).not.toContain("未能从参数中取到资源名");
    });

    it("没有实例 envId 时，确认文案用槽里记下的登录态环境", async () => {
        const { server, elicitInput } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        server.cloudBaseOptions = {};
        await runInEnvSlot(async () => {
            noteEnvBinding({ envId: "env-from-login", source: "login_state" });
            await guardDestructiveAction(server, { toolName: "manageFunctions", args: DELETE_ARGS });
        });
        expect(elicitInput.mock.calls[0][0].message).toContain("env-from-login");
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

describe("客户端问不了人时：只拒绝「删掉一整块数据」那一档", () => {
    /** 声明了 capabilities，但里面没有 elicitation —— 这是大多数客户端的真实形态 */
    const NO_FORM = { roots: {} };

    const destroyMysql = { action: "destroyMySQL", confirm: true };
    const deleteFunction = { action: "deleteFunction", functionName: "hello" };

    it("destroyMySQL 默认被拦下，返回「未执行」", async () => {
        const { server, elicitInput } = makeServer({ action: "accept" }, { caps: NO_FORM });
        const decision = await guardDestructiveAction(server, {
            toolName: "manageMysqlDatabase",
            args: destroyMysql,
        });
        expect(decision.intercept).toBe(true);
        expect(decision.status).toBe("unsupported");
        const text = (decision as { result: { content: Array<{ text: string }> } }).result.content[0].text;
        expect(text).toContain("未执行");
        expect(text).toContain("控制台");
        expect(elicitInput).not.toHaveBeenCalled();
    });

    it("不在这一档的动作照旧放行（删函数不需要确认也能做）", async () => {
        const { server } = makeServer({ action: "accept" }, { caps: NO_FORM });
        const decision = await guardDestructiveAction(server, { toolName: "manageFunctions", args: deleteFunction });
        expect(decision).toEqual({ intercept: false, status: "unsupported" });
    });

    it("策略设成 allow 时完全回到旧行为", async () => {
        vi.stubEnv(DESTRUCTIVE_POLICY_ENV, "allow");
        const { server } = makeServer({ action: "accept" }, { caps: NO_FORM });
        const decision = await guardDestructiveAction(server, {
            toolName: "manageMysqlDatabase",
            args: destroyMysql,
        });
        expect(decision).toEqual({ intercept: false, status: "unsupported" });
    });

    it("策略设成 observe 时放行但标记 would_block", async () => {
        vi.stubEnv(DESTRUCTIVE_POLICY_ENV, "observe");
        const { server } = makeServer({ action: "accept" }, { caps: NO_FORM });
        const decision = await guardDestructiveAction(server, {
            toolName: "manageMysqlDatabase",
            args: destroyMysql,
        });
        expect(decision).toEqual({ intercept: false, status: "would_block" });
    });

    it("删目录拦、删单文件放行、缺 isDirectory 时按目录拦", async () => {
        const dir = makeServer({ action: "accept" }, { caps: NO_FORM });
        expect(
            (
                await guardDestructiveAction(dir.server, {
                    toolName: "manageStorage",
                    args: { action: "delete", cloudPath: "uploads/", isDirectory: true },
                })
            ).intercept,
        ).toBe(true);

        const file = makeServer({ action: "accept" }, { caps: NO_FORM });
        expect(
            (
                await guardDestructiveAction(file.server, {
                    toolName: "manageStorage",
                    args: { action: "delete", cloudPath: "a.png", isDirectory: false },
                })
            ).intercept,
        ).toBe(false);

        const missing = makeServer({ action: "accept" }, { caps: NO_FORM });
        expect(
            (
                await guardDestructiveAction(missing.server, {
                    toolName: "manageStorage",
                    args: { action: "delete", cloudPath: "uploads/" },
                })
            ).intercept,
        ).toBe(true);
    });

    it("DestroyEnv 只在 DeleteDirectly 时拦（布尔与字符串两种写法都认）", async () => {
        const hard = makeServer({ action: "accept" }, { caps: NO_FORM });
        expect(
            (
                await guardDestructiveAction(hard.server, {
                    toolName: "callCloudApi",
                    args: { service: "tcb", action: "DestroyEnv", params: { EnvId: "e1", DeleteDirectly: true } },
                })
            ).intercept,
        ).toBe(true);

        const hardString = makeServer({ action: "accept" }, { caps: NO_FORM });
        expect(
            (
                await guardDestructiveAction(hardString.server, {
                    toolName: "callCloudApi",
                    args: { service: "tcb", action: "DestroyEnv", params: { EnvId: "e1", DeleteDirectly: "true" } },
                })
            ).intercept,
        ).toBe(true);

        const soft = makeServer({ action: "accept" }, { caps: NO_FORM });
        expect(
            (
                await guardDestructiveAction(soft.server, {
                    toolName: "callCloudApi",
                    args: { service: "tcb", action: "DestroyEnv", params: { EnvId: "e1" } },
                })
            ).intercept,
        ).toBe(false);
    });

    it("PostgreSQL 只拦 DROP / TRUNCATE，DELETE 是业务语句", async () => {
        const drop = makeServer({ action: "accept" }, { caps: NO_FORM });
        expect(
            (
                await guardDestructiveAction(drop.server, {
                    toolName: "managePgDatabase",
                    args: { action: "execute", sql: "DROP TABLE users", allowDdlViaExecute: true },
                })
            ).intercept,
        ).toBe(true);

        const del = makeServer({ action: "accept" }, { caps: NO_FORM });
        expect(
            (
                await guardDestructiveAction(del.server, {
                    toolName: "managePgDatabase",
                    args: { action: "execute", sql: "DELETE FROM users WHERE id = 1" },
                })
            ).intercept,
        ).toBe(false);
    });

    it("cynosdb 的 IsolateCluster 也能被识别并拦下", async () => {
        const { server } = makeServer({ action: "accept" }, { caps: NO_FORM });
        const decision = await guardDestructiveAction(server, {
            toolName: "callCloudApi",
            args: { service: "cynosdb", action: "IsolateCluster", params: { ClusterId: "cynosdbmysql-x" } },
        });
        expect(decision.intercept).toBe(true);
    });
});
