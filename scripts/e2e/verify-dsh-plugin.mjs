#!/usr/bin/env node
/**
 * Static + unit-test gate for @cloudbase/dsh-plugin.
 * Run from repo root: node scripts/e2e/verify-dsh-plugin.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const plugin = join(repo, "dsh-plugin");
const failures = [];

function fail(message) {
  failures.push(message);
  console.error("FAIL:", message);
}

function pass(message) {
  console.log("PASS:", message);
}

const pkg = JSON.parse(readFileSync(join(plugin, "package.json"), "utf8"));
if (pkg.name !== "@cloudbase/dsh-plugin") fail(`unexpected package name ${pkg.name}`);
else pass("package name @cloudbase/dsh-plugin");

const inject = pkg.dsh?.client?.inject ?? [];
if (!inject.includes("connection")) fail("dsh.client.inject must include connection (RPC channel)");
else pass("client inject includes connection");

if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
  fail(`runtime dependencies must be empty: ${JSON.stringify(pkg.dependencies)}`);
} else {
  pass("zero runtime dependencies");
}

const patch = readFileSync(join(plugin, "cordis.patch.yml"), "utf8");
if (patch.includes("CLOUDBASE_API_KEY")) fail("cordis.patch.yml must not pass CLOUDBASE_API_KEY");
else pass("patch does not pass CLOUDBASE_API_KEY");
if (patch.includes("CLOUDBASE_ENV_ID") || /!!js.*process\.env/.test(patch)) {
  fail("patch must not forward env or !!js process.env — login via cloudbase-mcp device-code");
} else {
  pass("patch forwards no env (device-code login; !!js path resolve allowed)");
}

const clientDir = join(plugin, "src/client");
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(path);
  }
  return acc;
}
// Ban rollback *UI* copy/controls; allow RPC bridge method names (rollbackDeployment).
const rollbackHits = walk(clientDir).filter((path) => {
  if (path.endsWith("toolview-routing.ts") || path.endsWith("typert.ts")) return false;
  const text = readFileSync(path, "utf8");
  const stripped = text.replace(/rollbackDeployment/g, "").replace(/rollbackMigration/g, "");
  return /rollback/i.test(stripped);
});
if (rollbackHits.length > 0) fail(`rollback mentioned in UI source: ${rollbackHits.join(", ")}`);
else pass("no rollback control in client UI");

const termMap = readFileSync(join(plugin, "src/server/term-map.ts"), "utf8");
const termPairs = [
  ["FLEXDB", "文档型数据库"],
  ["SCF", "云函数"],
  ["TDSQL", "数据库"],
];
const missingTerms = termPairs.filter(([, label]) => !termMap.includes(label));
if (missingTerms.length > 0) fail(`term-map missing ${missingTerms.map((pair) => pair.join("→")).join(", ")}`);
else pass("term-map product names present");

const skills = join(plugin, "skills/cloudbase");
const requiredSkills = ["sites", "web-development", "postgresql", "cloud-functions", "auth-web", "cloud-storage"];
const missingSkills = requiredSkills.filter((name) => !existsSync(join(skills, name, "SKILL.md")));
if (missingSkills.length > 0) fail(`missing bundled skill ${missingSkills.join(", ")}`);
else pass("bundled skills present");

execFileSync("npm", ["run", "typecheck"], { cwd: plugin, stdio: "inherit" });
execFileSync("npm", ["test"], { cwd: plugin, stdio: "inherit" });
execFileSync("npm", ["run", "build"], { cwd: plugin, stdio: "inherit" });

const clientJs = readFileSync(join(plugin, "dist/client.js"), "utf8");
if (!clientJs.includes("__ModuleLoader__")) fail("client bundle missing ModuleLoader factory");
else pass("client bundle is a ModuleLoader factory");
if (!existsSync(join(plugin, "dist/index.js"))) fail("missing dist/index.js");
else pass("server bundle exists");
if (!existsSync(join(plugin, "dist/skill-cli.js"))) fail("missing dist/skill-cli.js");
else pass("skill-cli bundle exists");

if (failures.length > 0) {
  console.error(`\nverify-dsh-plugin: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nverify-dsh-plugin: all checks passed");
