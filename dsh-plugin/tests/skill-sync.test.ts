import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_SKILL_RANK,
  bundledSkillsDir,
  createBundledSkillProvider,
  registerBundledSkill,
} from "../src/server/skill-provider.js";

describe("bundled CloudBase skill", () => {
  it("ships the generated parent skill and source references", () => {
    const source = bundledSkillsDir();
    expect(existsSync(join(source, "SKILL.md"))).toBe(true);
    expect(existsSync(join(source, "references", "web-development", "SKILL.md"))).toBe(true);
    expect(existsSync(join(source, "references", "sites", "SKILL.md"))).toBe(false);
  });

  it("registers one bundled candidate", async () => {
    const provider = createBundledSkillProvider();
    const listed = await provider.list();
    expect(listed.map((skill) => skill.name)).toEqual(["cloudbase"]);
    expect(listed[0]?.rank).toBe(BUNDLED_SKILL_RANK);
    expect(listed[0]?.source).toBe("bundled");
    expect(listed[0]?.resourceBase.path).toBe(bundledSkillsDir());

    const loaded = await provider.get();
    expect(loaded?.content).toContain("references/");
    expect(loaded?.content.startsWith("---")).toBe(false);
  });

  it("hands that provider to the host skill registry", () => {
    const registered: unknown[] = [];
    registerBundledSkill({
      registerProvider(create) {
        registered.push(create());
      },
    });
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ name: "cloudbase" });
  });
});
