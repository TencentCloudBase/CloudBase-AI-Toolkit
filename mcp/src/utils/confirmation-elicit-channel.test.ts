import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { wrapServerWithTelemetry } from "./tool-wrapper.js";

/**
 * **真实通道**回归测试：不 mock SDK，用真的 `McpServer` + `InMemoryTransport` + 真的 `Client`
 * 走一次完整握手，断言"客户端确实收到了 `elicitation/create`"。
 *
 * 为什么必须有它：`confirmation-guard.test.ts` / `confirmation-integration.test.ts` 都把
 * `elicitInput` 换成 `vi.fn()`，`this` 无关紧要 ⇒ 照不出「把方法摘下来调用、丢了接收者」这类
 * 连接层 bug（2026-10-14 实测：`elicitation.ts` 摘 `elicitInput` 导致真实客户端永远弹不出确认框，
 * 而当时 33 条单测全绿）。这条测试在修复前必须红。
 */

vi.mock("./cloud-mode.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./cloud-mode.js")>();
    return { ...actual, shouldRegisterTool: vi.fn(() => true) };
});

vi.mock("./telemetry.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./telemetry.js")>();
    return {
        ...actual,
        reportToolCall: vi.fn(async () => undefined),
        reportElicitationResult: vi.fn(async () => undefined),
        readMcpClientInfoFromServer: vi.fn(() => undefined),
        readClientCapabilitiesFromServer: vi.fn(() => ({ elicitationForm: true })),
    };
});

const DELETE_ARGS = { action: "deleteFunction", functionName: "hello" };

async function setupChannel(
    reply: { action: string; content?: Record<string, unknown> },
    options: { formCapable?: boolean; answerDelayMs?: number } = {},
) {
    const server = new McpServer({ name: "guard-channel-server", version: "0.0.1" });
    // 真实 server 由 server.ts 带上 cloudBaseOptions；这里给个确定的 envId，避免走缓存/磁盘
    (server as unknown as { cloudBaseOptions?: unknown }).cloudBaseOptions = { envId: "env-abc" };
    wrapServerWithTelemetry(server);

    const handler = vi.fn(async () => ({
        content: [{ type: "text" as const, text: "handler 执行了（不该发生）" }],
    }));
    server.registerTool(
        "manageFunctions",
        {
            title: "manageFunctions",
            description: "channel regression probe",
            // ⚠️ 必须声明 action：SDK 会裁掉 inputSchema 里没声明的参数，否则 args.action 变 undefined
            inputSchema: { action: z.string(), functionName: z.string().optional() },
        },
        handler,
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // 用真实 Client，并**声明 form 能力**（这正是被验证的能力门）
    const client = new Client(
        { name: "guard-channel-client", version: "0.0.1" },
        options.formCapable === false
            ? { capabilities: { roots: {} } }
            : { capabilities: { elicitation: { form: {} } } },
    );

    const elicitations: Array<Record<string, unknown>> = [];
    // SDK Client 会校验：只有声明了 elicitation 能力才允许注册该请求处理器
    if (options.formCapable !== false) {
        client.setRequestHandler(ElicitRequestSchema, async (req) => {
            elicitations.push(req.params as unknown as Record<string, unknown>);
            // 护栏判据是**耗时**：<500ms 视为"客户端自动审批"（按放行处理）。
            // 要模拟"人点的拒绝"，必须让应答慢于阈值。
            if (options.answerDelayMs) {
                await new Promise((resolve) => setTimeout(resolve, options.answerDelayMs));
            }
            return reply;
        });
    }

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return { server, client, handler, elicitations };
}

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
    await Promise.all(cleanup.map((fn) => fn()));
    cleanup = [];
});

describe("破坏性确认：真实 elicitation 通道（不 mock SDK）", () => {
    it("客户端声明 form 能力时，服务端真的把 elicitation/create 发出去；人拒绝（>500ms）后不执行", async () => {
        // answerDelayMs：模拟"人读文案再点拒绝"，避开"即时应答=客户端自动审批"这条放行规则
        const { server, client, handler, elicitations } = await setupChannel(
            { action: "decline" },
            { answerDelayMs: 600 },
        );
        cleanup = [() => client.close(), () => server.close()];

        const result = await client.callTool({ name: "manageFunctions", arguments: DELETE_ARGS });

        // ① 关键断言：客户端**确实收到了** elicitation/create（今天断掉的正是这条）
        expect(elicitations).toHaveLength(1);
        expect(elicitations[0].mode).toBe("form");
        expect(elicitations[0].message).toContain("hello");
        const schema = elicitations[0].requestedSchema as {
            properties: { confirm: { enum: string[]; default: string } };
        };
        expect(schema.properties.confirm.enum).toHaveLength(2);
        expect(schema.properties.confirm.default).toBe("取消");

        // ② 人拒绝 ⇒ 不执行、不标错
        expect(handler).not.toHaveBeenCalled();
        expect(result.isError).not.toBe(true);
        expect((result.structuredContent as Record<string, unknown>)?.executed).toBe(false);
    });

    it("客户端确认后真的执行 handler", async () => {
        const { server, client, handler, elicitations } = await setupChannel({
            action: "accept",
            content: { confirm: "确认删除" },
        });
        cleanup = [() => client.close(), () => server.close()];

        const result = await client.callTool({ name: "manageFunctions", arguments: DELETE_ARGS });

        expect(elicitations).toHaveLength(1);
        expect(handler).toHaveBeenCalledTimes(1);
        expect((result.content as Array<{ text: string }>)[0].text).toContain("handler 执行了");
    });

    it("客户端未声明 form 能力 ⇒ 不弹、照常执行", async () => {
        const { server, client, handler, elicitations } = await setupChannel({ action: "decline" }, { formCapable: false });
        cleanup = [() => client.close(), () => server.close()];

        const result = await client.callTool({ name: "manageFunctions", arguments: DELETE_ARGS });

        expect(elicitations).toHaveLength(0);
        expect(handler).toHaveBeenCalledTimes(1);
        expect((result.content as Array<{ text: string }>)[0].text).toContain("handler 执行了");
    });
});
