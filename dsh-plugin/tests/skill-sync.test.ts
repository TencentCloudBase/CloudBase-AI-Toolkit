import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bundledSkillNames,
  bundledSkillsDir,
  defaultSkillTarget,
  defaultSkillsRoot,
  installBundledSkills,
  listInstalledSkills,
} from "../src/server/skill-sync.js";

/** Directories created by a case, removed afterwards. */
const temporary: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

afterEach(() => {
  while (temporary.length > 0) {
    const dir = temporary.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

const REQUIRED_SKILLS = [
  "sites",
  "web-development",
  "postgresql",
  "cloud-functions",
  "auth-web",
  "cloud-storage",
];

/**
 * Faithful stand-in for DSH's own discovery, mirroring
 * `@deepseek-ai/dsh-skill-filesystem` -> `discoverRoot`: it lists the direct
 * children of one root and accepts a directory child only when it holds a
 * `SKILL.md`, or a file child ending in `.md`. It never descends further.
 *
 * Reproducing it here is the point of this suite: the bug is a layout mismatch
 * that only shows up when the real consumer walks the directory.
 */
function discoverSkills(root: string): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (existsSync(join(root, entry.name, "SKILL.md"))) found.push(entry.name);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) found.push(entry.name.replace(/\.md$/, ""));
  }
  return found.sort();
}

describe("bundled skill installation layout", () => {
  it("installs skills directly under the discovery root, without a group folder", () => {
    // DSH discovers exactly ONE level: <root>/<skill>/SKILL.md
    // (@deepseek-ai/dsh-skill-filesystem -> discoverRoot). A `cloudbase/` group
    // folder in between makes the whole set invisible, because the loader then
    // looks for <root>/cloudbase/SKILL.md, finds a directory without one, and
    // skips every skill beneath it.
    const root = makeTempDir("cloudbase-skills-root-");

    installBundledSkills(root);

    const installed = listInstalledSkills(root);
    expect(installed.length).toBeGreaterThan(0);
    // No skill directory may sit behind an extra nesting level.
    expect(installed).not.toContain("cloudbase");
    // Every installed entry must be a real, discoverable skill.
    for (const name of installed) {
      expect(existsSync(join(root, name, "SKILL.md")), `${name}/SKILL.md missing`).toBe(true);
    }
  });

  it("installs the full required skill set DSH advertises", () => {
    const root = makeTempDir("cloudbase-skills-set-");
    installBundledSkills(root);

    for (const name of REQUIRED_SKILLS) {
      expect(existsSync(join(root, name, "SKILL.md")), `${name} not installed`).toBe(true);
    }
  });

  it("keeps the in-package source layout untouched", () => {
    // The packaged bundle still groups them under skills/cloudbase — the
    // flattening happens on install, not in the source tree, so the npm
    // `files` entry and scripts/e2e/verify-dsh-plugin.mjs keep working.
    const source = bundledSkillsDir();
    expect(existsSync(join(source, "sites", "SKILL.md"))).toBe(true);
    expect(source.replace(/\\/g, "/")).toContain("skills/cloudbase");
  });

  it("targets the discovery root by default", () => {
    expect(defaultSkillTarget()).toBe(defaultSkillsRoot());
    expect(defaultSkillTarget()).not.toBe(join(defaultSkillsRoot(), "cloudbase"));
  });

  it("does not create the group folder inside the target", () => {
    const root = makeTempDir("cloudbase-skills-nogroup-");
    installBundledSkills(root);
    expect(existsSync(join(root, "cloudbase"))).toBe(false);
  });

  it("is idempotent across repeated installs", () => {
    const root = makeTempDir("cloudbase-skills-idem-");
    installBundledSkills(root);
    const first = listInstalledSkills(root).sort();
    installBundledSkills(root);
    const second = listInstalledSkills(root).sort();
    expect(second).toEqual(first);
  });

  it("returns exactly the skill directories that were copied", () => {
    const root = makeTempDir("cloudbase-skills-list-");
    installBundledSkills(root);
    const listed = listInstalledSkills(root).sort();
    const expected = readdirSync(bundledSkillsDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(listed).toEqual(expected);
  });

  it("makes every bundled skill discoverable by DSH's one-level scan", () => {
    // The regression this suite exists for. Before the fix the target was
    // ~/.dsh/skills/cloudbase, so DSH saw a directory without a SKILL.md at the
    // top level and registered none of the six skills.
    //
    // This case must go through the DEFAULT target — passing an explicit root
    // would bypass `defaultSkillTarget()` and never exercise the shipped layout.
    // `homedir()` is redirected to a sandbox so the real ~/.dsh is untouched.
    const fakeHome = makeTempDir("cloudbase-fake-home-");
    const previousProfile = process.env.USERPROFILE;
    const previousHome = process.env.HOME;
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
    try {
      const target = installBundledSkills();
      // `homedir()` must have followed the sandbox, or the assertion below
      // would silently inspect the developer's real home directory.
      expect(target).toBe(defaultSkillTarget());
      expect(target.startsWith(fakeHome)).toBe(true);

      const discovered = discoverSkills(defaultSkillsRoot());
      for (const name of REQUIRED_SKILLS) {
        expect(discovered, `${name} not discoverable`).toContain(name);
      }
    } finally {
      if (previousProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = previousProfile;
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  });

  it("registers no skill when the old group-folder layout is used", () => {
    // Guards the direction of the assertion above: the same discovery routine
    // finds nothing when the skills are nested one level deeper, which is
    // exactly the shipped bug.
    const root = makeTempDir("cloudbase-skills-legacy-");
    const nested = join(root, "cloudbase");
    installBundledSkills(nested);

    expect(discoverSkills(root)).not.toContain("sites");
    expect(existsSync(join(nested, "sites", "SKILL.md"))).toBe(true);
  });

  it("reports only the bundled set, not every skill sharing the discovery root", () => {
    // The install target is the shared discovery root, so listing that
    // directory would also report unrelated user skills. The CLI must print
    // what this package installed.
    const root = makeTempDir("cloudbase-skills-own-");
    mkdirSync(join(root, "some-other-skill"), { recursive: true });
    writeFileSync(join(root, "some-other-skill", "SKILL.md"), "---\nname: some-other-skill\n---\n", "utf8");

    installBundledSkills(root);

    const reported = bundledSkillNames();
    expect(reported).toEqual([...REQUIRED_SKILLS].sort());
    expect(reported).not.toContain("some-other-skill");
    // and the shared root really does contain the unrelated skill
    expect(listInstalledSkills(root)).toContain("some-other-skill");
  });
});
