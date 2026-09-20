#!/usr/bin/env node
/**
 * Auto-bump the version of the `cloudbase-intl` connector package when its content changed.
 *
 * Why: connector submission requires a version increment whenever the package content
 * changes. This package is *derived* — its `skills/` tree is aggregated from
 * `config/source/**` at build time — so its content changes for reasons that never touch
 * `connector-meta.json`, and a hand-maintained version would silently go stale. CI runs
 * this on main (from sync-connector-intl-package.yml) and commits the bump back.
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
const PACK_DIR = "connectors/cloudbase-intl";
const META_FILE = `${PACK_DIR}/connector-meta.json`;

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
 * `SUBMISSION.md` is addressed to the reviewer and `extra/` is a build-time input — neither
 * is shipped (see PACKAGE_ENTRIES in scripts/build-connector-cloudbase-intl.mjs), so editing
 * them must not consume a version. If that entry list ever changes, keep this in step; the
 * failure mode is a bump that is one version too eager or too shy, not a broken package.
 */
const NOT_SHIPPED = ["SUBMISSION.md", "extra/"];

function shippedFiles(files) {
  return files.filter(
    (file) =>
      !NOT_SHIPPED.some((excluded) =>
        excluded.endsWith("/")
          ? file.startsWith(`${PACK_DIR}/${excluded}`)
          : file === `${PACK_DIR}/${excluded}`,
      ),
  );
}

/** Does the package content (version field aside) differ from `base`? */
function packChangedSince() {
  const worktreeFiles = shippedFiles(
    git(["ls-files", PACK_DIR])
      .split("\n")
      .filter(Boolean)
      .filter((file) => existsSync(path.join(repoRoot, file))),
  );
  const baseFiles = shippedFiles(
    git(["ls-tree", "-r", "--name-only", base, PACK_DIR])
      .split("\n")
      .filter(Boolean),
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

    if (file === META_FILE) {
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

// Not yet in the base ref -> brand new package, keep its initial version.
if (git(["cat-file", "-e", `${base}:${META_FILE}`], { allowFail: true }) === null) {
  console.log(
    `  ${PACK_DIR}: not present at ${base} (new package), keeping its initial version`,
  );
  process.exit(0);
}

if (!packChangedSince()) {
  console.log(`No ${PACK_DIR} content changed since ${base}.`);
  process.exit(0);
}

const metaPath = path.join(repoRoot, META_FILE);
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const from = meta.version ?? "1.0.0";
const to = bumpPatch(from);
if (!to) {
  console.warn(`  ⚠️  cannot parse version "${meta.version}", skipped`);
  process.exit(0);
}

console.log(`  ${PACK_DIR}: ${from} -> ${to}`);
if (!dryRun) {
  meta.version = to;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
}
