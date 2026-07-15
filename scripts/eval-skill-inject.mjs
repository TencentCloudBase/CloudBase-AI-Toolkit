#!/usr/bin/env node
// scripts/eval-skill-inject.mjs
// Evaluates skill-inject hook accuracy against tests/hooks/eval/prompts.jsonl
// Calls the same code path as user-prompt-submit-skill-inject.mjs (without dedup/budget side effects)
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadSkills } from "../plugin/cloudbase/hooks/skill-inject-core.mjs";
import { analyzePrompt } from "../plugin/cloudbase/hooks/prompt-analysis.mjs";
import { searchSkills } from "../plugin/cloudbase/hooks/lexical-index.mjs";
import { mergeExactAndLexical, rerankPromptAnalysisReport } from "../plugin/cloudbase/hooks/unified-ranker.mjs";
import { applyProjectContextBoost, applyDominantTopicSuppression } from "../plugin/cloudbase/hooks/prompt-patterns.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const evalDatasetPath = join(projectRoot, "tests", "hooks", "eval", "prompts.jsonl");

const MAX_SKILLS = 3;
const DEFAULT_INJECTION_BUDGET_BYTES = 12000;

function loadDataset(path) {
  const content = readFileSync(path, "utf-8");
  return content
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function evaluatePrompt(prompt, skillMap, compiledSkills, lexicalIndex) {
  // Mirror user-prompt-submit-skill-inject.mjs logic (without dedup side effects)
  const report = analyzePrompt(prompt, skillMap, compiledSkills);

  // Apply troubleshooting intent (same as user-prompt-submit-skill-inject.mjs)
  if (report.troubleshooting.intent && report.troubleshooting.skills.length > 0) {
    for (const tsSkill of report.troubleshooting.skills) {
      const existing = report.results.find((r) => r.skill === tsSkill);
      if (existing) {
        if (!existing.matched) {
          existing.matched = true;
          existing.score = Math.max(existing.score, 6);
          existing.reason = `troubleshooting intent: ${report.troubleshooting.intent}`;
        }
      } else if (skillMap[tsSkill]) {
        report.results.push({
          skill: tsSkill,
          score: 6,
          matched: true,
          reason: `troubleshooting intent: ${report.troubleshooting.intent}`,
          minScore: 6,
          skill_metadata: skillMap[tsSkill],
        });
      }
    }
  }

  const lexicalResults = searchSkills(prompt, lexicalIndex, { minScore: 6, maxResults: 10 });
  const mergedResults = mergeExactAndLexical(report.results, lexicalResults, skillMap);

  // No project context boost in eval (no session profiler env vars set)
  const likelySkills = new Set(
    (process.env.CLOUDBASE_PLUGIN_LIKELY_SKILLS || "").split(",").filter(Boolean)
  );
  const boostedResults = mergedResults.map((entry) => applyProjectContextBoost(entry, likelySkills));
  const topScore = boostedResults.length > 0 ? Math.max(...boostedResults.map((e) => e.score)) : 0;
  const finalResults = boostedResults.map((entry) => applyDominantTopicSuppression(entry, topScore));
  report.results = finalResults;

  const reranked = rerankPromptAnalysisReport(report, skillMap, MAX_SKILLS, DEFAULT_INJECTION_BUDGET_BYTES);
  return {
    injectedSkills: reranked.injectedSkills,
    matchedSkills: reranked.matchedSkills,
    troubleshooting: report.troubleshooting,
  };
}

function computeMetrics(dataset, results) {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0; // Correct non-injection when expectedSkills is empty
  const byCategory = {};

  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i];
    const actual = new Set(results[i].injectedSkills);
    const expected = new Set(item.expectedSkills);

    const category = item.category;
    if (!byCategory[category]) {
      byCategory[category] = { tp: 0, fp: 0, fn: 0, tn: 0, total: 0 };
    }
    byCategory[category].total++;

    for (const skill of actual) {
      if (expected.has(skill)) {
        truePositives++;
        byCategory[category].tp++;
      } else {
        falsePositives++;
        byCategory[category].fp++;
      }
    }
    for (const skill of expected) {
      if (!actual.has(skill)) {
        falseNegatives++;
        byCategory[category].fn++;
      }
    }
    // True negative: no injection when none expected (negative/boundary with expectedSkills=[])
    if (expected.size === 0 && actual.size === 0) {
      trueNegatives++;
      byCategory[category].tn++;
    }
  }

  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (truePositives + trueNegatives) / (truePositives + falsePositives + falseNegatives + trueNegatives);

  return { truePositives, falsePositives, falseNegatives, trueNegatives, precision, recall, f1, accuracy, byCategory };
}

function main() {
  const verbose = process.argv.includes("--verbose");
  const dataset = loadDataset(evalDatasetPath);
  console.log(`=== Skill Inject 评估报告 ===`);
  console.log(`数据集: ${evalDatasetPath}`);
  console.log(`Prompt 数量: ${dataset.length}`);
  console.log();

  const { skillMap, compiledSkills, lexicalIndex, usedManifest } = loadSkills();
  console.log(`Manifest 加载: ${usedManifest ? "成功" : "失败（无 manifest）"}`);
  console.log(`Skills 数量: ${Object.keys(skillMap).length}`);

  // Diagnostic: count skills with non-empty promptSignals.phrases or retrieval
  let withPhrases = 0;
  let withRetrieval = 0;
  for (const skill of Object.values(skillMap)) {
    if (skill.promptSignals?.phrases?.length > 0) withPhrases++;
    const r = skill.retrieval || {};
    if ((r.aliases || []).length > 0 || (r.intents || []).length > 0 || (r.entities || []).length > 0 || (r.examples || []).length > 0) {
      withRetrieval++;
    }
  }
  console.log(`Skills with promptSignals.phrases: ${withPhrases}/${Object.keys(skillMap).length}`);
  console.log(`Skills with retrieval data: ${withRetrieval}/${Object.keys(skillMap).length}`);
  console.log();

  const results = dataset.map((item) => evaluatePrompt(item.prompt, skillMap, compiledSkills, lexicalIndex));
  const metrics = computeMetrics(dataset, results);

  console.log(`总体指标:`);
  console.log(`  Precision: ${metrics.precision.toFixed(4)} (${metrics.truePositives}/${metrics.truePositives + metrics.falsePositives})`);
  console.log(`  Recall:    ${metrics.recall.toFixed(4)} (${metrics.truePositives}/${metrics.truePositives + metrics.falseNegatives})`);
  console.log(`  F1:        ${metrics.f1.toFixed(4)}`);
  console.log(`  Accuracy:  ${metrics.accuracy.toFixed(4)} (TP=${metrics.truePositives} TN=${metrics.trueNegatives} FP=${metrics.falsePositives} FN=${metrics.falseNegatives})`);
  console.log(`  误命中数:  ${metrics.falsePositives}`);
  console.log(`  漏命中数:  ${metrics.falseNegatives}`);
  console.log(`  正确不注入: ${metrics.trueNegatives}`);
  console.log();

  console.log(`按类别统计:`);
  for (const [cat, data] of Object.entries(metrics.byCategory).sort()) {
    const p = data.tp + data.fp > 0 ? data.tp / (data.tp + data.fp) : 0;
    const r = data.tp + data.fn > 0 ? data.tp / (data.tp + data.fn) : 0;
    const f1 = p + r > 0 ? (2 * p * r) / (p + r) : 0;
    const tnInfo = data.tn > 0 ? ` tn=${data.tn}` : "";
    console.log(`  ${cat.padEnd(12)} P=${p.toFixed(2)} R=${r.toFixed(2)} F1=${f1.toFixed(2)} (n=${data.total}${tnInfo})`);
  }
  console.log();

  // Skill coverage report
  console.log(`Skill 覆盖率报告:`);
  const skillCoverage = {};
  for (const skillName of Object.keys(skillMap)) {
    skillCoverage[skillName] = { expected: 0, actual: 0 };
  }
  for (let i = 0; i < dataset.length; i++) {
    for (const skill of dataset[i].expectedSkills) {
      if (skillCoverage[skill]) skillCoverage[skill].expected++;
    }
    for (const skill of results[i].injectedSkills) {
      if (skillCoverage[skill]) skillCoverage[skill].actual++;
    }
  }
  const sortedCoverage = Object.entries(skillCoverage).sort((a, b) => b[1].expected - a[1].expected);
  for (const [skill, cov] of sortedCoverage) {
    if (cov.expected === 0 && cov.actual === 0) {
      console.log(`  ${skill.padEnd(32)} expected=0 actual=0 ⚠ 未覆盖`);
    } else {
      console.log(`  ${skill.padEnd(32)} expected=${cov.expected} actual=${cov.actual}`);
    }
  }
  console.log();

  // False positives (误命中)
  const falsePositivesList = [];
  for (let i = 0; i < dataset.length; i++) {
    const actual = new Set(results[i].injectedSkills);
    const expected = new Set(dataset[i].expectedSkills);
    for (const skill of actual) {
      if (!expected.has(skill)) {
        falsePositivesList.push({ prompt: dataset[i].prompt, skill, expected: dataset[i].expectedSkills });
      }
    }
  }
  console.log(`误命中清单 (${falsePositivesList.length} 条):`);
  if (falsePositivesList.length === 0) {
    console.log(`  (无)`);
  } else {
    falsePositivesList.forEach((fp, idx) => {
      console.log(`  [${idx + 1}] prompt: "${fp.prompt}"`);
      console.log(`      expected: ${JSON.stringify(fp.expected)}`);
      console.log(`      false+:   "${fp.skill}"`);
    });
  }
  console.log();

  // False negatives (漏命中)
  const falseNegativesList = [];
  for (let i = 0; i < dataset.length; i++) {
    const actual = new Set(results[i].injectedSkills);
    const expected = new Set(dataset[i].expectedSkills);
    for (const skill of expected) {
      if (!actual.has(skill)) {
        falseNegativesList.push({ prompt: dataset[i].prompt, skill, actual: results[i].injectedSkills });
      }
    }
  }
  console.log(`漏命中清单 (${falseNegativesList.length} 条):`);
  if (falseNegativesList.length === 0) {
    console.log(`  (无)`);
  } else {
    falseNegativesList.forEach((fn, idx) => {
      console.log(`  [${idx + 1}] prompt: "${fn.prompt}"`);
      console.log(`      expected: "${fn.skill}"`);
      console.log(`      actual:   ${JSON.stringify(fn.actual)}`);
    });
  }
  console.log();

  // Troubleshooting intent hits (only path that might work due to hardcoded regex)
  if (verbose) {
    console.log(`Troubleshooting intent 命中（verbose）:`);
    let tsHits = 0;
    for (let i = 0; i < dataset.length; i++) {
      const ts = results[i].troubleshooting;
      if (ts.intent) {
        tsHits++;
        console.log(`  [${i + 1}] prompt: "${dataset[i].prompt}"`);
        console.log(`      intent: ${ts.intent}, skills: ${JSON.stringify(ts.skills)}`);
      }
    }
    if (tsHits === 0) console.log(`  (无 troubleshooting intent 命中)`);
    console.log();
  }

  // Exit code: 0 if F1 >= 0.5, 1 otherwise (for CI gating)
  const exitCode = metrics.f1 >= 0.5 ? 0 : 1;
  if (exitCode !== 0) {
    console.log(`⚠ F1=${metrics.f1.toFixed(4)} 低于阈值 0.5，评估未通过`);
  } else {
    console.log(`✓ F1=${metrics.f1.toFixed(4)} 达到阈值 0.5`);
  }
  process.exit(exitCode);
}

main();
