import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    DESCRIBE_ENVS_ENV_TYPES,
    DESCRIBE_ENVS_EXCLUDED_CHANNELS,
    buildDescribeEnvsFilter,
} from "./describe-envs-query.js";

/**
 * 白名单漂移守卫。
 *
 * EnvTypes 是白名单语义，少写一个值不报错、只静默少一类环境 —— 2026-10 的客户
 * 案例就是平台代建的环境（EnvType=platform）在 MCP 里完全看不到，现场没有任何
 * 错误可看。同一个白名单在仓内曾有两份拷贝，改的时候只改到一份。
 *
 * 两类必须让测试变红：
 *   1. 白名单丢了 platform；
 *   2. 有调用点绕开 buildDescribeEnvsFilter 自己写字面量数组。
 */

const __filename = fileURLToPath(import.meta.url);
const SRC_ROOT = path.resolve(path.dirname(__filename), "..");

/** `EnvTypes: [` / `Channels: [` 后面直接跟字符串字面量（同行或换行后）才算违规 */
const INLINE_SAME_LINE = /\b(EnvTypes|Channels):\s*\[\s*['"`]/;
const INLINE_OPEN_LINE = /\b(EnvTypes|Channels):\s*\[\s*$/;
const NEXT_LINE_LITERAL = /^\s*['"`]/;

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSourceFiles(full, acc);
            continue;
        }
        if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
            acc.push(full);
        }
    }
    return acc;
}

describe("DescribeEnvs 查询口径", () => {
    it("白名单含 platform —— 缺了就是平台代建环境静默消失", () => {
        expect(DESCRIBE_ENVS_ENV_TYPES).toContain("platform");
        expect(DESCRIBE_ENVS_ENV_TYPES).toContain("baas");
        expect(DESCRIBE_ENVS_ENV_TYPES).toContain("weda");
    });

    it("返回副本：调用方改结果不影响共享常量", () => {
        const filter = buildDescribeEnvsFilter();
        filter.EnvTypes.push("run");
        filter.Channels.push("qc_console");
        expect(DESCRIBE_ENVS_ENV_TYPES).not.toContain("run");
        expect(DESCRIBE_ENVS_EXCLUDED_CHANNELS).not.toContain("qc_console");
    });

    it("IsVisible=false：Channels 是排除列表，不能把控制台渠道排掉", () => {
        const filter = buildDescribeEnvsFilter();
        expect(filter.IsVisible).toBe(false);
        expect(filter.Channels).toEqual([...DESCRIBE_ENVS_EXCLUDED_CHANNELS]);
        expect(filter.Channels).not.toContain("qc_console");
    });

    it("调用点不得内联 EnvTypes / Channels 字面量", () => {
        const offenders: string[] = [];
        for (const file of collectSourceFiles(SRC_ROOT)) {
            const lines = fs.readFileSync(file, "utf-8").split("\n");
            lines.forEach((line, i) => {
                const trimmed = line.trimStart();
                if (trimmed.startsWith("*") || trimmed.startsWith("//")) {
                    return;
                }
                const hit =
                    INLINE_SAME_LINE.test(line) ||
                    (INLINE_OPEN_LINE.test(line) && NEXT_LINE_LITERAL.test(lines[i + 1] ?? ""));
                if (hit) {
                    offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1} ${line.trim()}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});
