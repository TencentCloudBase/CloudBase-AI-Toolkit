// tests/hooks/compat.test.mjs — Unit tests for compat.mjs
// Covers: normalizeInput (source field extraction), formatOutput
import { describe, it, expect } from "vitest";
import { normalizeInput, formatOutput } from "../../plugin/cloudbase/hooks/compat.mjs";

describe("normalizeInput", () => {
  it("extracts source field from SessionStart input", () => {
    const raw = {
      hook_event_name: "SessionStart",
      source: "compact",
      session_id: "abc-123",
      cwd: "/tmp/project",
    };
    const normalized = normalizeInput(raw);
    expect(normalized.source).toBe("compact");
    expect(normalized.hookEvent).toBe("SessionStart");
  });

  it("extracts source field for clear events", () => {
    const raw = {
      hook_event_name: "SessionStart",
      source: "clear",
      session_id: "def-456",
    };
    const normalized = normalizeInput(raw);
    expect(normalized.source).toBe("clear");
  });

  it("extracts source field for startup events", () => {
    const raw = {
      hook_event_name: "SessionStart",
      source: "startup",
    };
    const normalized = normalizeInput(raw);
    expect(normalized.source).toBe("startup");
  });

  it("defaults source to empty string when absent", () => {
    const raw = { hook_event_name: "SessionStart" };
    const normalized = normalizeInput(raw);
    expect(normalized.source).toBe("");
  });

  it("detects cursor platform", () => {
    const raw = { conversation_id: "x", workspace_roots: ["/tmp"] };
    const normalized = normalizeInput(raw);
    expect(normalized.platform).toBe("cursor");
  });

  it("detects claude-code platform", () => {
    const raw = { session_id: "x", cwd: "/tmp" };
    const normalized = normalizeInput(raw);
    expect(normalized.platform).toBe("claude-code");
  });
});

describe("formatOutput", () => {
  it("returns hookSpecificOutput with additionalContext for claude-code", () => {
    const result = formatOutput("claude-code", {
      additionalContext: "test context",
    });
    expect(result.hookSpecificOutput).toBeDefined();
    expect(result.hookSpecificOutput.additionalContext).toBe("test context");
  });

  it("returns empty object when no additionalContext", () => {
    const result = formatOutput("claude-code", {});
    expect(result).toEqual({});
  });

  it("includes env in output for cursor", () => {
    const result = formatOutput("cursor", {
      env: { CLOUDBASE_PLUGIN_SEEN_SKILLS: "" },
    });
    expect(result.env).toBeDefined();
    expect(result.env.CLOUDBASE_PLUGIN_SEEN_SKILLS).toBe("");
  });
});
