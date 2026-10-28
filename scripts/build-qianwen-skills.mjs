#!/usr/bin/env node
/**
 * Build the skill packages for the QianWen AI Platform skill market.
 *
 * Why this exists: that market takes **one ZIP per skill**, requires `SKILL.md` at the ZIP
 * root, caps a package at 10 MiB, and only allows MIT or Apache-2.0. Our CloudBase skills are
 * a tree of 31 skills that cross-reference each other through relative paths
 * (`../auth-tool-cloudbase/SKILL.md`), which would dangle inside a single-skill ZIP.
 *
 * So every package is built one of two ways, both declared in
 * `connectors/cloudbase/qianwen/manifest.json`:
 *
 *   - `authored` — a self-contained entry skill written for this market. No rewrites.
 *   - `skill`    — an existing skill from `connectors/cloudbase/skills/references/**`, with
 *                  sibling references rewritten into CloudBase MCP knowledge-base lookups
 *                  (`searchKnowledgeBase`), so the package stands on its own.
 *
 * Nothing is published here: the script emits zips plus a build report carrying the exact
 * metadata the publish form asks for (name / summary / version / license). Upload is manual.
 *
 * Usage:
 *   node scripts/build-qianwen-skills.mjs            # build every package
 *   node scripts/build-qianwen-skills.mjs cloudbase  # build one (repeatable)
 *   node scripts/build-qianwen-skills.mjs --check    # validate only, no zip
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = "connectors/cloudbase/qianwen/manifest.json";

/** Platform limits, straight from the publish docs. */
const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const MAX_NAME_CHARS = 30;
const MAX_SUMMARY_CHARS = 200;
const ALLOWED_LICENSES = ["MIT", "Apache-2.0"];

/**
 * The aggregated skills open with a "Sibling skills (local only)" section that tells the
 * reader to follow relative paths. Inside a single-skill ZIP those paths do not exist, so the
 * section is replaced with the lookup that does work.
 */
const SIBLING_SECTION =
  /^## Sibling skills \(local only\)\r?\n[\s\S]*?(?=^## )/m;

const SIBLING_REPLACEMENT = `## Where the sibling material lives

Sibling CloudBase skills are **not** shipped inside this package. Wherever the text below names
another skill, read that skill through CloudBase MCP's knowledge base instead of looking for a
local file:

\`\`\`
searchKnowledgeBase({ mode: "skill", skillName: "<skill name>" })
\`\`\`

\`mode: "docs"\` searches the public documentation, \`mode: "openapi"\` returns an API's parameters.
If CloudBase MCP is not connected yet, the skill's setup section explains how to add it.

`;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
}

function readManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_PATH), "utf8"));
  if (!Array.isArray(manifest.skills) || manifest.skills.length === 0) {
    throw new Error(`${MANIFEST_PATH}: "skills" must be a non-empty array`);
  }
  return manifest;
}

function frontmatterOf(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) return null;
  const block = match[1];
  const pick = (key) => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(block);
    if (!line) return null;
    return line[1].trim().replace(/^"(.*)"$/s, "$1");
  };
  return { name: pick("name"), description: pick("description"), license: pick("license") };
}

function copyTree(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: true });
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

/**
 * Set the frontmatter `name` to the manifest slug.
 *
 * The market treats `name` as the skill id and caps it at 30 characters — several of our upstream
 * skills are longer (`postgresql-development-cloudbase`, 31), and the upload pre-check reports the
 * whole frontmatter as invalid rather than naming the length. The manifest slug is the source of
 * truth here; upstream keeps its own name.
 */
function applySlug(dir, slug) {
  const file = path.join(dir, "SKILL.md");
  const text = fs.readFileSync(file, "utf8");
  const next = text.replace(/^name:\s*.+$/m, `name: ${slug}`);
  if (next !== text) fs.writeFileSync(file, next);
  return next !== text;
}

/** Rewrite sibling references so a single-skill ZIP has no dangling paths. */
function rewriteSiblingReferences(dir) {
  const touched = [];
  for (const rel of listFiles(dir)) {
    if (!rel.endsWith(".md")) continue;
    const file = path.join(dir, rel);
    const original = fs.readFileSync(file, "utf8");
    let next = original.replace(SIBLING_SECTION, SIBLING_REPLACEMENT);

    // ../<skill>/SKILL.md  →  a knowledge-base lookup
    next = next.replace(
      /\.\.\/([a-z0-9][a-z0-9-]*)\/SKILL\.md/g,
      (_m, skill) => `searchKnowledgeBase({ mode: "skill", skillName: "${skill}" })`,
    );
    // ../../<skill>/references/<file> and ../<skill>/references/<file>
    //   →  the same lookup, file name kept in prose
    next = next.replace(
      /\.\.\/(?:\.\.\/)?([a-z0-9][a-z0-9-]*)\/references\/([A-Za-z0-9._/-]+)/g,
      (_m, skill, file) =>
        `searchKnowledgeBase({ mode: "skill", skillName: "${skill}" }) (${file})`,
    );
    // The source usually already wraps the path in backticks; collapse the resulting doubles.
    next = next.replace(/``+/g, "`");

    if (next !== original) {
      fs.writeFileSync(file, next);
      touched.push(rel);
    }
  }
  return touched;
}

/** Directory names of every sibling skill, used to tell a real relative path from prose dots. */
function siblingSkillNames() {
  const dir = path.join(ROOT, "connectors/cloudbase/skills/references");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function validate({ entry, dir, license, siblings }) {
  const problems = [];

  const skillMd = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    problems.push("SKILL.md is not at the package root");
    return problems;
  }

  const fm = frontmatterOf(fs.readFileSync(skillMd, "utf8"));
  if (!fm) problems.push("SKILL.md has no YAML frontmatter (--- block)");
  else {
    if (!fm.name) problems.push("frontmatter is missing `name`");
    if (!fm.description) problems.push("frontmatter is missing `description`");
    if (fm.name && fm.name !== entry.slug) {
      problems.push(`frontmatter name "${fm.name}" != slug "${entry.slug}"`);
    }
    if (entry.slug.length > MAX_NAME_CHARS) {
      problems.push(
        `slug "${entry.slug}" is ${entry.slug.length} chars, over the ${MAX_NAME_CHARS}-char cap the market enforces on \`name\``,
      );
    }
  }

  if (!entry.name || entry.name.length > MAX_NAME_CHARS) {
    problems.push(`name must be 1-${MAX_NAME_CHARS} chars (got ${entry.name?.length ?? 0})`);
  }
  if (!entry.summary || entry.summary.length > MAX_SUMMARY_CHARS) {
    problems.push(
      `summary must be 1-${MAX_SUMMARY_CHARS} chars (got ${entry.summary?.length ?? 0}) — the publish form rejects longer text`,
    );
  }
  if (!ALLOWED_LICENSES.includes(license)) {
    problems.push(`license must be one of ${ALLOWED_LICENSES.join(" / ")} (got ${license})`);
  }

  const dangling = listFiles(dir).filter((rel) => rel.endsWith(".md"));
  for (const rel of dangling) {
    const text = fs.readFileSync(path.join(dir, rel), "utf8");
    // Only a path that names a real sibling skill counts; prose dots like ".../v1/..." do not.
    const leftover = siblings.find((name) => new RegExp(`\\.\\.\\/(?:\\.\\.\\/)?${name}\\/`).test(text));
    if (leftover) {
      problems.push(`${rel} still references the sibling skill "${leftover}" by relative path`);
    }
  }

  const bytes = listFiles(dir).reduce((sum, rel) => sum + fs.statSync(path.join(dir, rel)).size, 0);
  if (bytes > MAX_PACKAGE_BYTES) {
    problems.push(`package is ${(bytes / 1024 / 1024).toFixed(1)} MB, over the 10 MiB cap`);
  }

  return problems;
}

function zip(dir, outFile) {
  if (fs.existsSync(outFile)) fs.rmSync(outFile);
  // SKILL.md goes in first: the market's pre-check reads the leading entry, and a package whose
  // first file is LICENSE.md is rejected as "SKILL.md has no valid frontmatter".
  const files = listFiles(dir).sort((a, b) => {
    if (a === "SKILL.md") return -1;
    if (b === "SKILL.md") return 1;
    return a.localeCompare(b);
  });
  // -X: no extra file attributes; -D: no directory entries (SKILL.md must sit at the root).
  execFileSync("zip", ["-X", "-D", "-q", outFile, ...files], { cwd: dir });
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const wanted = args.filter((a) => !a.startsWith("--"));

  const manifest = readManifest();
  const license = manifest.license ?? "MIT";
  const distDir = path.join(ROOT, manifest.dist ?? "dist/qianwen-skills");
  const selected = wanted.length
    ? manifest.skills.filter((s) => wanted.includes(s.slug))
    : manifest.skills;

  if (wanted.length && selected.length !== wanted.length) {
    const known = manifest.skills.map((s) => s.slug);
    fail(`unknown skill slug(s): ${wanted.filter((w) => !known.includes(w)).join(", ")}`);
    return;
  }

  const seen = new Set();
  for (const entry of selected) {
    if (seen.has(entry.slug)) fail(`duplicate slug in manifest: ${entry.slug}`);
    seen.add(entry.slug);
  }

  const SIBLING_NAMES = siblingSkillNames();
  if (!checkOnly) fs.mkdirSync(distDir, { recursive: true });
  const report = [];

  for (const entry of selected) {
    const sourcePath = path.join(ROOT, entry.source?.path ?? "");
    if (!entry.source?.path || !fs.existsSync(sourcePath)) {
      fail(`${entry.slug}: source path not found (${entry.source?.path})`);
      continue;
    }

    const stage = fs.mkdtempSync(path.join(ROOT, `.qianwen-${entry.slug}-`));
    try {
      copyTree(sourcePath, stage);
      const renamed = applySlug(stage, entry.slug);
      const rewritten =
        entry.source.type === "skill" ? rewriteSiblingReferences(stage) : [];

      const problems = validate({ entry, dir: stage, license, siblings: SIBLING_NAMES });
      if (problems.length) {
        problems.forEach((p) => fail(`${entry.slug}: ${p}`));
        continue;
      }

      const files = listFiles(stage).length;
      let bytes = 0;
      let sha256 = null;
      let zipName = null;

      if (!checkOnly) {
        zipName = `${entry.slug}.zip`;
        const zipPath = path.join(distDir, zipName);
        zip(stage, zipPath);
        const buf = fs.readFileSync(zipPath);
        bytes = buf.length;
        sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      }

      report.push({
        slug: entry.slug,
        name: entry.name,
        version: entry.version,
        summaryChars: entry.summary.length,
        license,
        source: entry.source.type,
        files,
        renamed,
        rewritten,
        zip: zipName,
        bytes,
        sha256,
      });

      const sizeText = bytes ? `${(bytes / 1024).toFixed(1)} KB` : "check only";
      const rw = rewritten.length ? `, rewrote ${rewritten.length} file(s)` : "";
      console.log(`✓ ${entry.slug}  ${files} file(s), ${sizeText}${rw}`);
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }

  if (!checkOnly && report.length) {
    const reportPath = path.join(distDir, "build-report.json");
    const icon = manifest.icon ? path.join(ROOT, manifest.icon) : null;
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          platform: manifest.platform,
          builtAt: new Date().toISOString(),
          license,
          icon: icon && fs.existsSync(icon) ? path.relative(ROOT, icon) : null,
          packages: report,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`\n→ ${path.relative(ROOT, reportPath)}`);
    if (icon && fs.existsSync(icon)) {
      console.log(`→ upload the icon from ${path.relative(ROOT, icon)}`);
    }
  }

  if (process.exitCode) console.error("\nOne or more packages failed validation.");
}

main();
