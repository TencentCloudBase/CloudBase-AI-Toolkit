#!/usr/bin/env node
/**
 * Pack WorkBuddy expert packages (plugins/experts/*) into release zips.
 *
 * One zip per expert: dist/<expert-name>.zip. Naming is version-free —
 * the release tag carries the version, so zip-urls stay stable across
 * releases (same convention as cloudbase-kimi.zip / cloudbase-qoder.zip).
 *
 * Zip layout mirrors the official expert-manager packager
 * (package_expert.py): the archive top level is the expert directory
 * itself (<expert-name>/...), so unzipping yields the package directory
 * that validate_expert.py / register_expert.py consume directly.
 *
 * Exclusions (aligned with package_expert.py): hidden files except
 * .codebuddy-plugin, node_modules, __pycache__, .DS_Store, .gitkeep.
 *
 * Usage:
 *   node scripts/pack-experts.mjs
 *   node scripts/pack-experts.mjs --out-dir /tmp/expert-zips
 *
 * Release flow (CI): .github/workflows/release-plugin-zips.yml packs these
 * zips on `release: published` and uploads them to the release assets.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXPERTS_DIR = path.join(ROOT, "plugins", "experts");
const DEFAULT_OUT_DIR = path.join(ROOT, "dist");

const JUNK_BASENAMES = new Set([".DS_Store", ".gitkeep", "Thumbs.db"]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = { outDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--out-dir") {
      args.outDir = argv[++i];
      if (!args.outDir) throw new Error("--out-dir requires a path");
    } else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function listExperts() {
  if (!fs.existsSync(EXPERTS_DIR)) {
    throw new Error(`Missing experts source dir: ${EXPERTS_DIR}`);
  }
  const experts = fs
    .readdirSync(EXPERTS_DIR)
    .filter((n) => {
      if (n.startsWith(".")) return false;
      const manifest = path.join(EXPERTS_DIR, n, ".codebuddy-plugin", "plugin.json");
      return fs.existsSync(manifest);
    })
    .sort();
  if (experts.length === 0) {
    throw new Error(`No expert packages found under ${EXPERTS_DIR}`);
  }
  return experts;
}

function packExpert(name, outDir) {
  const outPath = path.join(outDir, `${name}.zip`);
  if (fs.existsSync(outPath)) fs.rmSync(outPath);
  // cwd = plugins/experts so arcnames are naturally "<expert-name>/...".
  execFileSync(
    "zip",
    [
      "-r",
      outPath,
      name,
      "-x",
      "*/node_modules/*",
      "-x",
      "*/__pycache__/*",
      "-x",
      "*.DS_Store",
    ],
    { cwd: EXPERTS_DIR, stdio: ["ignore", "ignore", "inherit"] }
  );
  const size = fs.statSync(outPath).size;
  console.log(`Packed: ${outPath} (${(size / 1024).toFixed(1)} KB)`);
  return outPath;
}

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Pack WorkBuddy expert packages into release zips.

One zip per expert under plugins/experts/: dist/<expert-name>.zip
(version-free naming, top level = the expert directory).

Usage:
  node scripts/pack-experts.mjs
  node scripts/pack-experts.mjs --out-dir /tmp/expert-zips
`);
    return;
  }

  const experts = listExperts();
  const outDir = args.outDir || DEFAULT_OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Experts: ${experts.join(", ")}`);
  const outs = experts.map((name) => packExpert(name, outDir));

  console.log("");
  console.log(`Done: ${outs.length} expert zips in ${outDir}`);
  console.log("CI uploads them to release assets on release: published.");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
