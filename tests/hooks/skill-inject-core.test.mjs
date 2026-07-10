// tests/hooks/skill-inject-core.test.mjs — Unit tests for skill-inject-core.mjs
// Covers: buildSkillInjectionOutput (skill name resolution for Skill() calls)
import { describe, it, expect } from "vitest";
import { buildSkillInjectionOutput } from "../../plugin/cloudbase/hooks/skill-inject-core.mjs";

describe("buildSkillInjectionOutput", () => {
  it("uses skill.name (frontmatter name) for Skill() tool call", () => {
    const skillMap = {
      "auth-tool": {
        name: "auth-tool-cloudbase",
        description: "Auth tool skill",
        metadata: { priority: 8 },
      },
    };
    const result = buildSkillInjectionOutput(["auth-tool"], skillMap, "UserPromptSubmit");
    expect(result.additionalContext).toContain("Skill(auth-tool-cloudbase)");
    expect(result.additionalContext).not.toContain("Skill(auth-tool)");
  });

  it("uses searchKnowledgeBase with directory name (skillMap key)", () => {
    const skillMap = {
      "auth-tool": {
        name: "auth-tool-cloudbase",
        description: "Auth tool skill",
        metadata: { priority: 8 },
      },
    };
    const result = buildSkillInjectionOutput(["auth-tool"], skillMap, "UserPromptSubmit");
    expect(result.additionalContext).toContain('searchKnowledgeBase(mode=skill, skillName="auth-tool")');
  });

  it("falls back to skillName when skill.name is absent", () => {
    const skillMap = {
      "web-development": {
        description: "Web dev skill",
        metadata: { priority: 8 },
      },
    };
    const result = buildSkillInjectionOutput(["web-development"], skillMap, "UserPromptSubmit");
    expect(result.additionalContext).toContain("Skill(web-development)");
  });

  it("handles cloudbase-guidelines → cloudbase name mapping", () => {
    const skillMap = {
      "cloudbase-guidelines": {
        name: "cloudbase",
        description: "Main entry skill",
        metadata: { priority: 8 },
      },
    };
    const result = buildSkillInjectionOutput(["cloudbase-guidelines"], skillMap, "UserPromptSubmit");
    expect(result.additionalContext).toContain("Skill(cloudbase)");
    expect(result.additionalContext).not.toContain("Skill(cloudbase-guidelines)");
  });

  it("returns null additionalContext for empty injectedSkills", () => {
    const result = buildSkillInjectionOutput([], {}, "UserPromptSubmit");
    expect(result.additionalContext).toBeNull();
  });

  it("includes docs block when metadata.docs present", () => {
    const skillMap = {
      "web-development": {
        name: "web-development",
        description: "Web dev",
        metadata: {
          priority: 8,
          docs: ["https://docs.example.com/web"],
        },
      },
    };
    const result = buildSkillInjectionOutput(["web-development"], skillMap, "UserPromptSubmit");
    expect(result.additionalContext).toContain("Official docs:");
    expect(result.additionalContext).toContain("https://docs.example.com/web");
  });
});
