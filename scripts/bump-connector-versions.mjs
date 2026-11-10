#!/usr/bin/env node
/**
 * Auto-bump the version of every WorkBuddy connector package when its content changed.
 *
 * Why: connector submission requires a version increment whenever the package content
 * changes. These packages are *derived* — their `skills/` trees are aggregated from
 * `config/source/**` at build time — so their content changes for reasons that never touch
 * `connector-meta.json`, and a hand-maintained version would silently go stale. CI runs
 * this on main and commits the bump back.
 *
 * Comparison base: the most recent tag, same as scripts/bump-expert-versions.mjs — a
 * version only has to advance relative to what was last published.
 *
 * Difference from the expert script: this one compares the WORKING TREE, not HEAD. It runs
 * immediately after a rebuild, and the regenerated `skills/` tree is still uncommitted at
 * that point — comparing HEAD would read the pre-rebuild content and miss the change.
 *
 * Loop safety: the bump itself edits connector-meta.json, so that file is compared with the
 * `version` field stripped and every other file by blob hash. Once bumped, the surviving
 * content difference still differs from the base tag, so the bump repeats on later pushes
 * until the next tag; that is intentional (the version only has to keep advancing), and it
 * matches the expert packs' behaviour.
 *
 * Usage:
 *   node scripts/bump-connector-versions.mjs [--base <ref>] [--dry-run]
 *
 *   --base <ref>   Compare against this git ref (default: latest tag via
 *                  `git describe --tags --abbrev=0`; skips if no tag exists)
 *   --dry-run      Print what would be bumped without writing files
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
/**
 * Every WorkBuddy connector package that carries a version. Both are *derived*: their
 * skills/ trees are aggregated from config/source/** at build time, so content changes
 * without anyone touching connector-meta.json — which is exactly why the version has to be
 * bumped by CI rather than by hand. New connector packages get added to this list.
 */
const PACK_DIRS = ["connectors/cloudbase", "connectors/cloudbase-intl"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const baseIdx = args.indexOf("--base");
let base = baseIdx >= 0 ? args[baseIdx + 1] : null;

function git(gitArgs, { allowFail = false } = {}) {
  try {
    return execFileSync("git", gitArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      // expected-failure probes (rev-parse / cat-file -e on absent paths)
      // must not leak "fatal:" noise to stderr
      stdio: allowFail ? ["ignore", "pipe", "ignore"] : "pipe",
    }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

if (!base) {
  base = git(["describe", "--tags", "--abbrev=0"], { allowFail: true });
  if (!base) {
    console.log(
      "No git tag found — nothing to compare against, skipping version bump.",
    );
    process.exit(0);
  }
}

function normalizeMeta(text) {
  try {
    const obj = JSON.parse(text);
    delete obj.version;
    return JSON.stringify(obj);
  } catch {
    return text; // malformed JSON: fall back to raw comparison
  }
}

/**
 * Only the files that actually enter the submission package count as content.
 *
 * Both builders zip an explicit entry list (PACKAGE_ENTRIES in
 * scripts/build-connector-cloudbase.mjs / -cloudbase-intl.mjs). Anything else in the package
 * directory — SUBMISSION.md, extra/, or another distribution channel's assets — is not
 * shipped, so editing it must not consume a version. Keep these lists in step with the
 * builders; a drift shows up as a bump that is one version too eager or too shy.
 */
const SHIPPED_ENTRIES = {
  "connectors/cloudbase": [
    "connector-meta.json",
    "mcp.json",
    "cli.json",
    "icon.svg",
    "skills",
  ],
  "connectors/cloudbase-intl": [
    "connector-meta.json",
    "mcp.json",
    "icon.svg",
    "skills",
  ],
};

function shippedFiles(files, packDir) {
  const entries = new Set(SHIPPED_ENTRIES[packDir] ?? []);
  return files.filter((file) =>
    entries.has(file.slice(packDir.length + 1).split("/")[0]),
  );
}

/** Does the package content (version field aside) differ from `base`? */
function packChangedSince(packDir, metaFile) {
  const worktreeFiles = shippedFiles(
    git(["ls-files", packDir])
      .split("\n")
      .filter(Boolean)
      .filter((file) => existsSync(path.join(repoRoot, file))),
    packDir,
  );
  const baseFiles = shippedFiles(
    git(["ls-tree", "-r", "--name-only", base, packDir])
      .split("\n")
      .filter(Boolean),
    packDir,
  );

  // Added or removed files are a content change on their own.
  if (worktreeFiles.length !== baseFiles.length) return true;
  const atBase = new Set(baseFiles);
  for (const file of worktreeFiles) {
    if (!atBase.has(file)) return true;
  }

  for (const file of worktreeFiles) {
    const worktreeHash = git(["hash-object", "--", file]);
    const baseHash = git(["rev-parse", `${base}:${file}`], { allowFail: true });
    if (baseHash === worktreeHash) continue;

    if (file === metaFile) {
      const baseText = git(["show", `${base}:${file}`], { allowFail: true });
      const worktreeText = readFileSync(path.join(repoRoot, file), "utf8");
      if (normalizeMeta(baseText ?? "") !== normalizeMeta(worktreeText)) {
        return true;
      }
      continue;
    }
    return true;
  }
  return false;
}

function bumpPatch(version) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  parts[2] += 1;
  return parts.join(".");
}

/** Bump one package; returns true when a version was written (or would be, on --dry-run). */
function bumpPack(packDir) {
  const metaFile = `${packDir}/connector-meta.json`;
  const metaPath = path.join(repoRoot, metaFile);

  // Not yet in the base ref -> brand new package, keep its initial version.
  if (git(["cat-file", "-e", `${base}:${metaFile}`], { allowFail: true }) === null) {
    console.log(`  ${packDir}: not present at ${base} (new package), keeping its initial version`);
    return false;
  }

  if (!packChangedSince(packDir, metaFile)) {
    console.log(`  ${packDir}: no content changed since ${base}.`);
    return false;
  }

  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const from = meta.version ?? "1.0.0";
  const to = bumpPatch(from);
  if (!to) {
    console.warn(`  ⚠️  ${packDir}: cannot parse version "${meta.version}", skipped`);
    return false;
  }

  console.log(`  ${packDir}: ${from} -> ${to}`);
  if (!dryRun) {
    meta.version = to;
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  }
  return true;
}

let bumped = 0;
for (const packDir of PACK_DIRS) {
  if (bumpPack(packDir)) bumped += 1;
}
if (bumped === 0) console.log(`No connector package content changed since ${base}.`);
