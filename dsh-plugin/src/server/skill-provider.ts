import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Same precedence as `@deepseek-ai/dsh-skill` `BUNDLED_SKILL_RANK`.
 * Lower ranks win, so a user skill of the same name (rank 400) overrides this one.
 */
export const BUNDLED_SKILL_RANK = 600;

const PROVIDER_NAME = "cloudbase";
const INVOCATION = { modelInvocable: true, userInvocable: true } as const;

export interface BundledSkillCandidate {
  name: string;
  description: string;
  invocation: { modelInvocable: boolean; userInvocable: boolean };
  provider: string;
  source: "bundled";
  rank: number;
  locator: { path: string; directory: string };
  resourceBase: { kind: "directory"; path: string };
  path: string;
}

export interface BundledSkillDefinition extends BundledSkillCandidate {
  content: string;
}

export interface SkillRegistry {
  registerProvider?: (create: () => BundledSkillProvider) => void;
}

export interface BundledSkillProvider {
  name: string;
  list: () => Promise<BundledSkillCandidate[]>;
  get: () => Promise<BundledSkillDefinition | undefined>;
}

/** Directory of the packaged parent skill (`skills/cloudbase/SKILL.md`). */
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
 * Register the packaged CloudBase skill on `ctx.skills`.
 *
 * DSH discovers filesystem skills one level under `~/.dsh/skills`. Copying the
 * bundle there either hides it (no parent `SKILL.md`) or overwrites whatever
 * the user already installed. The host's own bundled skills register a
 * provider instead (`dsh-skill-badge`). This does the same: one candidate,
 * body and `references/` read from the package, nothing written to the user
 * skill root.
 */
export function registerBundledSkill(skills: SkillRegistry | undefined): void {
  const provider = createBundledSkillProvider();
  skills?.registerProvider?.(() => provider);
}

export function createBundledSkillProvider(): BundledSkillProvider {
  return {
    name: PROVIDER_NAME,
    async list() {
      const skill = readBundledSkill();
      return skill === undefined ? [] : [toCandidate(skill)];
    },
    async get() {
      const skill = readBundledSkill();
      if (skill === undefined) return undefined;
      return { ...toCandidate(skill), content: skill.body };
    },
  };
}

interface ParsedSkill {
  name: string;
  description: string;
  body: string;
  path: string;
  directory: string;
}

function readBundledSkill(): ParsedSkill | undefined {
  const directory = bundledSkillsDir();
  const path = join(directory, "SKILL.md");
  if (!existsSync(path)) return undefined;
  const raw = readFileSync(path, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const frontmatter = match?.[1];
  const body = match?.[2];
  if (frontmatter === undefined || body === undefined) return undefined;
  const name = field(frontmatter, "name");
  const description = field(frontmatter, "description");
  if (name === undefined || description === undefined) return undefined;
  return { name, description, body: body.trim(), path, directory };
}

function field(frontmatter: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(frontmatter);
  let value = match?.[1]?.trim();
  if (value === undefined || value.length === 0) return undefined;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.length === 0 ? undefined : value;
}

function toCandidate(skill: ParsedSkill): BundledSkillCandidate {
  return {
    name: skill.name,
    description: skill.description,
    invocation: INVOCATION,
    provider: PROVIDER_NAME,
    source: "bundled",
    rank: BUNDLED_SKILL_RANK,
    locator: { path: skill.path, directory: skill.directory },
    resourceBase: { kind: "directory", path: skill.directory },
    path: skill.path,
  };
}
