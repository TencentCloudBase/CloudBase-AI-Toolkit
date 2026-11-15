#!/usr/bin/env node
"use strict";

// The launcher's direct installer only works because the *published* MCP
// package has no runtime dependencies: it downloads one tarball and unpacks it,
// with no dependency resolution. The installer verifies this per install and
// refuses when `dependencies` is non-empty, so a regression degrades to "npm
// required" rather than installing a broken tree -- but that degradation is
// silent, and on a machine without a usable npm it is the difference between
// starting and not starting.
//
// This guard makes the precondition visible in CI instead.
//
// Note the asymmetry: `mcp/package.json` in the repo *does* declare
// dependencies, because webpack needs them at build time. They are stripped by
// `scripts/prepare-publish.cjs` during `prepublishOnly`, which is why the
// published package is dependency-free. So the thing worth pinning is that the
// strip still happens -- checking the source manifest would fail permanently
// and checking the registry would make the test network-dependent.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREPARE = path.join(ROOT, "mcp", "scripts", "prepare-publish.cjs");
const MCP_PKG = path.join(ROOT, "mcp", "package.json");
const LAUNCHER = path.join(ROOT, "npm-launcher", "index.js");

const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// 1. The publish step must still clear dependencies.
const prepare = fs.readFileSync(PREPARE, "utf8");
check(/dependencies\s*=\s*\{\s*\}|delete\s+\w+\.dependencies|dependencies['"]?\]\s*=\s*\{\s*\}/.test(prepare),
  "prepare-publish.cjs still clears dependencies before packing",
  /dependencies/.test(prepare) ? "" : "no mention of dependencies at all");

// 2. prepublishOnly must still run it, or the strip never happens.
const pkg = JSON.parse(fs.readFileSync(MCP_PKG, "utf8"));
check(/prepare-publish/.test(pkg.scripts?.prepublishOnly || ""),
  "prepublishOnly still runs prepare-publish.cjs",
  pkg.scripts?.prepublishOnly || "(missing)");

// 3. Everything must still be bundled, or stripping dependencies would ship a
//    package that cannot run.
check(/webpack/.test(pkg.scripts?.["build:webpack"] || ""),
  "the build still bundles the runtime into dist/",
  pkg.scripts?.["build:webpack"] ? "" : "(missing build:webpack)");

// 4. The installer's own refusal is what keeps a regression safe rather than
//    broken, so it must stay.
const src = fs.readFileSync(LAUNCHER, "utf8");
check(/has-deps/.test(src) && /meta\.dependencies/.test(src),
  "the direct installer still refuses a package that declares dependencies");

// 5. Integrity verification is the other guard npm would otherwise provide.
check(/integrity-fail/.test(src) && /no-integrity/.test(src),
  "the direct installer still verifies the tarball checksum");

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) {
  console.log("\nIf the published package now needs runtime dependencies, the launcher's\n"
    + "direct installer no longer applies to it: cold start would again require a\n"
    + "working npm. Either keep the published bundle dependency-free, or teach the\n"
    + "installer to resolve a dependency tree and update npm-launcher/AGENTS.md.");
  process.exit(1);
}
