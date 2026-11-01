import { describe, expect, it } from "vitest";
import { ALL_SUPPORTED_RUNTIMES } from "./functions.js";
import { functions as functionsDict } from "../i18n/locales/modules/functions.js";

/**
 * 运行时列表有两份：`SUPPORTED_RUNTIMES`（前置校验）和 i18n 里的
 * `schema.create.runtime`（给模型看的描述）。两份各存一份，只改一边就会出现
 * 「描述说不支持、校验却放行」或反过来。这里把它们钉在一起。
 */
describe("runtime catalog", () => {
  for (const locale of ["zh", "en"] as const) {
    it(`${locale} 描述覆盖全部受支持的运行时`, () => {
      const text = functionsDict[locale]["schema.create.runtime"];
      for (const runtime of ALL_SUPPORTED_RUNTIMES) {
        expect(text, `${locale} 文案缺少运行时 ${runtime}`).toContain(runtime);
      }
    });
  }

  it("描述里出现的 Nodejs 版本都在白名单内", () => {
    const supported = new Set<string>(ALL_SUPPORTED_RUNTIMES);
    for (const locale of ["zh", "en"] as const) {
      const text = functionsDict[locale]["schema.create.runtime"];
      const listed = text.match(/Nodejs[\d.]+/g) ?? [];
      expect(listed.length).toBeGreaterThan(0);
      for (const value of listed) {
        expect(supported.has(value), `${locale} 文案列了不支持的 ${value}`).toBe(true);
      }
    }
  });
});
