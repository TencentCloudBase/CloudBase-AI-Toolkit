// tests/hooks/fullstack-injection-budget.test.mjs
// Regression: Skill() pointer platform skills must pack into the 12KB fullstack budget
// via injectionCost, without raising DEFAULT_INJECTION_BUDGET_BYTES.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadSkills, buildSkillInjectionOutput } from "../../plugin/cloudbase/hooks/skill-inject-core.mjs";
import { analyzePrompt } from "../../plugin/cloudbase/hooks/prompt-analysis.mjs";
import { searchSkills } from "../../plugin/cloudbase/hooks/lexical-index.mjs";
import { mergeExactAndLexical, rerankPromptAnalysisReport } from "../../plugin/cloudbase/hooks/unified-ranker.mjs";
import { applyProjectContextBoost, applyDominantTopicSuppression } from "../../plugin/cloudbase/hooks/prompt-patterns.mjs";
import { estimateSkillSize, normalizeSkillId } from "../../plugin/cloudbase/hooks/patterns.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const EVAL_DATASET = join(ROOT, "tests", "hooks", "eval", "prompts.jsonl");
const MANIFEST_PATH = join(ROOT, "plugin", "cloudbase", "generated", "skill-manifest.json");
const EVAL_SCRIPT = join(ROOT, "scripts", "eval-skill-inject.mjs");
const HOOK_SCRIPT = join(ROOT, "plugin", "cloudbase", "hooks", "user-prompt-submit-skill-inject.mjs");

const MAX_SKILLS = 3;
const INJECTION_BUDGET_BYTES = 12000;
const SKILL_POINTER_INJECTION_COST = 800;
const PLATFORM_POINTER_SKILLS = [
  "miniprogram-development",
  "web-development",
  "cloudrun-development",
  "cloudbase-cli",
  "cloudbase",
  "cloudbase-platform",
];
const AI_SPECIALISTS = ["ai-model-nodejs", "ai-model-web", "ai-model-wechat"];

function loadEvalDataset() {
  return readFileSync(EVAL_DATASET, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function evaluatePrompt(prompt, skillMap, compiledSkills, lexicalIndex) {
  const report = analyzePrompt(prompt, skillMap, compiledSkills);
  const lexicalResults = searchSkills(prompt, lexicalIndex, { minScore: 6, maxResults: 10 });
  const mergedResults = mergeExactAndLexical(report.results, lexicalResults, skillMap);
  const boostedResults = mergedResults.map((entry) => applyProjectContextBoost(entry, new Set()));
  const topScore = boostedResults.length > 0 ? Math.max(...boostedResults.map((e) => e.score)) : 0;
  report.results = boostedResults.map((entry) => applyDominantTopicSuppression(entry, topScore));
  return rerankPromptAnalysisReport(report, skillMap, MAX_SKILLS, INJECTION_BUDGET_BYTES);
}

function skillPointerBytes(skillId, skill) {
  const output = buildSkillInjectionOutput([skillId], { [skillId]: skill }, "UserPromptSubmit");
  const context = output.additionalContext || "";
  const matched = `  - "${skillId}" matched`;
  const toolName = skill?.name || skillId;
  const call = `You must run the Skill(${toolName}) tool (or fetch via searchKnowledgeBase(mode=skill, skillName="${skillId}") if Skill tool is unavailable).`;
  expect(context).toContain(matched);
  expect(context).toContain(call);
  return Buffer.byteLength(`${matched}\n${call}`, "utf8");
}

describe("fullstack injection budget", () => {
  it("does not raise the global 12KB injection budget", () => {
    const evalSrc = readFileSync(EVAL_SCRIPT, "utf-8");
    const hookSrc = readFileSync(HOOK_SCRIPT, "utf-8");
    expect(evalSrc).toMatch(/DEFAULT_INJECTION_BUDGET_BYTES = 12000/);
    expect(hookSrc).toMatch(/DEFAULT_INJECTION_BUDGET_BYTES = 12000/);
  });

  it("overrides Skill() pointer platform skills at actual pointer volume", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const skillId of PLATFORM_POINTER_SKILLS) {
      const skill = manifest.skills[skillId];
      expect(skill, skillId).toBeDefined();
      const pointerBytes = skillPointerBytes(skillId, skill);
      expect(pointerBytes, `${skillId} pointer bytes`).toBeLessThan(SKILL_POINTER_INJECTION_COST);
      expect(skill.metadata.injectionCost, skillId).toBe(SKILL_POINTER_INJECTION_COST);
      expect(estimateSkillSize(skill), skillId).toBe(SKILL_POINTER_INJECTION_COST);
    }
  });

  it("keeps mutually exclusive AI specialists on the description heuristic", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
    for (const skillId of AI_SPECIALISTS) {
      expect(manifest.skills[skillId].metadata.injectionCost, skillId).toBeUndefined();
    }
  });

  it("injects every expected fullstack skill from the eval dataset", () => {
    const { skillMap, compiledSkills, lexicalIndex } = loadSkills();
    const fullstackItems = loadEvalDataset().filter((item) => item.category === "fullstack");
    expect(fullstackItems.length).toBeGreaterThanOrEqual(2);

    for (const item of fullstackItems) {
      const reranked = evaluatePrompt(item.prompt, skillMap, compiledSkills, lexicalIndex);
      const actual = new Set(reranked.injectedSkills);
      const expected = (item.expectedSkills || []).map(normalizeSkillId);
      for (const skill of expected) {
        expect(actual.has(skill), `${item.prompt} missing ${skill}; injected=${JSON.stringify(reranked.injectedSkills)}`).toBe(
          true,
        );
      }
      expect(reranked.droppedByBudget).toEqual([]);
    }
  });

  it("injects cloudbase-platform without the cloudbase guideline on capability queries", () => {
    const { skillMap, compiledSkills, lexicalIndex } = loadSkills();
    const guidelineItems = loadEvalDataset().filter((item) => item.category === "guidelines");
    expect(guidelineItems.length).toBeGreaterThanOrEqual(3);

    for (const item of guidelineItems) {
      const reranked = evaluatePrompt(item.prompt, skillMap, compiledSkills, lexicalIndex);
      const actual = new Set(reranked.injectedSkills);
      const expected = new Set((item.expectedSkills || []).map(normalizeSkillId));
      expect(actual, item.prompt).toEqual(expected);
      expect(reranked.droppedByBudget).toEqual([]);
    }

    const capabilityPrompt = "CloudBase 平台有哪些核心能力";
    const capability = evaluatePrompt(capabilityPrompt, skillMap, compiledSkills, lexicalIndex);
    expect(capability.injectedSkills).toEqual(["cloudbase-platform"]);
    expect(capability.injectedSkills).not.toContain("cloudbase");
  });
});
