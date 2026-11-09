#!/usr/bin/env node
/**
 * Re-runnable host acceptance for @cloudbase/dsh-plugin.
 *
 * Everything runs against a real DSH install in a throwaway DSH_HOME:
 *   - pack the plugin, install it, read the composed config, list MCP tools, uninstall it
 *   - install a deliberately incompatible variant and check the user's profile survives
 *   - put the compatible package back and check the plugin comes back
 *
 * No CloudBase login, API key, network or GUI required when MCP_CLI points at a
 * locally built cloudbase-mcp entrypoint.
 *
 * Usage:
 *   DSH_BIN=/path/to/node_modules/.bin/dsh node dsh-plugin/scripts/verify-host.mjs
 *
 * Optional:
 *   MCP_CLI       path to cloudbase-mcp cli.cjs; when absent the tool-list step is skipped
 *   KEEP=1        keep the temporary directory and print its path
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` — ${detail}` : ""}`);
}

function which(bin) {
  const found = spawnSync("which", [bin], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.trim() : undefined;
}

const dshBin = process.env.DSH_BIN || which("dsh");
if (!dshBin || !existsSync(dshBin)) {
  console.error("DSH_BIN is required: point it at a real node_modules/.bin/dsh");
  process.exit(1);
}

const realBin = realpathSync(dshBin);
const nodeModules = resolve(dirname(realBin), "../../..");
const appBoot = join(nodeModules, "@deepseek-ai/dsh-app-boot/lib/index.js");
if (!existsSync(appBoot)) {
  console.error(`cannot locate @deepseek-ai/dsh-app-boot under ${nodeModules}`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "dsh-host-verify-"));
const home = join(work, "home");
const packs = join(work, "packs");
mkdirSync(packs, { recursive: true });

const baseEnv = {
  ...process.env,
  DSH_HOME: home,
  ...(process.env.MCP_CLI
    ? { CLOUDBASE_MCP_COMMAND: process.execPath, CLOUDBASE_MCP_ARGS: process.env.MCP_CLI }
    : {}),
};
delete baseEnv.CLOUDBASE_API_KEY;

function dsh(args, profileEnv = {}) {
  return execFileSync(dshBin, args, {
    env: { ...baseEnv, ...profileEnv },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function profileManifest(profile) {
  return JSON.parse(readFileSync(join(home, "profiles", profile, "package.json"), "utf8"));
}

function bundlesOf(profile) {
  return profileManifest(profile).dsh?.profile?.bundles ?? [];
}

async function mcpTools(mcpCli) {
  const child = spawn(process.execPath, [mcpCli], { stdio: ["pipe", "pipe", "ignore"] });
  const frames = [];
  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) {
        try { frames.push(JSON.parse(line)); } catch { /* ignore log lines */ }
      }
    }
  });
  const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "dsh-host-verify", version: "1.0.0" } } });
  return await new Promise((done) => {
    let listSent = false;
    const poll = setInterval(() => {
      if (!listSent && frames.some((f) => f.id === 1 && f.result)) {
        listSent = true;
        send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
        send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      }
      const list = frames.find((f) => f.id === 2);
      if (list) {
        clearInterval(poll);
        child.kill("SIGTERM");
        done(list.result?.tools?.map((t) => t.name) ?? []);
      }
    }, 50);
    setTimeout(() => {
      clearInterval(poll);
      child.kill("SIGTERM");
      done([]);
    }, 20000).unref();
  });
}

let tarball;
let incompatibleSpec;

try {
  const packed = execFileSync("npm", ["pack", "--pack-destination", packs], {
    cwd: pkgRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim().split("\n").pop();
  tarball = join(packs, packed);
  check("pack plugin without publishing", existsSync(tarball), packed);

  const packaged = JSON.parse(
    execFileSync("tar", ["-xzOf", tarball, "package/package.json"], { encoding: "utf8" }),
  );
  check("published manifest declares engines.dsh", typeof packaged.engines?.dsh === "string", packaged.engines?.dsh);

  // 1. Install the compatible package into a clean profile.
  dsh(["plugin", "--profile", "accept", "add", tarball]);
  check("install adds the bundle", bundlesOf("accept").includes("@cloudbase/dsh-plugin"));

  const dump = dsh(["--profile", "accept", "--dump-config"]);
  check("composed config carries the plugin layer", dump.includes("# == @cloudbase/dsh-plugin"));
  check("composed config carries the MCP bridge", dump.includes("id: mcp-cloudbase"));

  // 2. The host itself decides compatibility, with prereleases included.
  const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import(pathToFileURL(appBoot).href);
  const runtime = getDshRuntimeVersion();
  const manifest = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
  check("host accepts this package on the running DSH", evaluatePluginCompatibility(manifest, {}, runtime) === undefined, runtime);
  check("host rejects the package on an out-of-range DSH", evaluatePluginCompatibility(manifest, {}, "0.3.0")?.requirements?.["engines.dsh"] === manifest.engines.dsh);

  // 3. MCP tools really come back, without any CloudBase credentials.
  if (process.env.MCP_CLI && existsSync(process.env.MCP_CLI)) {
    const tools = await mcpTools(process.env.MCP_CLI);
    check("MCP tools/list returns tools", tools.length > 0, `${tools.length} tools`);
    check("MCP tools/list includes auth", tools.includes("auth"));
  } else {
    console.log("SKIP: MCP tools/list — set MCP_CLI to a local cloudbase-mcp entrypoint");
  }

  // 4. Uninstall leaves the host profile intact.
  dsh(["plugin", "--profile", "accept", "remove", "@cloudbase/dsh-plugin"]);
  check("uninstall removes only the plugin bundle", JSON.stringify(bundlesOf("accept")) === JSON.stringify(["@deepseek-ai/dsh-base"]));

  // 5. Upgrade scenario: a package that no longer matches the host.
  const staging = join(work, "incompatible");
  mkdirSync(staging, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", staging, "--strip-components=1"], { stdio: "ignore" });
  const stagedManifest = join(staging, "package.json");
  const staged = JSON.parse(readFileSync(stagedManifest, "utf8"));
  staged.engines.dsh = ">=0.3.0 <0.4.0";
  writeFileSync(stagedManifest, `${JSON.stringify(staged, null, 2)}\n`);
  incompatibleSpec = staging;

  // 5. The host refuses an incompatible package at install time.
  let refused = false;
  let refusalText = "";
  try {
    dsh(["plugin", "--profile", "blocked", "add", incompatibleSpec]);
  } catch (error) {
    refused = true;
    refusalText = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  check("host refuses to install an incompatible package", refused && /incompatible|rejected/i.test(refusalText));

  // 6. Runtime upgrade: an already-installed package becomes incompatible.
  dsh(["plugin", "--profile", "upgrade", "add", tarball]);
  const upgradeProfile = join(home, "profiles", "upgrade");
  const installedManifest = join(upgradeProfile, "node_modules", "@cloudbase/dsh-plugin", "package.json");
  check("installed package manifest is readable", existsSync(installedManifest));

  const userPatch = join(upgradeProfile, "cordis.patch.yml");
  if (!existsSync(userPatch)) writeFileSync(userPatch, "# user profile patch\n");
  writeFileSync(userPatch, `${readFileSync(userPatch, "utf8")}\n# user-kept-setting: preserve across host upgrades\n`);
  const before = {
    patch: readFileSync(userPatch, "utf8"),
    manifest: readFileSync(join(upgradeProfile, "package.json"), "utf8"),
  };

  const installed = JSON.parse(readFileSync(installedManifest, "utf8"));
  const originalRange = installed.engines.dsh;
  installed.engines.dsh = ">=0.3.0 <0.4.0";
  writeFileSync(installedManifest, `${JSON.stringify(installed, null, 2)}\n`);

  const upgradeDump = dsh(["--profile", "upgrade", "--dump-config"]);
  check("host still boots with an incompatible installed bundle", upgradeDump.length > 0);
  check("incompatible bundle contributes no plugin rows", !upgradeDump.includes("id: cloudbase-dsh-plugin"));
  check("user patch survives the incompatibility", readFileSync(userPatch, "utf8") === before.patch);
  check("installed bundle list survives the incompatibility", readFileSync(join(upgradeProfile, "package.json"), "utf8") === before.manifest);

  // 7. Put the compatible declaration back; the user's own patch must still be there.
  installed.engines.dsh = originalRange;
  writeFileSync(installedManifest, `${JSON.stringify(installed, null, 2)}\n`);
  const recovered = dsh(["--profile", "upgrade", "--dump-config"]);
  check("plugin comes back once the declaration is compatible", recovered.includes("id: cloudbase-dsh-plugin"));
  check("user patch survives the recovery", readFileSync(userPatch, "utf8") === before.patch);
} catch (error) {
  check("acceptance run completed without an exception", false, error?.message ?? String(error));
} finally {
  if (process.env.KEEP === "1") console.log(`kept: ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\nverify-host: ${failed.length === 0 ? "all checks passed" : `${failed.length} failure(s)`}`);
process.exit(failed.length === 0 ? 0 : 1);
