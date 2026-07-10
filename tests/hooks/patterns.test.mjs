// tests/hooks/patterns.test.mjs — Unit tests for patterns.mjs
// Covers: parseSeenSkills, mergeSeenSkills, filterSeenSkillState, isHighPrioritySkill,
// mergeSeenSkillStatesWithCompactionReset
import { describe, it, expect } from "vitest";
import {
  parseSeenSkills,
  mergeSeenSkills,
  filterSeenSkillState,
  isHighPrioritySkill,
  mergeSeenSkillStates,
  mergeSeenSkillStatesWithCompactionReset,
  COMPACTION_REINJECT_MIN_PRIORITY,
} from "../../plugin/cloudbase/hooks/patterns.mjs";

describe("parseSeenSkills", () => {
  it("parses comma-separated skills", () => {
    expect(parseSeenSkills("web-development,auth-tool")).toEqual(["web-development", "auth-tool"]);
  });

  it("handles empty string", () => {
    expect(parseSeenSkills("")).toEqual([]);
  });

  it("handles whitespace", () => {
    expect(parseSeenSkills(" web , auth ")).toEqual(["web", "auth"]);
  });

  it("handles non-string input", () => {
    expect(parseSeenSkills(null)).toEqual([]);
    expect(parseSeenSkills(undefined)).toEqual([]);
  });

  it("does not deduplicate (mergeSeenSkills does)", () => {
    expect(parseSeenSkills("web,web,auth")).toEqual(["web", "web", "auth"]);
  });
});

describe("mergeSeenSkills", () => {
  it("merges multiple sources", () => {
    const result = mergeSeenSkills("web-development", "auth-tool,cloud-functions", "");
    expect(result.sort()).toEqual(["auth-tool", "cloud-functions", "web-development"]);
  });

  it("deduplicates", () => {
    const result = mergeSeenSkills("web,auth", "auth,cloud");
    expect(result.sort()).toEqual(["auth", "cloud", "web"]);
  });

  it("handles empty inputs", () => {
    expect(mergeSeenSkills("", "", "")).toEqual([]);
  });
});

describe("filterSeenSkillState", () => {
  it("filters out specified skills", () => {
    const result = filterSeenSkillState("web,auth,cloud", new Set(["auth"]));
    expect(result).toBe("web,cloud");
  });

  it("handles empty value", () => {
    expect(filterSeenSkillState("", new Set(["auth"]))).toBe("");
  });

  it("handles empty clear set", () => {
    expect(filterSeenSkillState("web,auth", new Set())).toBe("web,auth");
  });
});

describe("isHighPrioritySkill", () => {
  const skillMap = {
    "high-priority": { metadata: { priority: 8 } },
    "low-priority": { metadata: { priority: 4 } },
    "no-metadata": {},
  };

  it("returns true for priority >= 7", () => {
    expect(isHighPrioritySkill("high-priority", skillMap)).toBe(true);
  });

  it("returns false for priority < 7", () => {
    expect(isHighPrioritySkill("low-priority", skillMap)).toBe(false);
  });

  it("returns false for unknown skill", () => {
    expect(isHighPrioritySkill("unknown", skillMap)).toBe(false);
  });

  it("returns false for skill without metadata", () => {
    expect(isHighPrioritySkill("no-metadata", skillMap)).toBe(false);
  });

  it("COMPACTION_REINJECT_MIN_PRIORITY is 7", () => {
    expect(COMPACTION_REINJECT_MIN_PRIORITY).toBe(7);
  });
});

describe("mergeSeenSkillStatesWithCompactionReset", () => {
  const skillMap = {
    "high-priority": { metadata: { priority: 8 } },
    "low-priority": { metadata: { priority: 4 } },
  };

  it("does not reset when compaction not triggered", () => {
    const result = mergeSeenSkillStatesWithCompactionReset(
      "high-priority,low-priority",
      "",
      "",
      { skillMap, compactionTriggered: false }
    );
    expect(result.compactionResetApplied).toBe(false);
    expect(result.clearedSkills).toEqual([]);
    expect(result.seenState.sort()).toEqual(["high-priority", "low-priority"]);
  });

  it("resets high-priority skills on compaction", () => {
    const result = mergeSeenSkillStatesWithCompactionReset(
      "high-priority,low-priority",
      "",
      "",
      { skillMap, compactionTriggered: true }
    );
    expect(result.compactionResetApplied).toBe(true);
    expect(result.clearedSkills).toEqual(["high-priority"]);
    expect(result.seenState).toEqual(["low-priority"]);
  });

  it("merges all three sources", () => {
    const result = mergeSeenSkillStatesWithCompactionReset(
      "high-priority",
      "low-priority",
      "",
      { skillMap, compactionTriggered: false }
    );
    expect(result.seenState.sort()).toEqual(["high-priority", "low-priority"]);
  });
});

describe("mergeSeenSkillStates", () => {
  it("merges all inputs", () => {
    const result = mergeSeenSkillStates("web", "auth", "cloud");
    expect(result.sort()).toEqual(["auth", "cloud", "web"]);
  });
});
