/**
 * 工具级文案的端到端回归（实例语言 → 词典 → 注册点）。
 *
 * 为什么单独有这层：`normalizeLang` / `resolveInstanceLang` / `t()` 各自都有单元测试，
 * 但把三者串起来的那条接线（`createCloudBaseMcpServer(options.lang)` → `setInstanceLang`
 * → `registerTool` 包装层按 lang 解析词典 key）此前零测试 —— **接线断了 CI 依然全绿**，
 * 而它恰好是「工具级国际化」这个交付物的全部价值所在。
 *
 * 覆盖的四件事：
 *   1. 解析确实发生了 —— 没有任何工具描述还是原始的词典 key（如 "storage.queryDescription"）
 *   2. 解析结果正确 —— 抽查工具描述逐字等于词典里对应的值（zh / en 各一次）
 *   3. 实例语言真的生效 —— en 实例下工具描述不含中文
 *   4. `setInstanceLang` 生效 —— options.lang 不只影响工具描述，也影响工具输出文案
 */
import { describe, expect, it } from "vitest";
import { createCloudBaseMcpServer } from "../server.js";
import { getInstanceLang, isMessageKey } from "../i18n/index.js";
import { zh } from "../i18n/locales/zh.js";
import { en } from "../i18n/locales/en.js";

const CJK = /[\u4e00-\u9fff]/;

/**
 * en 实例下允许出现中文的工具 —— **唯一原因**是它们在注册时把运行期目录内容内联进了描述：
 * `searchKnowledgeBase` 会把每个 skill 的 SKILL.md 描述与 OpenAPI 文档目录拼进 description，
 * 而 skill 描述本身**故意**带中文关键词别名（与 searchKnowledgeBase 自己的中文别名同源，
 * 用于提高中文检索命中率），OpenAPI 目录描述也是中英混排的产品名。
 *
 * 这是「运行期数据」而不是「工具级文案」：它的工具级模板（`rag.description`）在 en 下
 * 已是纯英文，下面单独有断言逐字核对。除此之外，任何工具在 en 下出现中文都算回归。
 */
const RUNTIME_CATALOG_TOOLS = new Set(["searchKnowledgeBase"]);

const createServer = (lang?: "zh" | "en") =>
  createCloudBaseMcpServer({ enableTelemetry: false, ...(lang ? { lang } : {}) });

describe("工具级文案的语言接线", () => {
  it("工具描述不再是原始词典 key（注册包装层确实解析过了）", async () => {
    const server = await createServer("zh");

    expect(server.toolDefs.length).toBeGreaterThan(20);

    // 接线断了的话，注册点传进来的 key 字符串会原样留在描述里
    const unresolved = server.toolDefs
      .filter((tool) => isMessageKey(tool.description))
      .map((tool) => `${tool.name}: ${tool.description}`);
    expect(unresolved).toEqual([]);

    const empty = server.toolDefs.filter((tool) => !tool.description?.trim()).map((tool) => tool.name);
    expect(empty).toEqual([]);
  });

  it("描述逐字等于词典值（zh 实例取 zh 树）", async () => {
    const server = await createServer("zh");
    const queryStorage = server.toolDefs.find((tool) => tool.name === "queryStorage");

    expect(queryStorage).toBeDefined();
    expect(queryStorage?.description).toBe(zh.storage.queryDescription);
  });

  it("描述逐字等于词典值（en 实例取 en 树）", async () => {
    const server = await createServer("en");
    const queryStorage = server.toolDefs.find((tool) => tool.name === "queryStorage");
    const queryEnv = server.toolDefs.find((tool) => tool.name === "queryEnv");

    expect(queryStorage?.description).toBe(en.storage.queryDescription);
    expect(queryEnv?.description).toBe(en.env.queryDescription);
    // 同一份源码、同一把 key，两种实例语言必须给出不同文案
    expect(en.storage.queryDescription).not.toBe(zh.storage.queryDescription);
  });

  it("en 实例下工具描述不含中文（内联目录内容的工具除外）", async () => {
    const server = await createServer("en");

    const offenders = server.toolDefs
      .filter((tool) => !RUNTIME_CATALOG_TOOLS.has(tool.name) && CJK.test(tool.description))
      .map((tool) => `${tool.name}: ${tool.description.replace(/\s+/g, " ").slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });

  it("内联目录内容的工具，其工具级模板本身仍是英文", async () => {
    // 模板走词典（因此已本地化），中文只可能来自被内联的 skill / OpenAPI 目录
    expect(CJK.test(en.rag.description)).toBe(false);
    expect(en.rag.description).not.toBe(zh.rag.description);

    const server = await createServer("en");
    const tool = server.toolDefs.find((entry) => entry.name === "searchKnowledgeBase");

    expect(tool?.description).toContain("CloudBase knowledge base search tool");
    expect(tool?.description).not.toContain("云开发知识库检索工具");
  });

  it("实例语言同时落到 t()（工具输出文案），不只是工具描述", async () => {
    // server.ts 里 setInstanceLang 那句注释点名的坑：不调用它，options.lang 就只影响
    // 工具 description、不影响工具输出文案
    await createServer("en");
    expect(getInstanceLang()).toBe("en");
  });
});
