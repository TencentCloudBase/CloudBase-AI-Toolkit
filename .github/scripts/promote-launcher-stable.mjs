#!/usr/bin/env node
"use strict";

// Validate a candidate before the `stable` dist-tag of @cloudbase/npm-launcher
// is moved. This script never moves the tag: the workflow runs `npm dist-tag`
// with a token, and this file only decides whether that is safe.
//
//   node .github/scripts/promote-launcher-stable.mjs 1.3.0 --dry-run
//
// The checks mirror the launcher's own selfUpdate() guard rails, so a tag this
// script accepts is one that devices will actually adopt.

import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PKG = "@cloudbase/npm-launcher";
const MIN_AGE_MS = 72 * 3600 * 1000; // NGE_SELF_MIN_AGE
const version = process.argv[2] || process.env.VERSION || "";
const dryRun = process.argv.includes("--dry-run");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { accept: "application/json" }, timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`registry returned HTTP ${res.statusCode}`));
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (err) { reject(new Error(`invalid registry response: ${err.message}`)); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("registry request timed out")));
    req.on("error", reject);
  });
}

async function main() {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`version must be an exact x.y.z release, got ${JSON.stringify(version)}`);
  }

  const pkgJsonPath = path.join(__dirname, "..", "..", "npm-launcher", "package.json");
  const source = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  const sourceMajor = String(source.version).split(".")[0];
  if (version.split(".")[0] !== sourceMajor) {
    fail(`${version} is not in major ${sourceMajor}; the launcher only adopts same-major releases (source version ${source.version})`);
  }

  const meta = await getJson(`https://registry.npmjs.org/${PKG}`);
  const release = meta.versions && meta.versions[version];
  if (!release) fail(`${PKG}@${version} is not published`);

  const published = Date.parse((meta.time && meta.time[version]) || "");
  if (!Number.isFinite(published)) fail(`no publish time recorded for ${version}`);
  const age = Date.now() - published;
  if (age < MIN_AGE_MS) {
    const hours = Math.ceil((MIN_AGE_MS - age) / 3600e3);
    fail(`${version} is only ${Math.round(age / 3600e3)}h old; devices ignore releases younger than 72h (wait ${hours}h)`);
  }

  const current = (meta["dist-tags"] || {}).stable || "(not set)";
  console.log(`${PKG} stable: ${current} -> ${version}`);
  console.log(`published ${new Date(published).toISOString()}, age ${Math.round(age / 3600e3)}h, major ${sourceMajor}`);
  console.log(dryRun
    ? `dry run: would run \`npm dist-tag add ${PKG}@${version} stable\``
    : `validated: \`npm dist-tag add ${PKG}@${version} stable\``);
}

main().catch((err) => fail(err.message));
