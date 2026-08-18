// hooks/prompt-analysis.mjs — Prompt intent analysis (troubleshooting classification etc.)
// Adapted from Vercel plugin
import { normalizePromptText, matchPromptWithReason } from "./prompt-patterns.mjs";

// --- Troubleshooting intent classification ---

var FLOW_VERIFICATION_RE = /\b(?:loads?\s+but|submits?\s+but|works?\s+but|shows?\s+but|renders?\s+but|displays?\s+but|returns?\s+but|responds?\s+but)\b/;
var STUCK_INVESTIGATION_RE = /\b(?:stuck|hung|frozen|timeout|hanging|spinning|infinite\s+loop|deadlock)\b/;
var BROWSER_ONLY_RE = /\b(?:blank\s+page|white\s+screen|console\s+errors?|404|500|cors|refused\s+to\s+execute|network\s+error)\b/;
var TEST_FRAMEWORK_RE = /\b(?:jest|vitest|playwright|cypress|mocha|testing\s+library|unit\s+test|integration\s+test)\b/;

// Chinese equivalents
var CN_FLOW_VERIFICATION_RE = /(加载但|提交但|工作了但|显示但|渲染但|返回但|响应但|不生效|没效果)/;
var CN_STUCK_RE = /(卡住|卡死|冻结|超时|挂起|转圈|死循环|死锁)/;
var CN_BROWSER_RE = /(白屏|空白页|控制台错误|404|500|跨域|cors|网络错误|拒绝执行)/;
var CN_TEST_RE = /(测试|单元测试|集成测试|jest|vitest|playwright|cypress)/;

// ops-inspector v3: alarm interpretation + fault playbooks
// Prefer specific phrases (avoid bare "告警"/"诊断") so boundary negatives stay clean.
var METRICS_ALARM_RE = /\b(?:peak\s+qps|qps\s+peak|cpu\s+alert|access_token_invalid|rate\s*limit(?:ed|ing)?|throttl(?:e|ed|ing)|zero\s+invocations?)\b/;
var CN_METRICS_ALARM_RE = /(峰值\s*qps|峰值qps|cpu\s*告警|告警是否正常|限频|被限流|调用量为\s*0|调用量是\s*0|调用量为0|调用量\s*为\s*零|access_token_invalid|\b429\b)/i;

export function classifyTroubleshootingIntent(normalizedPrompt) {
  // Suppress if test framework mentioned
  if (TEST_FRAMEWORK_RE.test(normalizedPrompt) || CN_TEST_RE.test(normalizedPrompt)) {
    return { intent: null, skills: [], reason: "suppressed by test framework mention" };
  }

  // Metrics / alarm / rate-limit / token / zero-calls (ops-inspector v3) — check before
  // generic browser patterns so "429" and QPS questions get a precise intent reason.
  if (METRICS_ALARM_RE.test(normalizedPrompt) || CN_METRICS_ALARM_RE.test(normalizedPrompt)) {
    return {
      intent: "metrics-ops",
      skills: ["ops-inspector"],
      reason: "metrics / alarm / fault-playbook trigger",
    };
  }

  if (BROWSER_ONLY_RE.test(normalizedPrompt) || CN_BROWSER_RE.test(normalizedPrompt)) {
    return { intent: "browser-only", skills: ["ops-inspector"], reason: "browser-only issue" };
  }

  if (FLOW_VERIFICATION_RE.test(normalizedPrompt) || CN_FLOW_VERIFICATION_RE.test(normalizedPrompt)) {
    return { intent: "flow-verification", skills: ["ops-inspector"], reason: "flow verification issue" };
  }

  if (STUCK_INVESTIGATION_RE.test(normalizedPrompt) || CN_STUCK_RE.test(normalizedPrompt)) {
    return { intent: "stuck-investigation", skills: ["ops-inspector"], reason: "stuck investigation" };
  }

  return { intent: null, skills: [], reason: "no troubleshooting intent" };
}

// --- Analyze prompt (main entry) ---

export function analyzePrompt(prompt, skillMap, compiledSkills) {
  const normalized = normalizePromptText(prompt);
  const results = [];
  const troubleshooting = classifyTroubleshootingIntent(normalized);

  for (const [skillName, compiled] of Object.entries(compiledSkills)) {
    const matchResult = matchPromptWithReason(normalized, compiled);
    results.push({
      skill: skillName,
      score: matchResult.score,
      matched: matchResult.matched,
      reason: matchResult.reason,
      minScore: compiled.minScore,
      skill_metadata: skillMap[skillName],
    });
  }

  return {
    normalized,
    results,
    troubleshooting,
  };
}
