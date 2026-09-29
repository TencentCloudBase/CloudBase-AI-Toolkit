import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function bundledSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../skills/cloudbase"),
    join(here, "../../skills/cloudbase"),
    join(process.cwd(), "skills/cloudbase"),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? join(process.cwd(), "skills/cloudbase");
}

/**
 * Root that DSH discovers user skills from.
 *
 * DSH treats each IMMEDIATE child of this directory as one skill: a directory
 * child is read as `<child>/SKILL.md`, and a file child as one flat `<child>.md`
 * (`@deepseek-ai/dsh-skill-filesystem` → `discoverRoot`). It does not recurse,
 * so an extra nesting level hides every skill beneath it.
 */
export function defaultSkillsRoot(): string {
  return join(homedir(), ".dsh", "skills");
}

/**
 * Install target for the bundle-carried skills.
 *
 * The bundled set lives at `<package>/skills/cloudbase/<name>/SKILL.md`, but the
 * `cloudbase/` segment is only a group folder INSIDE the package — it must not
 * survive the copy, because DSH would then look for `cloudbase/SKILL.md`, find a
 * directory without one, and skip the whole set. The skills are therefore
 * installed one level up, directly under the discovery root, which is the only
 * layout `discoverRoot` reads.
 */
export function defaultSkillTarget(): string {
  return defaultSkillsRoot();
}

export function installBundledSkills(target = defaultSkillTarget()): string {
  const source = bundledSkillsDir();
  if (!existsSync(source)) {
    throw new Error(`Bundled skills not found at ${source}`);
  }
  mkdirSync(target, { recursive: true });
  // Copy each skill directory individually so `cloudbase/` is not re-created
  // inside the target.
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    cpSync(join(source, entry.name), join(target, entry.name), { recursive: true });
  }
  return target;
}

export function listInstalledSkills(target = defaultSkillTarget()): string[] {
  if (!existsSync(target)) return [];
  return readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Names of the skills this package ships.
 *
 * The install target is now the shared discovery root, which also holds every
 * other user skill, so reporting what an install wrote requires the bundle's own
 * list rather than `listInstalledSkills(target)`.
 */
export function bundledSkillNames(): string[] {
  const source = bundledSkillsDir();
  if (!existsSync(source)) return [];
  return readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
