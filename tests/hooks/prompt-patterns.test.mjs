// tests/hooks/prompt-patterns.test.mjs — Unit tests for prompt-patterns.mjs
// Covers: normalizePromptText, compilePromptSignals, matchPromptWithReason,
// applyProjectContextBoost, applyDominantTopicSuppression, globToRegex
import { describe, it, expect } from "vitest";
import {
  normalizePromptText,
  compilePromptSignals,
  matchPromptWithReason,
  applyProjectContextBoost,
  applyDominantTopicSuppression,
  globToRegex,
  PROJECT_CONTEXT_PROMPT_SCORE_BOOST,
  DOMINANT_TOPIC_SCORE_THRESHOLD,
  DOMINANT_TOPIC_MIN_SCORE,
} from "../../plugin/cloudbase/hooks/prompt-patterns.mjs";

describe("normalizePromptText", () => {
  it("lowercases text", () => {
    expect(normalizePromptText("Hello World")).toBe("hello world");
  });

  it("expands English contractions", () => {
    expect(normalizePromptText("it's don't")).toBe("it is do not");
    expect(normalizePromptText("can't won't")).toBe("cannot will not");
  });

  it("normalizes whitespace", () => {
    expect(normalizePromptText("hello   world\n\tfoo")).toBe("hello world foo");
  });

  it("preserves Chinese characters", () => {
    expect(normalizePromptText("做一个 Todo App")).toBe("做一个 todo app");
  });

  it("handles non-string input", () => {
    expect(normalizePromptText(null)).toBe("");
    expect(normalizePromptText(undefined)).toBe("");
  });
});

describe("compilePromptSignals", () => {
  it("compiles full promptSignals", () => {
    const compiled = compilePromptSignals({
      phrases: ["Web", "React"],
      allOf: [["ui", "design"]],
      anyOf: ["deploy"],
      noneOf: ["miniprogram"],
      minScore: 8,
    });
    expect(compiled.phrases).toEqual(["web", "react"]);
    expect(compiled.allOf).toEqual([["ui", "design"]]);
    expect(compiled.anyOf).toEqual(["deploy"]);
    expect(compiled.noneOf).toEqual(["miniprogram"]);
    expect(compiled.minScore).toBe(8);
  });

  it("handles missing promptSignals", () => {
    const compiled = compilePromptSignals(null);
    expect(compiled).toBeNull();
  });

  it("handles partial promptSignals", () => {
    const compiled = compilePromptSignals({ phrases: ["web"] });
    expect(compiled.phrases).toEqual(["web"]);
    expect(compiled.allOf).toEqual([]);
    expect(compiled.minScore).toBe(6);
  });

  it("lowercases all phrases", () => {
    const compiled = compilePromptSignals({
      phrases: ["React", "VUE", "前端"],
      allOf: [["UI", "Design"]],
    });
    expect(compiled.phrases).toEqual(["react", "vue", "前端"]);
    expect(compiled.allOf).toEqual([["ui", "design"]]);
  });
});

describe("matchPromptWithReason", () => {
  const compiled = compilePromptSignals({
    phrases: ["web", "react", "前端"],
    anyOf: ["deploy", "部署"],
    noneOf: ["小程序", "miniprogram"],
    minScore: 6,
  });

  it("matches single phrase (+6)", () => {
    const result = matchPromptWithReason("i want to build a web app", compiled);
    expect(result.matched).toBe(true);
    expect(result.score).toBe(6);
    expect(result.reason).toContain("phrase");
  });

  it("matches multiple phrases (+12)", () => {
    const result = matchPromptWithReason("web app with react frontend", compiled);
    expect(result.matched).toBe(true);
    expect(result.score).toBe(12);
  });

  it("matches Chinese phrases", () => {
    const result = matchPromptWithReason("帮我做前端项目", compiled);
    expect(result.matched).toBe(true);
    expect(result.score).toBe(6);
  });

  it("respects noneOf (suppresses to -Infinity)", () => {
    const result = matchPromptWithReason("build a web miniprogram app", compiled);
    expect(result.matched).toBe(false);
    expect(result.score).toBe(-Infinity);
    expect(result.reason).toContain("noneOf");
  });

  it("respects minScore threshold", () => {
    const result = matchPromptWithReason("help me deploy something", compiled);
    expect(result.matched).toBe(false);
    expect(result.score).toBe(1);
  });

  it("combines phrases + anyOf", () => {
    const result = matchPromptWithReason("web deploy", compiled);
    expect(result.matched).toBe(true);
    expect(result.score).toBe(7);
  });

  it("anyOf caps at +2", () => {
    const compiled2 = compilePromptSignals({
      phrases: ["web"],
      anyOf: ["deploy", "ship", "release", "publish"],
      minScore: 6,
    });
    const result = matchPromptWithReason("web deploy ship release publish", compiled2);
    expect(result.score).toBe(8);
  });

  it("handles null compiled", () => {
    const result = matchPromptWithReason("some prompt", null);
    expect(result.matched).toBe(false);
    expect(result.reason).toBe("no promptSignals");
  });
});

describe("applyProjectContextBoost", () => {
  it("boosts score for likely skills (+3)", () => {
    const entry = { skill: "web-development", score: 4, matched: false, minScore: 6 };
    const likelySkills = new Set(["web-development"]);
    const result = applyProjectContextBoost(entry, likelySkills);
    expect(result.score).toBe(7);
    expect(result.matched).toBe(true);
  });

  it("does not boost if skill not in likelySkills", () => {
    const entry = { skill: "other-skill", score: 4, matched: false, minScore: 6 };
    const likelySkills = new Set(["web-development"]);
    const result = applyProjectContextBoost(entry, likelySkills);
    expect(result.score).toBe(4);
    expect(result.matched).toBe(false);
  });

  it("does not boost if score is -Infinity", () => {
    const entry = { skill: "web-development", score: -Infinity, matched: false, minScore: 6 };
    const likelySkills = new Set(["web-development"]);
    const result = applyProjectContextBoost(entry, likelySkills);
    expect(result.score).toBe(-Infinity);
  });
});

describe("applyDominantTopicSuppression", () => {
  it("suppresses when topScore >= threshold and entry < minScore", () => {
    const entry = { skill: "minor-skill", score: 5, matched: true, minScore: 6 };
    const result = applyDominantTopicSuppression(entry, 20);
    expect(result.matched).toBe(false);
    expect(result.suppressed).toBe(true);
  });

  it("does not suppress when entry score >= minScore", () => {
    const entry = { skill: "skill", score: 10, matched: true, minScore: 6 };
    const result = applyDominantTopicSuppression(entry, 20);
    expect(result.matched).toBe(true);
    expect(result.suppressed).toBeUndefined();
  });

  it("does not suppress when topScore < threshold", () => {
    const entry = { skill: "skill", score: 5, matched: true, minScore: 6 };
    const result = applyDominantTopicSuppression(entry, 10);
    expect(result.matched).toBe(true);
  });

  it("does not suppress if already not matched", () => {
    const entry = { skill: "skill", score: 5, matched: false, minScore: 6 };
    const result = applyDominantTopicSuppression(entry, 20);
    expect(result.matched).toBe(false);
    expect(result.suppressed).toBeUndefined();
  });

  it("threshold is reasonable (not 600)", () => {
    expect(DOMINANT_TOPIC_SCORE_THRESHOLD).toBeLessThan(100);
    expect(DOMINANT_TOPIC_MIN_SCORE).toBeLessThan(DOMINANT_TOPIC_SCORE_THRESHOLD);
  });
});

describe("globToRegex", () => {
  it("matches simple files", () => {
    const re = globToRegex("package.json");
    expect(re.test("package.json")).toBe(true);
    expect(re.test("other.json")).toBe(false);
  });

  it("matches * wildcard", () => {
    const re = globToRegex("*.json");
    expect(re.test("package.json")).toBe(true);
    expect(re.test("config.yaml")).toBe(false);
  });

  it("matches ** double wildcard (crosses directories)", () => {
    const re = globToRegex("src/**");
    expect(re.test("src/App.tsx")).toBe(true);
    expect(re.test("src/components/Button.tsx")).toBe(true);
    expect(re.test("public/index.html")).toBe(false);
  });

  it("matches ? single char", () => {
    const re = globToRegex("file?.txt");
    expect(re.test("file1.txt")).toBe(true);
    expect(re.test("file12.txt")).toBe(false);
  });

  it("escapes regex special chars", () => {
    const re = globToRegex("vite.config.*");
    expect(re.test("vite.config.ts")).toBe(true);
    expect(re.test("vite.config.js")).toBe(true);
    expect(re.test("viteXconfig.ts")).toBe(false);
  });

  it("supports character classes [abc]", () => {
    const re = globToRegex("file.[jt]s");
    expect(re.test("file.js")).toBe(true);
    expect(re.test("file.ts")).toBe(true);
    expect(re.test("file.xs")).toBe(false);
  });

  it("supports negated character classes [!abc]", () => {
    const re = globToRegex("file.[!j]s");
    expect(re.test("file.js")).toBe(false);
    expect(re.test("file.ts")).toBe(true);
  });
});
