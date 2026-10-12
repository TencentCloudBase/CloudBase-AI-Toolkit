import { describe, expect, it } from "vitest";
import {
  SERVER_INSTRUCTIONS,
  SERVER_INSTRUCTIONS_MAX_CHARS,
  resolveServerInstructions,
} from "./server-instructions.js";

describe("server instructions", () => {
  it("两种语言都非空且不超过上限", () => {
    for (const lang of ["zh", "en"] as const) {
      const text = SERVER_INSTRUCTIONS[lang];
      expect(text.length).toBeGreaterThan(0);
      // 上限存在的意义：tools/list 已经吃掉 3 万 tokens，instructions 不能再堆
      expect(text.length, `${lang} 长度 ${text.length}`).toBeLessThanOrEqual(
        SERVER_INSTRUCTIONS_MAX_CHARS,
      );
    }
  });

  it("zh/en 是两份内容，且都提到首用的两步 auth", () => {
    expect(SERVER_INSTRUCTIONS.zh).not.toBe(SERVER_INSTRUCTIONS.en);
    for (const lang of ["zh", "en"] as const) {
      const text = SERVER_INSTRUCTIONS[lang];
      expect(text).toContain('auth(action="status")');
      expect(text).toContain('auth(action="set_env"');
    }
  });

  it("按实例语言取文案，未知语言回退 zh", () => {
    expect(resolveServerInstructions("en")).toBe(SERVER_INSTRUCTIONS.en);
    expect(resolveServerInstructions("zh")).toBe(SERVER_INSTRUCTIONS.zh);
    // 运行时类型外的情况（如调用方直接透传字符串）：回退 zh，不要返回 undefined
    expect(resolveServerInstructions("fr" as never)).toBe(SERVER_INSTRUCTIONS.zh);
  });

  it("首句就给一个零参数只读动作（读这段文本的模型最省力的出口）", () => {
    for (const lang of ["zh", "en"] as const) {
      const paragraphs = SERVER_INSTRUCTIONS[lang].split("\n\n");
      // 第 1 段是自我介绍，第 2 段必须就是「现在就调一次 auth(status)」
      expect(paragraphs[1]).toContain('auth(action="status")');
      expect(paragraphs[1]).toMatch(/只读|read-only/);
    }
  });

  it("要求「别猜、先查」：点名 Skill 与知识库检索入口", () => {
    for (const lang of ["zh", "en"] as const) {
      const text = SERVER_INSTRUCTIONS[lang];
      expect(text).toContain("CloudBase Skill");
      expect(text).toContain("searchKnowledgeBase");
      expect(text).toMatch(/不要凭记忆猜|Do not guess/);
    }
  });

  it("提到没有环境时的免费体验环境（国内站）", () => {
    expect(SERVER_INSTRUCTIONS.zh).toContain("国内站");
    expect(SERVER_INSTRUCTIONS.zh).toContain("免费开通");
    expect(SERVER_INSTRUCTIONS.en).toMatch(/China site/);
  });

  it("不列工具清单：只允许出现 auth 与检索入口两个工具名", () => {
    // 引导文案只讲顺序与照抄问法；一旦开始枚举工具名就会随工具面漂移，
    // 而且它占的是每个会话都要付的上下文（见 design.md 的 token 账）。
    const allowed = new Set(["auth", "searchKnowledgeBase"]);
    const otherTools = [
      "queryEnv",
      "manageFunctions",
      "queryFunctions",
      "manageHosting",
      "manageCloudRun",
      "manageGateway",
      "readNoSqlDatabaseContent",
      "readNoSqlDatabaseStructure",
      "queryPgDatabase",
      "callCloudApi",
    ];
    for (const lang of ["zh", "en"] as const) {
      for (const tool of otherTools) {
        expect(allowed.has(tool) || !SERVER_INSTRUCTIONS[lang].includes(tool), `${lang} 点名了 ${tool}`).toBe(
          true,
        );
      }
    }
  });
});
