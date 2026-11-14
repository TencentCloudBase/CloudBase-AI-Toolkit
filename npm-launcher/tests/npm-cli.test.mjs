#!/usr/bin/env node
"use strict";

// npmCli() decides how the launcher invokes npm: it prefers npm_execpath, then
// looks beside the running Node, then returns null so npm() falls back to the
// `npm` command on PATH. It also rejects an npm that is present but incomplete
// (no lib/commands/install.js) — a bundled npm shim that can answer `npm view`
// but cannot install. These checks run on a stubbed existsSync, so they hold on
// any machine regardless of how its bundled Node lays out npm.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { npmCli } = require("../index.js");

const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// Build every fixture path with path.join so the separators match what
// npmCli() computes on this platform (win32 uses backslashes).
const base = path.join(os.tmpdir(), "nge-contract");
const realExistsSync = fs.existsSync;
const savedExecPath = process.env.npm_execpath;
const dir = path.dirname(process.execPath);
const besideNode = path.join(dir, "node_modules/npm/bin/npm-cli.js");
const besidePrefix = path.join(dir, "../lib/node_modules/npm/bin/npm-cli.js");

// The completeness marker lives at <npmRoot>/lib/commands/install.js,
// where npmRoot is two levels above bin/npm-cli.js.
function marker(cli) {
  return path.join(path.dirname(path.dirname(cli)), "lib/commands/install.js");
}

// Run npmCli() with exactly the given set of existing paths. `complete` adds
// the completeness marker for each npm-cli.js candidate; pass false to model
// a half-present npm.
function withPaths(existing, npmExecPath, complete = true) {
  if (npmExecPath === undefined) delete process.env.npm_execpath;
  else process.env.npm_execpath = npmExecPath;
  const allow = new Set(existing);
  if (complete) {
    for (const p of existing) {
      if (/npm-cli\.js$/.test(p)) allow.add(marker(p));
    }
  }
  fs.existsSync = (p) => allow.has(p);
  try {
    return npmCli();
  } finally {
    fs.existsSync = realExistsSync;
  }
}

try {
  const sibling = path.join(base, "npm-cli.js");
  const npxPath = path.join(base, "npx-cli.js");
  const unrelated = path.join(base, "not-npm.js");

  check(
    withPaths([sibling], npxPath) === sibling,
    "npm_execpath ending in npx-cli.js resolves to its sibling npm-cli.js",
  );

  check(
    withPaths([sibling], sibling) === sibling,
    "npm_execpath pointing at npm-cli.js is used as-is",
  );

  check(
    withPaths([besideNode], unrelated) === besideNode,
    "a non-npm-cli.js npm_execpath is rejected; the Node-relative candidate wins",
  );

  check(
    withPaths([besidePrefix], undefined) === besidePrefix,
    "without npm_execpath, the lib/node_modules candidate is used",
  );

  check(
    withPaths([besideNode, besidePrefix], undefined) === besideNode,
    "candidate order is stable: Node-relative path precedes the lib/ path",
  );

  check(
    withPaths([], undefined) === null,
    "returns null when no candidate exists (npm() then spawns npm on PATH)",
  );

  // Completeness checks — the direct fix for the install/failed:other cluster.
  check(
    withPaths([sibling], sibling, false) === null,
    "npm-cli.js without lib/commands/install.js is rejected (half-present npm)",
  );

  check(
    withPaths([sibling, besideNode, marker(besideNode)], sibling, false) === besideNode,
    "an incomplete first candidate falls through to a complete one",
  );

  check(
    withPaths([besideNode, besidePrefix], undefined, false) === null,
    "all candidates incomplete returns null instead of picking a broken npm",
  );

  check(
    marker(sibling) !== sibling && /lib/.test(marker(sibling)),
    "completeness marker is derived from the npm root, not the bin directory",
  );

  check(
    fs.existsSync === realExistsSync,
    "existsSync is restored after each check",
  );
} finally {
  fs.existsSync = realExistsSync;
  if (savedExecPath === undefined) delete process.env.npm_execpath;
  else process.env.npm_execpath = savedExecPath;
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) process.exit(1);
