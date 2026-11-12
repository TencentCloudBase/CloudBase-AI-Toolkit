#!/usr/bin/env node
"use strict";

// npmCli() decides how the launcher invokes npm: it prefers npm_execpath, then
// looks beside the running Node, then returns null so npm() falls back to the
// `npm` command on PATH. These checks pin that contract. They run entirely on
// a stubbed existsSync, so they hold on any machine regardless of how its
// bundled Node lays out npm — which is exactly the layout a client update can
// change. No product behaviour is changed to make these pass.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { npmCli } = require("../index.js");

const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const realExistsSync = fs.existsSync;
const savedExecPath = process.env.npm_execpath;
const dir = path.dirname(process.execPath);
const besideNode = path.join(dir, "node_modules/npm/bin/npm-cli.js");
const besidePrefix = path.join(dir, "../lib/node_modules/npm/bin/npm-cli.js");

// Run npmCli() with exactly the given set of existing paths.
function withPaths(existing, npmExecPath) {
  if (npmExecPath === undefined) delete process.env.npm_execpath;
  else process.env.npm_execpath = npmExecPath;
  const allow = new Set(existing);
  fs.existsSync = (p) => allow.has(p);
  try {
    return npmCli();
  } finally {
    fs.existsSync = realExistsSync;
  }
}

try {
  const sibling = "/tmp/nge-contract/npm-cli.js";
  const npxPath = "/tmp/nge-contract/npx-cli.js";

  check(
    withPaths([sibling], npxPath) === sibling,
    "npm_execpath ending in npx-cli.js resolves to its sibling npm-cli.js",
  );

  check(
    withPaths([sibling], sibling) === sibling,
    "npm_execpath pointing at npm-cli.js is used as-is",
  );

  check(
    withPaths([besideNode], "/tmp/nge-contract/not-npm.js") === besideNode,
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
