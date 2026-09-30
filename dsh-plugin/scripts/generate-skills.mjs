#!/usr/bin/env node
/**
 * Generate dsh-plugin/skills/cloudbase from the toolkit all-in-one builder.
 * Requires repo-root dependencies (tsx, js-yaml) via `pnpm install`.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(pluginRoot, "..");
const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

if (!existsSync(tsxCli)) {
  console.error("generate-skills: missing tsx. Run pnpm install at the repository root.");
  process.exit(1);
}

execFileSync(
  process.execPath,
  [tsxCli, "scripts/build-allinone-skill.ts", "--dir", join(pluginRoot, "skills")],
  { cwd: repoRoot, stdio: "inherit" },
);
