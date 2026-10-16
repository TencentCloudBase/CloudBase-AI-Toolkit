import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { t, type MessageKey } from "../i18n/index.js";
import {
    DESTRUCTIVE_ACTIONS,
    DESTRUCTIVE_EXEMPT_ACTIONS,
    DESTRUCTIVE_NAME_PATTERN,
} from "./destructive-actions.js";

/**
 * 名单漂移守卫。
 *
 * 两类事故必须让测试变红：
 *   1. 名单里写了**已经不存在**的 `工具名.action`（改名/下掉后确认静默失效）；
 *   2. 新增了名字像破坏性的 action，却既没登记、也没写进带理由的豁免表
 *      （"看起来有人管、其实没人管"是这类护栏最常见的失败方式）。
 *
 * `scripts/tools.json` 是已注册工具的权威清单（同 cloud-incompatible-tools.test.ts 的口径）。
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOLS_JSON_PATH = path.resolve(__dirname, "../../../scripts/tools.json");

type ToolsJson = {
    tools?: Array<{
        name?: string;
        inputSchema?: { properties?: { action?: { enum?: string[] } } };
    }>;
};

function loadTools(): Map<string, Set<string>> {
    const parsed = JSON.parse(fs.readFileSync(TOOLS_JSON_PATH, "utf-8")) as ToolsJson;
    const map = new Map<string, Set<string>>();
    for (const tool of parsed.tools ?? []) {
        if (typeof tool.name !== "string" || tool.name.length === 0) {
            continue;
        }
        const actions = tool.inputSchema?.properties?.action?.enum ?? [];
        map.set(tool.name, new Set(actions));
    }
    return map;
}

/** 所有名字像破坏性的 action，形如 `工具名.action` */
function collectDestructiveCandidates(tools: Map<string, Set<string>>): string[] {
    const candidates: string[] = [];
    for (const [toolName, actions] of tools) {
        for (const action of actions) {
            if (DESTRUCTIVE_NAME_PATTERN.test(action)) {
                candidates.push(`${toolName}.${action}`);
            }
        }
    }
    return candidates.sort();
}

describe("破坏性动作名单与工具面保持同步", () => {
    const tools = loadTools();
    const candidates = collectDestructiveCandidates(tools);

    it("有一份可校验的工具清单", () => {
        expect(tools.size).toBeGreaterThan(0);
        expect(candidates.length).toBeGreaterThan(0);
    });

    it("名单里的每个 key 都对应真实存在的 action", () => {
        const orphans = Object.keys(DESTRUCTIVE_ACTIONS).filter((key) => {
            const dot = key.indexOf(".");
            if (dot <= 0) {
                return true;
            }
            const toolName = key.slice(0, dot);
            const action = key.slice(dot + 1);
            return !tools.get(toolName)?.has(action);
        });
        expect(
            orphans,
            `这些 key 在 scripts/tools.json 里找不到对应的 工具.action（改名或下掉后确认会静默失效）：${orphans.join(", ")}`,
        ).toEqual([]);
    });

    it("名单里的每个 messageKey 都能在词典里取到，并且要求带上资源名占位", () => {
        for (const [key, spec] of Object.entries(DESTRUCTIVE_ACTIONS)) {
            const text = t(spec.messageKey);
            expect(text, `${key} 的文案取不到（key=${spec.messageKey}）`).not.toBe(spec.messageKey);
            expect(text, `${key} 的文案必须带 {resource} 占位`).toContain("{resource}");
        }
        const overrides = new Set<MessageKey>();
        for (const spec of Object.values(DESTRUCTIVE_ACTIONS)) {
            for (const args of [{}, { isMulti: true }, { dbInstance: { schema: "app" } }]) {
                const override = spec.target(args).messageKey;
                if (override) {
                    overrides.add(override);
                }
            }
        }
        for (const key of overrides) {
            const text = t(key);
            expect(text, `${key} 的文案取不到`).not.toBe(key);
            expect(
                text.includes("{resource}") || text.includes("{envId}"),
                `${key} 的文案必须点名资源或环境`,
            ).toBe(true);
        }
    });

    it("名字像破坏性的 action，要么登记、要么带理由豁免，不允许漏掉", () => {
        const uncovered = candidates.filter(
            (key) => !(key in DESTRUCTIVE_ACTIONS) && !(key in DESTRUCTIVE_EXEMPT_ACTIONS),
        );
        expect(
            uncovered,
            `以下 action 名字像破坏性，但既不在 DESTRUCTIVE_ACTIONS、也不在 DESTRUCTIVE_EXEMPT_ACTIONS：` +
                `${uncovered.join(", ")}。要么登记（走确认），要么加进豁免表并写清理由。`,
        ).toEqual([]);
    });

    it("豁免表不允许有僵尸条目，且理由不能为空", () => {
        const stale = Object.keys(DESTRUCTIVE_EXEMPT_ACTIONS).filter(
            (key) => !candidates.includes(key),
        );
        expect(
            stale,
            `这些豁免条目已不再是"名字像破坏性"的 action（工具改名或被移除），请删掉：${stale.join(", ")}`,
        ).toEqual([]);

        const emptyReason = Object.entries(DESTRUCTIVE_EXEMPT_ACTIONS)
            .filter(([, reason]) => typeof reason !== "string" || reason.trim().length < 8)
            .map(([key]) => key);
        expect(emptyReason, `这些豁免条目没写清理由：${emptyReason.join(", ")}`).toEqual([]);
    });

    it("名字不像破坏性的 action 若要进名单，必须带 `when` 谓词（避免名单随手扩张）", () => {
        // 规则细化：名单原本只收"名字就像破坏性"的 action。谓词触发面（SQL 这类同名 action 下
        // 既可能读也可能删的场景）进来后，名字不再必须像破坏性 —— 但**必须**用 `when` 把范围
        // 收窄，否则就是"随手扩名单"。无谓词的不像破坏性的条目一律红。
        const suspicious = Object.keys(DESTRUCTIVE_ACTIONS).filter((key) => {
            const action = key.slice(key.indexOf(".") + 1);
            if (DESTRUCTIVE_NAME_PATTERN.test(action)) {
                return false;
            }
            return !DESTRUCTIVE_ACTIONS[key].when;
        });
        expect(
            suspicious,
            `这些 action 名字不像破坏性动作、又没有参数谓词收窄范围，确认前请重新评估：${suspicious.join(", ")}`,
        ).toEqual([]);
    });

    it("谓词型条目的 when 必须是纯判定：空参数返回 false，而不是命中", () => {
        for (const [key, spec] of Object.entries(DESTRUCTIVE_ACTIONS)) {
            if (!spec.when) {
                continue;
            }
            expect(spec.when({}), `${key} 的 when({}) 不该命中（没有 SQL 就没有破坏性）`).toBe(false);
        }
    });

    it("target() 取不到字段时返回占位而不是抛错", () => {
        for (const [key, spec] of Object.entries(DESTRUCTIVE_ACTIONS)) {
            expect(() => spec.target({}), `${key} 的 target() 在空参数下抛错了`).not.toThrow();
        }
        expect(DESTRUCTIVE_ACTIONS["manageFunctions.deleteFunction"].target({ functionName: "hello" })).toEqual({
            resource: "hello",
        });
        const deleteDocuments = DESTRUCTIVE_ACTIONS["writeNoSqlDatabaseContent.delete"];
        expect(
            deleteDocuments.target({
                collectionName: "todos",
                documents: [{ a: 1 }, { a: 2 }],
            }),
        ).toEqual({
            resource: "todos",
            messageKey: "confirmation.message.deleteDocumentsOne",
        });
        expect(deleteDocuments.target({ collectionName: "todos", isMulti: true }).messageKey).toBe(
            "confirmation.message.deleteDocumentsQuery",
        );
        expect(DESTRUCTIVE_ACTIONS["manageMysqlDatabase.destroyMySQL"].target({})).toMatchObject({
            messageKey: "confirmation.message.destroyMysqlEnv",
            resource: t("confirmation.message.mysqlThisEnv"),
        });
        expect(
            DESTRUCTIVE_ACTIONS["manageMysqlDatabase.destroyMySQL"].target({
                dbInstance: { instanceId: "mysql-1", schema: "app" },
            }),
        ).toEqual({ resource: "mysql-1" });
    });
});
