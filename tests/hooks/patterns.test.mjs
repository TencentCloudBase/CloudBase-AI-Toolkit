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
  estimateSkillSize,
  sortPromptScoreStates,
  readPromptScorePriority,
  COMPACTION_REINJECT_MIN_PRIORITY,
  DEFAULT_SKILL_SIZE_ESTIMATE,
} from "../../plugin/cloudbase/hooks/patterns.mjs";

describe("parseSeenSkills", () => {
  it("parses comma-separated skills", () => {
    expect(parseSeenSkills("web-development,auth-tool")).toEqual(["web-development", "auth-tool-cloudbase"]);
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
    expect(result.sort()).toEqual(["auth-tool-cloudbase", "cloud-functions", "web-development"]);
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

describe("estimateSkillSize", () => {
  it("uses description length * 10 with a 500 floor", () => {
    expect(estimateSkillSize(null)).toBe(DEFAULT_SKILL_SIZE_ESTIMATE);
    expect(estimateSkillSize({ description: "abc" })).toBe(DEFAULT_SKILL_SIZE_ESTIMATE);
    expect(estimateSkillSize({ description: "x".repeat(80) })).toBe(800);
  });

  it("honors metadata.injectionCost over the description heuristic", () => {
    expect(
      estimateSkillSize({
        description: "x".repeat(1023),
        metadata: { injectionCost: 800 },
      }),
    ).toBe(800);
  });

  it("ignores non-positive injectionCost overrides", () => {
    expect(
      estimateSkillSize({
        description: "x".repeat(80),
        metadata: { injectionCost: 0 },
      }),
    ).toBe(800);
  });
});

describe("sortPromptScoreStates", () => {
  it("reads nested metadata.priority from skillMap entries", () => {
    const ranked = [
      {
        skill: "cloud-storage-web",
        score: 16,
        skill_metadata: { metadata: { priority: 6 } },
      },
      {
        skill: "miniprogram-development",
        score: 16,
        skill_metadata: { metadata: { priority: 8 } },
      },
    ];
    sortPromptScoreStates(ranked);
    expect(ranked.map((e) => e.skill)).toEqual([
      "miniprogram-development",
      "cloud-storage-web",
    ]);
  });

  it("readPromptScorePriority accepts flat priority for synthetic states", () => {
    expect(readPromptScorePriority({ skill_metadata: { priority: 7 } })).toBe(7);
    expect(readPromptScorePriority({ skill_metadata: { metadata: { priority: 9 } } })).toBe(9);
    expect(readPromptScorePriority({})).toBe(0);
  });
});
