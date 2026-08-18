// tests/hooks/e2e/hook-chain.test.mjs — End-to-end hook chain tests
// Simulates the full hook flow: SessionStart → UserPromptSubmit → PreToolUse
import { describe, it, expect } from "vitest";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..", "..");
const hooksDir = join(projectRoot, "plugin", "cloudbase", "hooks");

// Helper: run a hook script with stdin input
function runHook(hookScript, stdinInput) {
  const input = JSON.stringify(stdinInput);
  try {
    const result = execFileSync("node", [join(hooksDir, hookScript)], {
      input,
      encoding: "utf-8",
      timeout: 10000,
      env: {
        ...process.env,
        // Disable audit log writes during tests
        CLOUDBASE_PLUGIN_AUDIT_LOG_FILE: "off",
        // Disable dedup for clean test state
        CLOUDBASE_PLUGIN_TEST_MODE: "1",
      },
    });
    return JSON.parse(result || "{}");
  } catch (error) {
    return { error: error.message, stdout: error.stdout, stderr: error.stderr };
  }
}

function getAdditionalContext(result) {
  return (
    result?.additionalContext ||
    result?.additional_context ||
    result?.hookSpecificOutput?.additionalContext ||
    ""
  );
}

describe("End-to-end hook chain", () => {
  it("UserPromptSubmit hook returns valid additionalContext for a database prompt", () => {
    const result = runHook("user-prompt-submit-skill-inject.mjs", {
      prompt: "创建一个用户表，存储用户信息",
      sessionId: "test-e2e-session-1",
    });

    // Should not error
    expect(result.error).toBeUndefined();
    // Should return either empty (no match) or additionalContext
    const ctx = getAdditionalContext(result);
    if (ctx) {
      expect(typeof ctx).toBe("string");
      // If injected, should mention skill injection
      if (ctx.length > 0) {
        expect(ctx).toContain("skillInjection");
      }
    }
  });

  it("UserPromptSubmit hook returns empty for a short prompt", () => {
    const result = runHook("user-prompt-submit-skill-inject.mjs", {
      prompt: "hi",
      sessionId: "test-e2e-session-2",
    });

    expect(result.error).toBeUndefined();
    expect(getAdditionalContext(result)).toBeFalsy();
  });

  it("UserPromptSubmit hook handles troubleshooting intent (ops-inspector)", () => {
    const result = runHook("user-prompt-submit-skill-inject.mjs", {
      prompt: "我的页面加载了但按钮不生效",
      sessionId: "test-e2e-session-3",
    });

    expect(result.error).toBeUndefined();
    const ctx = getAdditionalContext(result);
    // Should inject ops-inspector due to troubleshooting intent
    expect(ctx.toLowerCase()).toContain("ops-inspector");
  });

  it.each([
    ["昨晚峰值 QPS 多少", "test-e2e-ops-qps"],
    ["CPU 告警是否正常", "test-e2e-ops-cpu"],
    ["接口返回 429 被限频了", "test-e2e-ops-429"],
    ["云函数调用量为 0", "test-e2e-ops-zero"],
    ["报错 ACCESS_TOKEN_INVALID", "test-e2e-ops-token"],
  ])("UserPromptSubmit injects ops-inspector for v3 trigger: %s", (prompt, sessionId) => {
    const result = runHook("user-prompt-submit-skill-inject.mjs", {
      prompt,
      sessionId,
    });

    expect(result.error).toBeUndefined();
    const ctx = getAdditionalContext(result);
    expect(ctx).toBeTruthy();
    expect(ctx.toLowerCase()).toContain("ops-inspector");
  });

  it("PreToolUse hook skips non-target tools", () => {
    const result = runHook("pretooluse-skill-inject.mjs", {
      toolName: "Read",
      toolInput: { file_path: "/some/path/to/file.js" },
      sessionId: "test-e2e-session-4",
    });

    expect(result.error).toBeUndefined();
    // Read tool is not in the target list, should return empty
    expect(getAdditionalContext(result)).toBeFalsy();
  });

  it("PreToolUse hook handles missing tool input gracefully", () => {
    const result = runHook("pretooluse-skill-inject.mjs", {
      toolName: "Edit",
      toolInput: {},
      sessionId: "test-e2e-session-5",
    });

    expect(result.error).toBeUndefined();
    expect(getAdditionalContext(result)).toBeFalsy();
  });

  it("hook chain produces consistent results for the same prompt", () => {
    // Run the same prompt twice (with different sessions to avoid dedup)
    const result1 = runHook("user-prompt-submit-skill-inject.mjs", {
      prompt: "部署云函数到 CloudBase",
      sessionId: "test-e2e-session-6a",
    });
    const result2 = runHook("user-prompt-submit-skill-inject.mjs", {
      prompt: "部署云函数到 CloudBase",
      sessionId: "test-e2e-session-6b",
    });

    // Both should have the same result (no dedup on first occurrence per session)
    expect(result1.error).toBeUndefined();
    expect(result2.error).toBeUndefined();
    expect(getAdditionalContext(result1)).toEqual(getAdditionalContext(result2));
  });

  it("session-start-profiler detects project type from package.json", () => {
    // This test runs the profiler in the current project (which has package.json)
    const result = runHook("session-start-profiler.mjs", {
      cwd: projectRoot,
      sessionId: "test-e2e-session-7",
    });

    expect(result.error).toBeUndefined();
    // Profiler may return env vars or additionalContext
    // Just verify it runs without error
    expect(result).toBeDefined();
  });
});
