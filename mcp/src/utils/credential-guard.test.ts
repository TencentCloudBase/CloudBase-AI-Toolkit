import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { t } from "../i18n/index.js";
import {
    CREDENTIAL_GUARD_SKIP_ENV_NAME,
    findCredentialCandidates,
    guardCredentialWrite,
    type CredentialGuardServer,
} from "./credential-guard.js";

// 遥测在单测里不需要真发请求；只屏蔽上报，保留能力解析的真实实现
vi.mock("./telemetry.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./telemetry.js")>();
    return { ...actual, reportElicitationResult: vi.fn(async () => undefined) };
});

const FORM_CAPS = { elicitation: { form: {} } };
const CONFIRM_LABEL = t("credential.option.confirm");

/** 自造 JWT 样本（非真实凭证）：三段 base64url，长度用于断言分段摘要 */
const JWT = `eyJhbGciOiJSUzI1NiJ9.${"a".repeat(60)}.${"B".repeat(342)}`;
/** "被改写一个字符"的对照样本：把末段第一个字符换掉 */
const JWT_SHIFTED = `eyJhbGciOiJSUzI1NiJ9.${"a".repeat(60)}.${"C"}${"B".repeat(341)}`;
const OPAQUE = "cb_secret_" + "x".repeat(40);

type ElicitReply = { action: string; content?: Record<string, unknown> };

function makeServer(
    reply: ElicitReply | Error,
    options: { caps?: unknown; delayMs?: number } = {},
): { server: CredentialGuardServer; elicitInput: ReturnType<typeof vi.fn> } {
    const elicitInput = vi.fn(async () => {
        if (options.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }
        if (reply instanceof Error) {
            throw reply;
        }
        return reply;
    });
    const server: CredentialGuardServer = {
        server: { getClientCapabilities: () => options.caps ?? FORM_CAPS, elicitInput },
        cloudBaseOptions: { envId: "env-abc" },
    };
    return { server, elicitInput };
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("findCredentialCandidates：保守扫描", () => {
    it("命中：顶层 JWT / 嵌套对象 / 数组里的值", () => {
        const args = {
            value: JWT,
            envVariables: { TOKEN: JWT_SHIFTED },
            list: ["nope", OPAQUE],
        };
        const found = findCredentialCandidates(args);
        expect(found.map((c) => c.kind)).toEqual(["jwt", "jwt", "opaque-key"]);
        expect(found.map((c) => c.path)).toEqual(["value", "envVariables.TOKEN", "list[1]"]);
    });

    it("不命中：非凭证字符串 / 非字符串值 / 近乎 JWT 但不合法", () => {
        const found = findCredentialCandidates({
            a: "hello world",
            b: 123,
            c: null,
            d: undefined,
            e: ["eyJhbGciOiJSUzI1NiJ9.only-two-parts"],
            f: "cb_other_prefix_xyz",
            g: true,
        });
        expect(found).toEqual([]);
    });

    it("超深（> 8 层）不扫", () => {
        let node: any = JWT;
        for (let i = 0; i < 12; i += 1) {
            node = { nested: node };
        }
        expect(findCredentialCandidates(node)).toEqual([]);
    });

    it("数组上限 500：第 501 项之后不再扫", () => {
        const list = new Array(600).fill("plain");
        list[550] = JWT;
        expect(findCredentialCandidates({ list })).toEqual([]);
        list[499] = JWT;
        expect(findCredentialCandidates({ list }).length).toBe(1);
    });

    it("扫描本身不发起任何网络请求", () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        findCredentialCandidates({ value: JWT, nested: { deep: [OPAQUE] } });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe("guardCredentialWrite：软确认判据", () => {
    it("没有凭证形态字符串 ⇒ 不做任何事、不弹", async () => {
        const { server, elicitInput } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } });
        const decision = await guardCredentialWrite(server, {
            toolName: "manageCloudRun",
            args: { envId: "env-abc", envVariables: { NORMAL: "on" } },
        });
        expect(decision).toEqual({ intercept: false, status: "not_applicable" });
        expect(elicitInput).not.toHaveBeenCalled();
    });

    it("人确认（非秒回）⇒ 放行，且消息里不含明文、含长度/分段/指纹", async () => {
        const { server, elicitInput } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } }, { delayMs: 600 });
        const decision = await guardCredentialWrite(server, {
            toolName: "manageCloudRun",
            args: { envVariables: { TOKEN: JWT } },
        });

        expect(decision).toEqual({ intercept: false, status: "confirmed" });
        const [params] = elicitInput.mock.calls[0];
        const message: string = params.message;
        // 不含明文
        expect(message).not.toContain(JWT);
        expect(message).not.toContain(JWT.slice(0, 20));
        // 含三样摘要
        expect(message).toContain(String(JWT.length));
        expect(message).toContain("20 / 60 / 342");
        expect(message).toContain(createHash("sha256").update(JWT).digest("hex").slice(0, 12));
        // 受控选项
        expect(params.requestedSchema.properties.confirm.enum).toHaveLength(2);
        expect(params.requestedSchema.properties.confirm.default).toBe(t("credential.option.cancel"));
    });

    it("🔴 秒回（即使内容是同意的）⇒ 不写，理由是没有人类参与", async () => {
        const { server } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } }, { delayMs: 1 });
        const decision = await guardCredentialWrite(server, {
            toolName: "manageCloudRun",
            args: { envVariables: { TOKEN: JWT } },
        });
        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("instant");
            expect(decision.result.content[0].text).toContain("未执行");
            expect(decision.result.structuredContent.executed).toBe(false);
        }
    });

    it("秒回 decline 同样不写", async () => {
        const { server } = makeServer({ action: "decline" }, { delayMs: 1 });
        const decision = await guardCredentialWrite(server, { toolName: "manageCloudRun", args: { x: JWT } });
        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("instant");
        }
    });

    it("人拒绝（非秒回）⇒ 不写", async () => {
        const { server } = makeServer({ action: "decline" }, { delayMs: 600 });
        const decision = await guardCredentialWrite(server, { toolName: "manageCloudRun", args: { x: JWT } });
        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("cancelled");
            expect(decision.result.structuredContent.executed).toBe(false);
        }
    });

    it("超时 ⇒ 不写", async () => {
        const { server } = makeServer(new McpError(ErrorCode.RequestTimeout, "Request timed out"));
        const decision = await guardCredentialWrite(server, { toolName: "manageCloudRun", args: { x: JWT } });
        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("timeout");
        }
    });

    it("核对通道出错 ⇒ 不写", async () => {
        const { server } = makeServer(new Error("transport closed"));
        const decision = await guardCredentialWrite(server, { toolName: "manageCloudRun", args: { x: JWT } });
        expect(decision.intercept).toBe(true);
        if (decision.intercept) {
            expect(decision.status).toBe("error");
        }
    });

    it("客户端没有表单 elicitation 能力 ⇒ 放行（软设计），只记日志不弹", async () => {
        const { server, elicitInput } = makeServer({ action: "accept" }, { caps: { roots: {} } });
        const decision = await guardCredentialWrite(server, { toolName: "manageCloudRun", args: { x: JWT } });
        expect(decision).toEqual({ intercept: false, status: "unsupported" });
        expect(elicitInput).not.toHaveBeenCalled();
    });

    it("跳过清单支持『工具名』与『工具名.action』，区分大小写", async () => {
        vi.stubEnv(CREDENTIAL_GUARD_SKIP_ENV_NAME, "manageCloudRun.updateConfig");
        const first = makeServer({ action: "decline" });
        expect(
            await guardCredentialWrite(first.server, {
                toolName: "manageCloudRun",
                args: { action: "updateConfig", x: JWT },
            }),
        ).toEqual({ intercept: false, status: "skipped" });
        expect(first.elicitInput).not.toHaveBeenCalled();

        vi.stubEnv(CREDENTIAL_GUARD_SKIP_ENV_NAME, "managecloudrun");
        const second = makeServer({ action: "decline" });
        const decision = await guardCredentialWrite(second.server, { toolName: "manageCloudRun", args: { x: JWT } });
        expect(decision.status).not.toBe("skipped");
        expect(second.elicitInput).toHaveBeenCalled();
    });

    it("🔴 全程零网络：命中凭证、走完核对，fetch 一次都没被调用", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const { server } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } }, { delayMs: 600 });
        await guardCredentialWrite(server, { toolName: "manageCloudRun", args: { envVariables: { TOKEN: JWT } } });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("不透明 key 只形态识别 + 核对（本期同样走软确认）", async () => {
        const { server, elicitInput } = makeServer({ action: "accept", content: { confirm: CONFIRM_LABEL } }, { delayMs: 600 });
        const decision = await guardCredentialWrite(server, { toolName: "manageStorage", args: { key: OPAQUE } });
        expect(decision).toEqual({ intercept: false, status: "confirmed" });
        const [params] = elicitInput.mock.calls[0];
        expect(params.message).not.toContain(OPAQUE);
        expect(params.message).toContain(createHash("sha256").update(OPAQUE).digest("hex").slice(0, 12));
    });
});
