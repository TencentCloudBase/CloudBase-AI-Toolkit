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

export function defaultSkillTarget(): string {
  return join(homedir(), ".dsh", "skills", "cloudbase");
}

export function installBundledSkills(target = defaultSkillTarget()): string {
  const source = bundledSkillsDir();
  if (!existsSync(source)) {
    throw new Error(`Bundled skills not found at ${source}`);
  }
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  return target;
}

export function listInstalledSkills(target = defaultSkillTarget()): string[] {
  if (!existsSync(target)) return [];
  return readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
