#!/usr/bin/env node
/**
 * Library entry parity: minified vs unminified.
 *
 * dist/index.cjs and dist/index.js are imported by code (enterprise wrappers
 * built from the public "enterprise MCP wrapper" recipe, hosted services), so
 * minifying them must not change anything an importer can observe. This script
 * builds an unminified reference copy (MCP_LIB_MINIFY=0) next to the normal
 * build and compares:
 *
 *   1. the export surface of the CJS and ESM entries (names + typeof)
 *   2. the recipe skeleton: createCloudBaseMcpServer -> InMemoryTransport ->
 *      client.listTools(); the full tool list JSON must be identical
 *   3. one tool call that needs no credentials and no network
 *   4. the .d.ts / .d.cts files, byte for byte
 *
 * Usage:
 *   node ./scripts/verify-lib-minify-parity.mjs            # builds both copies
 *   PARITY_REUSE_DIST=1 node ./scripts/verify-lib-minify-parity.mjs
 *       # reuse the current dist/ as the minified side (CI already built it)
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, "..");
const distDir = path.join(pkgDir, "dist");
const requireFromPkg = createRequire(path.join(pkgDir, "package.json"));

let failures = 0;
function check(ok, label, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` - ${detail}` : ""}`);
}

function build(env) {
  execFileSync("pnpm", ["run", "build:webpack"], {
    cwd: pkgDir,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, ...env },
  });
}

function copyDist(to) {
  cpSync(distDir, to, { recursive: true });
  return to;
}

function esmExportNames(file) {
  const src = readFileSync(file, "utf8");
  const clauses = [...src.matchAll(/export\s*\{([^}]*)\}/g)];
  if (!clauses.length) return [];
  return clauses[clauses.length - 1][1]
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.split(/\s+as\s+/).pop())
    .sort();
}

function surface(mod) {
  return Object.keys(mod)
    .sort()
    .map((k) => `${k}:${typeof mod[k]}`);
}

async function recipeRun(dir) {
  // Same shape as the public recipe: CJS entry, in-process server, in-memory
  // transport, a plain SDK client on the other end.
  const req = createRequire(path.join(dir, "index.cjs"));
  const { createCloudBaseMcpServer } = req(path.join(dir, "index.cjs"));
  const { Client } = requireFromPkg("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = requireFromPkg("@modelcontextprotocol/sdk/inMemory.js");

  const server = await createCloudBaseMcpServer({
    name: "cloudbase-mcp",
    cloudMode: false,
    enableTelemetry: false,
    cloudBaseOptions: { envId: "parity-env", secretId: "parity-id", secretKey: "parity-key" },
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "parity", version: "1.0.0" }, { capabilities: {} });
  await client.connect(ct);

  const { tools } = await client.listTools();
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  // Reads the bundled skill index only: no credentials, no network.
  const call = await client.callTool({ name: "searchKnowledgeBase", arguments: { mode: "skill" } });
  const caps = client.getServerCapabilities();
  await client.close();
  return { tools: JSON.stringify(sorted), toolCount: tools.length, call: JSON.stringify(call), caps: JSON.stringify(caps) };
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return `offset ${i}: ...${a.slice(i, i + 80)}... vs ...${b.slice(i, i + 80)}...`;
  return `length ${a.length} vs ${b.length}`;
}

async function main() {
  // Inside the package, not os.tmpdir(): the ESM entry keeps every dependency
  // external, so the copies must resolve them from this package's node_modules.
  const work = mkdtempSync(path.join(pkgDir, ".parity-"));
  try {
    if (process.env.PARITY_REUSE_DIST !== "1") {
      console.log("building minified dist ...");
      build({});
    }
    check(existsSync(path.join(distDir, "index.cjs")), "dist/index.cjs exists");
    const minDir = copyDist(path.join(work, "min"));

    console.log("building unminified reference (MCP_LIB_MINIFY=0) ...");
    build({ MCP_LIB_MINIFY: "0" });
    const plainDir = copyDist(path.join(work, "plain"));
    // Leave dist/ as the minified build the caller started with.
    rmSync(distDir, { recursive: true, force: true });
    cpSync(minDir, distDir, { recursive: true });

    const minSize = readFileSync(path.join(minDir, "index.cjs")).length;
    const plainSize = readFileSync(path.join(plainDir, "index.cjs")).length;
    check(minSize < plainSize, "the minified CJS entry is actually smaller", `${plainSize} -> ${minSize}`);

    console.log("\n[1] export surface");
    const req = createRequire(import.meta.url);
    const cjsMin = surface(req(path.join(minDir, "index.cjs")));
    const cjsPlain = surface(req(path.join(plainDir, "index.cjs")));
    check(JSON.stringify(cjsMin) === JSON.stringify(cjsPlain), "CJS exports identical", `${cjsMin.length} exports`);
    // The ESM entry cannot be imported standalone even before this change (it
    // has undeclared internal dependencies; the public recipe says to use the
    // CJS entry). Compare its export names statically instead.
    const esmMin = esmExportNames(path.join(minDir, "index.js"));
    const esmPlain = esmExportNames(path.join(plainDir, "index.js"));
    check(esmPlain.length > 0, "ESM export clause found", `${esmPlain.length} exports`);
    check(JSON.stringify(esmMin) === JSON.stringify(esmPlain), "ESM export names identical");
    check(cjsMin.includes("createCloudBaseMcpServer:function"), "createCloudBaseMcpServer is exported");

    console.log("\n[2] recipe skeleton: listTools");
    const a = await recipeRun(plainDir);
    const b = await recipeRun(minDir);
    check(a.toolCount > 0, "tools are registered", `${a.toolCount}`);
    check(a.tools === b.tools, "tool list JSON identical (names, descriptions, schemas)", a.tools === b.tools ? "" : firstDiff(a.tools, b.tools));
    check(a.caps === b.caps, "server capabilities identical");

    console.log("\n[3] tool call");
    check(a.call === b.call, "searchKnowledgeBase(mode=skill) result identical", a.call === b.call ? "" : firstDiff(a.call, b.call));
    check(!JSON.parse(b.call).isError, "the call succeeds");

    console.log("\n[4] type declarations");
    for (const f of readdirSync(plainDir).filter((x) => /\.d\.c?ts$/.test(x))) {
      const same = existsSync(path.join(minDir, f))
        && readFileSync(path.join(minDir, f)).equals(readFileSync(path.join(plainDir, f)));
      check(same, `${f} byte-identical`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall parity checks passed");
  // The servers keep timers alive; parity is decided, so exit explicitly.
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
