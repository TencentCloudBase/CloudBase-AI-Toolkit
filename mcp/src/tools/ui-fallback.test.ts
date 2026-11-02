import { describe, expect, it, vi } from "vitest";
import { registerEnvTools } from "./env.js";
import { buildJsonToolResult } from "../utils/tool-result.js";
import type { ExtendedMcpServer } from "../server.js";

/**
 * 面板开关打开时，**工具的文本回退必须原样保留**。
 *
 * 背景：`_meta.ui` 是挂在**工具定义**上的，不是挂在结果上的。不渲染面板的客户端读到的
 * 仍然是 `content[0].text`。这条约束以前只写在注释里，改返回值的人不会因此变红——
 * 这个文件把两条结构性事实钉住：
 *
 *   1. `buildJsonToolResult` 永远产出 `content[0].type === "text"`，`_meta` 只做加法；
 *   2. `registerEnvTools` 在开关 on / off 两种状态下注册出来的定义，**除 `_meta` 外完全一致**
 *      （标题、描述、入参 schema 都一样），也就是开关不可能改变工具行为。
 *
 * 没覆盖的：`queryEnv` / 三个部署工具的结果需要真实云调用，这里不测；它们同样走
 * `buildJsonToolResult`，第 1 条已经把那部分的形状钉住了。
 */
function captureEnvTools(uiValue: string | undefined) {
    const previous = process.env.CLOUDBASE_MCP_UI;
    if (uiValue === undefined) {
        delete process.env.CLOUDBASE_MCP_UI;
    } else {
        process.env.CLOUDBASE_MCP_UI = uiValue;
    }

    const tools: Record<string, { meta: Record<string, unknown>; handler: unknown }> = {};
    const server = {
        cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
        ide: "TestIDE",
        server: {
            sendLoggingMessage: vi.fn(),
            notification: vi.fn().mockResolvedValue(undefined),
        },
        registerTool: vi.fn(
            (name: string, meta: Record<string, unknown>, handler: unknown) => {
                tools[name] = { meta, handler };
            },
        ),
    } as unknown as ExtendedMcpServer;

    try {
        registerEnvTools(server);
    } finally {
        if (previous === undefined) {
            delete process.env.CLOUDBASE_MCP_UI;
        } else {
            process.env.CLOUDBASE_MCP_UI = previous;
        }
    }
    return tools;
}

function withoutUiMeta(meta: Record<string, unknown>) {
    const { _meta: _ignored, ...rest } = meta as Record<string, unknown>;
    return rest;
}

describe("面板开关不改变工具的文本回退", () => {
    it("buildJsonToolResult 永远带 text，_meta 只做加法", () => {
        const payload = { ok: true, code: "STATUS" };

        const plain = buildJsonToolResult(payload);
        expect(plain.content).toHaveLength(1);
        expect(plain.content[0].type).toBe("text");
        expect(JSON.parse(plain.content[0].text)).toEqual(payload);

        // 带 _meta 时 content 的形状一分不变：这是「纯加法」的意思
        const withMeta = buildJsonToolResult(payload, { "cloudbase/ui": { env_candidates: [] } });
        expect(withMeta.content).toEqual(plain.content);
        expect(withMeta._meta).toBeDefined();
    });

    it("auth / queryEnv 的定义在开关两种状态下除 _meta 外完全一致", () => {
        const off = captureEnvTools("off");
        const on = captureEnvTools("on");

        // 默认（未设置）也应该是「开」，与显式 on 等价
        const unset = captureEnvTools(undefined);

        expect(Object.keys(on).sort()).toEqual(Object.keys(off).sort());

        for (const name of ["auth", "queryEnv"]) {
            expect(off[name], `${name} 未注册`).toBeDefined();
            expect(on[name], `${name} 未注册`).toBeDefined();

            // 关着：不带 _meta；开着：带 _meta.ui.resourceUri
            expect(off[name].meta._meta).toBeUndefined();
            expect(on[name].meta._meta).toBeDefined();
            expect(unset[name].meta._meta).toBeDefined();

            // 除 _meta 外，定义逐字段相同 —— 开关不可能改掉标题/描述/schema。
            // 不直接 toEqual 整个 meta：里面的 zod schema 是类实例，跨两次注册不会深度相等，
            // 比出来「看着一样却不等」，那是断言方式的问题不是代码的问题。比可观测的部分：
            const onRest = withoutUiMeta(on[name].meta) as Record<string, any>;
            const offRest = withoutUiMeta(off[name].meta) as Record<string, any>;

            expect(Object.keys(onRest).sort()).toEqual(Object.keys(offRest).sort());
            expect(onRest.title).toEqual(offRest.title);
            expect(onRest.description).toEqual(offRest.description);
            expect(onRest.annotations).toEqual(offRest.annotations);
            // 入参字段名一致（zod schema 的 shape 键）
            expect(Object.keys(onRest.inputSchema?.shape ?? {}).sort()).toEqual(
                Object.keys(offRest.inputSchema?.shape ?? {}).sort(),
            );

            // handler 存在（形状一致，具体函数是每次注册新建的闭包，不做引用比较）
            expect(typeof on[name].handler).toBe("function");
        }
    });
});
