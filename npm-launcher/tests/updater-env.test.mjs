#!/usr/bin/env node
"use strict";

// The Windows WMI path writes a temporary env file. Verify that no credential
// ever reaches it, without needing a Windows machine to run this check.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { collectUpdaterEnv, stripUserinfo } = require("../index.js");

const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

process.env.NPM_TOKEN = "npm-secret";
process.env.NPM_CONFIG__AUTH = "auth-secret";
process.env["npm_config_//registry.npmjs.org/:_authToken"] = "token-secret";
process.env.HTTPS_PROXY = "http://alice:pw@proxy.example.com:8080";
process.env.NO_PROXY = "localhost,127.0.0.1";
process.env.npm_config_cache = "/tmp/cache-xyz";
process.env.NGE_ROOT = "/tmp/root-xyz";
process.env.GITHUB_TOKEN = "gh-secret";

const vars = collectUpdaterEnv();
check(vars.NPM_TOKEN === undefined, "NPM_TOKEN is not written to the env file");
check(vars.NPM_CONFIG__AUTH === undefined, "NPM_CONFIG__AUTH is excluded");
check(vars["npm_config_//registry.npmjs.org/:_authToken"] === undefined,
  "npm registry auth token is excluded");
check(vars.GITHUB_TOKEN === undefined, "unrelated secrets stay outside the whitelist");
check(vars.HTTPS_PROXY === "http://proxy.example.com:8080",
  "proxy userinfo is stripped", String(vars.HTTPS_PROXY));
check(vars.NO_PROXY === "localhost,127.0.0.1", "NO_PROXY list is kept intact");
check(vars.npm_config_cache === "/tmp/cache-xyz", "needed npm config is kept");
check(vars.NGE_ROOT === "/tmp/root-xyz", "NGE_ROOT is kept");
check(stripUserinfo("socks5://u:p@h:1080") === "socks5://h:1080", "socks5 userinfo is stripped");
check(stripUserinfo("https://user@host/path") === "https://host/path", "user-only userinfo is stripped");
check(stripUserinfo("/tmp/plain") === "/tmp/plain", "plain paths are left alone");

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) process.exit(1);
