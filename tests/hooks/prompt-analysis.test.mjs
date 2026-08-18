// tests/hooks/prompt-analysis.test.mjs — Unit tests for prompt-analysis.mjs
import { describe, it, expect } from "vitest";
import {
  classifyTroubleshootingIntent,
  analyzePrompt,
} from "../../plugin/cloudbase/hooks/prompt-analysis.mjs";
import { normalizePromptText, compilePromptSignals } from "../../plugin/cloudbase/hooks/prompt-patterns.mjs";

function classify(prompt) {
  return classifyTroubleshootingIntent(normalizePromptText(prompt));
}

describe("classifyTroubleshootingIntent — ops-inspector v3 metrics/playbooks", () => {
  it.each([
    "昨晚峰值 QPS 多少",
    "peak QPS for the env",
    "CPU 告警是否正常",
    "接口返回 429 被限频了",
    "rate limited with 429",
    "云函数调用量为 0",
    "报错 ACCESS_TOKEN_INVALID",
  ])("matches metrics-ops for: %s", (prompt) => {
    const result = classify(prompt);
    expect(result.intent).toBe("metrics-ops");
    expect(result.skills).toEqual(["ops-inspector"]);
  });

  it("keeps existing flow-verification intent", () => {
    const result = classify("我的页面加载了但按钮不生效");
    expect(result.intent).toBe("flow-verification");
    expect(result.skills).toContain("ops-inspector");
  });

  it("does not treat bare debug-诊断 as metrics-ops", () => {
    const result = classify("诊断这个 bug 的根因");
    expect(result.intent).not.toBe("metrics-ops");
  });

  it("suppresses when test framework is mentioned", () => {
    const result = classify("vitest 里峰值 QPS 断言失败");
    expect(result.intent).toBeNull();
    expect(result.reason).toMatch(/suppressed/i);
  });
});

describe("analyzePrompt wires troubleshooting for ops-inspector", () => {
  it("returns metrics-ops troubleshooting on peak QPS prompt", () => {
    const compiled = {
      "ops-inspector": compilePromptSignals({
        phrases: ["峰值 qps"],
        minScore: 6,
      }),
    };
    const report = analyzePrompt("昨晚峰值 QPS 多少", { "ops-inspector": {} }, compiled);
    expect(report.troubleshooting.intent).toBe("metrics-ops");
    expect(report.troubleshooting.skills).toContain("ops-inspector");
  });
});
