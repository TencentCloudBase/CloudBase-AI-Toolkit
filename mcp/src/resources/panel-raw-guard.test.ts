import { describe, expect, it } from "vitest";
import vm from "node:vm";
import {
  CREDENTIAL_GUARD_JS,
  CREDENTIAL_SCAN_MAX_DEPTH,
  carriesCredentialBlock,
} from "./panel-raw-guard.js";
import { buildGetStartedHtml } from "./get-started.js";
import { buildArtifactCardHtml } from "./artifact-card.js";
import { buildEnvCreditsHtml } from "./env-credits.js";

/**
 * 「原始返回」折叠区的凭据护栏。
 *
 * 三块面板都会把整份 `tool-result` 写进折叠区，而 `auth(get_temp_credentials, reveal:true)`
 * 的结果里是明文凭据。护栏的语义只有一条：**值里任何一层出现 `credentials` 块，就别展示**。
 *
 * 这里锁三件事：
 *   1. TS 那份判定的边界（能穿过 params / content / JSON 字符串，能挡环，不误伤普通结果）；
 *   2. 内联进面板的 JS 那份与 TS 这份**逐项一致**（两边是两份代码，会漂）；
 *   3. 三块面板的产物里**确实带上了**这个函数（改了模板却漏了插值，第 2 条查不出来）。
 */

/** 用 vm 跑内联版：模拟面板脚本里的顶层作用域，取回函数。 */
function loadInlineGuard() {
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(`${CREDENTIAL_GUARD_JS}\nthis.__guard = carriesCredentialBlock;`, sandbox);
  return (sandbox as { __guard: (value: unknown, depth?: number) => boolean }).__guard;
}

const WITH_CREDENTIALS = {
  ok: true,
  code: "TEMP_CREDENTIALS_READY",
  credentials: { id: "placeholder-a", secret: "placeholder-b" },
};

const NORMAL_STATUS = {
  ok: true,
  auth_status: "READY",
  current_env_id: "env-abc123",
  env_candidates: [{ envId: "env-1", alias: "one" }],
};

describe("凭据护栏：TS 判定", () => {
  it("顶层带 credentials 块 → 命中", () => {
    expect(carriesCredentialBlock(WITH_CREDENTIALS)).toBe(true);
  });

  it("藏在工具结果包裹里 → 命中", () => {
    // 宿主常见三层：params → content[0].text → JSON 字符串
    expect(
      carriesCredentialBlock({
        content: [{ type: "text", text: JSON.stringify(WITH_CREDENTIALS) }],
      }),
    ).toBe(true);
  });

  it("藏在数组里 → 命中", () => {
    expect(carriesCredentialBlock([NORMAL_STATUS, WITH_CREDENTIALS])).toBe(true);
  });

  it("JSON 字符串直接传进来 → 命中", () => {
    expect(carriesCredentialBlock(JSON.stringify(WITH_CREDENTIALS))).toBe(true);
  });

  it("普通结果不误伤", () => {
    expect(carriesCredentialBlock(NORMAL_STATUS)).toBe(false);
    expect(carriesCredentialBlock({ content: [{ type: "text", text: JSON.stringify(NORMAL_STATUS) }] })).toBe(false);
    expect(carriesCredentialBlock("plain text")).toBe(false);
    expect(carriesCredentialBlock("")).toBe(false);
    expect(carriesCredentialBlock(null)).toBe(false);
    expect(carriesCredentialBlock(42)).toBe(false);
  });

  it("深度上限：超过上限不再下探（挡环，也不无限递归）", () => {
    // 逐层包一个 key，把 credentials 埋到上限之外
    let deep: Record<string, unknown> = WITH_CREDENTIALS;
    for (let i = 0; i < CREDENTIAL_SCAN_MAX_DEPTH + 2; i += 1) {
      deep = { wrap: deep };
    }
    expect(carriesCredentialBlock(deep)).toBe(false);

    // 环：对象引用自己，不该炸也不该挂
    const cyclic: Record<string, unknown> = { ok: true };
    cyclic.self = cyclic;
    expect(carriesCredentialBlock(cyclic)).toBe(false);
  });
});

describe("凭据护栏：内联 JS 与 TS 两份实现必须一致", () => {
  const inline = loadInlineGuard();

  const cases: Array<[string, unknown]> = [
    ["顶层凭据块", WITH_CREDENTIALS],
    ["content 包裹", { content: [{ type: "text", text: JSON.stringify(WITH_CREDENTIALS) }] }],
    ["数组里", [NORMAL_STATUS, WITH_CREDENTIALS]],
    ["JSON 字符串", JSON.stringify(WITH_CREDENTIALS)],
    ["普通状态", NORMAL_STATUS],
    ["普通文本", "plain text"],
    ["空串", ""],
    ["null", null],
    ["数字", 42],
    ["非 JSON 的花括号串", "{not json"],
  ];

  for (const [name, value] of cases) {
    it(name, () => {
      expect(inline(value)).toBe(carriesCredentialBlock(value));
    });
  }
});

describe("凭据护栏：三块面板的产物里都带上了这个函数", () => {
  const sampleFallback = { envId: "env-abc123", site: "domestic", region: "ap-shanghai" };
  const sampleStatus = { envId: "env-abc123", site: "domestic", region: "ap-shanghai" };

  const panels: Array<[string, string]> = [
    ["get-started", buildGetStartedHtml("en", sampleStatus as never)],
    ["artifact-card", buildArtifactCardHtml("en", sampleFallback as never)],
    ["env-credits", buildEnvCreditsHtml("en", sampleFallback as never)],
  ];

  for (const [name, html] of panels) {
    it(`${name} 注入了护栏，且调用处接上了`, () => {
      expect(html).toContain("function carriesCredentialBlock");
      // 只要注入了却没人调用，就是白写
      expect(html).toContain("carriesCredentialBlock(");
      const calls = html.match(/carriesCredentialBlock\(/g) ?? [];
      // 一处定义（function 那行的括号算一次）+ 至少一处内部调用/递归
      expect(calls.length).toBeGreaterThan(1);
    });
  }
});
