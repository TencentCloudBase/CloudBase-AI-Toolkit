#!/usr/bin/env node
/**
 * Post-publish smoke for @cloudbase/cloudbase-mcp.
 *
 * Automates the production regression checklist used for v2.25.7:
 * 1) download published tarball
 * 2) verify shasum against npm metadata (and optional EXPECTED_SHASUM)
 * 3) createCloudBaseMcpServer registers managePermissions / queryPermissions
 * 4) OPA fallback strings exist in dist
 * 5) dist/cli.cjs --cloud-mode stays alive (circular-dep / boot smoke)
 * 6) optional live PG queryPermissions smoke when cloud credentials are present
 *
 * Usage:
 *   node ./scripts/verify-npm-tarball-smoke.mjs [version|latest|dist-tag]
 *
 * Env:
 *   PACKAGE_NAME          default @cloudbase/cloudbase-mcp
 *   PACKAGE_VERSION       version or dist-tag (overrides argv)
 *   EXPECTED_SHASUM       optional exact sha1 of the tarball
 *   NPM_REGISTRY          default https://registry.npmjs.org
 *   SMOKE_WORKDIR         optional work directory (default mkdtemp)
 *   KEEP_SMOKE_WORKDIR    set to 1 to retain temp workdir
 *   SKIP_LIVE_SMOKE       set to 1 to skip live cloud probe
 *   CLOUDBASE_ENV_ID      env for optional live probe
 *   TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY
 *   SMOKE_PG_FUNCTION_ID  default atoPgPermProbe
 */

import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, "..");

const PACKAGE_NAME = process.env.PACKAGE_NAME || "@cloudbase/cloudbase-mcp";
const NPM_REGISTRY = (process.env.NPM_REGISTRY || "https://registry.npmjs.org").replace(/\/$/, "");
const EXPECTED_SHASUM = process.env.EXPECTED_SHASUM || "";
const SKIP_LIVE_SMOKE = process.env.SKIP_LIVE_SMOKE === "1";
const SMOKE_PG_FUNCTION_ID = process.env.SMOKE_PG_FUNCTION_ID || "atoPgPermProbe";

const OPA_STRINGS = [
  "modifyEnvAuthzConfig",
  "describeEnvAuthzConfig",
  "authz.user.rego",
];

const REQUIRED_TOOLS = ["managePermissions", "queryPermissions"];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function log(step, detail) {
  console.log(`[npm-tarball-smoke] ${step}${detail ? `: ${detail}` : ""}`);
}

function resolveRequestedVersion() {
  if (process.env.PACKAGE_VERSION) {
    return process.env.PACKAGE_VERSION;
  }
  if (process.argv[2]) {
    return process.argv[2];
  }
  try {
    const local = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
    return local.version || "latest";
  } catch {
    return "latest";
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function resolvePackageMeta(requested) {
  // 包名可能被 PACKAGE_NAME 覆盖，斜杠不止一个；registry 的 scoped 路径要求每个斜杠都编码。
  const encodedName = PACKAGE_NAME.replaceAll("/", "%2F");
  const metaUrl = `${NPM_REGISTRY}/${encodedName}/${encodeURIComponent(requested)}`;
  log("resolve", metaUrl);

  let lastError;
  // npm registry propagation after a fresh publish can take minutes; a short
  // retry window causes false post-publish-smoke failures (v2.33.2 incident).
  // 12 attempts with exponential backoff (capped 30s) ≈ 4.5 min total.
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const meta = await fetchJson(metaUrl);
      assert(meta?.version, `Registry response missing version for ${requested}`);
      assert(meta?.dist?.tarball, `Registry response missing dist.tarball for ${requested}`);
      assert(meta?.dist?.shasum, `Registry response missing dist.shasum for ${requested}`);
      return {
        version: meta.version,
        tarball: meta.dist.tarball,
        shasum: meta.dist.shasum,
        requested,
      };
    } catch (error) {
      lastError = error;
      const delayMs = Math.min(30000, 2000 * 2 ** (attempt - 1));
      log("resolve-retry", `attempt ${attempt}/12 failed (${error.message}); wait ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function downloadToFile(url, destPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download tarball: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destPath));
}

function sha1File(filePath) {
  const hash = createHash("sha1");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function extractTarball(tarballPath, extractRoot) {
  mkdirSync(extractRoot, { recursive: true });
  // Use system tar (available on macOS + Ubuntu runners); avoids adding an npm dependency.
  execFileSync("tar", ["-xzf", tarballPath, "-C", extractRoot], { stdio: "pipe" });
  const pkgRoot = path.join(extractRoot, "package");
  assert(existsSync(pkgRoot), `Extracted tarball missing package/ directory at ${extractRoot}`);
  return pkgRoot;
}

function assertOpaStrings(pkgRoot) {
  const distFiles = ["dist/index.cjs", "dist/index.js", "dist/cli.cjs"];
  const haystacks = [];
  for (const rel of distFiles) {
    const abs = path.join(pkgRoot, rel);
    if (existsSync(abs)) {
      haystacks.push({ rel, text: readFileSync(abs, "utf8") });
    }
  }
  assert(haystacks.length > 0, `No dist bundles found under ${pkgRoot}`);

  for (const needle of OPA_STRINGS) {
    const hit = haystacks.some((file) => file.text.includes(needle));
    assert(hit, `OPA fallback string missing from published dist: ${needle}`);
    log("opa-string", `found ${needle}`);
  }
}

/**
 * 发布形态的 package.json 里 dependencies 必须为空。
 *
 * mcp 把运行时依赖全部打进 dist bundle，发布前由 scripts/prepare-publish.cjs
 * 清空 dependencies；否则用户装包时会再重复安装一整套运行时依赖（含 express 之类的传递树）。
 * 那一步挂在 npm 的 prepublishOnly 钩子上，钩子没执行时包照样能发出去，所以在这里兜一道。
 */
export function assertNoRuntimeDependencies(pkgJson) {
  const declared = Object.keys(pkgJson.dependencies ?? {});
  assert(
    declared.length === 0,
    `Published package.json still declares ${declared.length} runtime ` +
      `dependenc${declared.length === 1 ? "y" : "ies"} (${declared.join(", ")}); ` +
      "prepare-publish did not run before publish",
  );
  log("dependencies", "none declared");
}

async function assertToolRegistration(pkgRoot) {
  const entryCjs = path.join(pkgRoot, "dist", "index.cjs");
  assert(existsSync(entryCjs), `Missing published entry ${entryCjs}`);

  const require = createRequire(path.join(pkgRoot, "package.json"));
  const mod = require("./dist/index.cjs");
  assert(
    typeof mod.createCloudBaseMcpServer === "function",
    "createCloudBaseMcpServer export missing from published package",
  );

  const server = await mod.createCloudBaseMcpServer({
    enableTelemetry: false,
    cloudBaseOptions: {
      envId: "smoke-env",
      secretId: "smoke-secret-id",
      secretKey: "smoke-secret-key",
    },
  });

  assert(Array.isArray(server.toolDefs), "server.toolDefs missing after createCloudBaseMcpServer");
  const toolNames = server.toolDefs.map((tool) => tool.name);
  for (const toolName of REQUIRED_TOOLS) {
    assert(toolNames.includes(toolName), `Missing expected tool registration: ${toolName}`);
    log("tool", `registered ${toolName}`);
  }

  log("tools", `total=${toolNames.length}`);
  return { toolNames };
}

async function assertCliCloudMode(pkgRoot) {
  const cliPath = path.join(pkgRoot, "dist", "cli.cjs");
  assert(existsSync(cliPath), `Missing published CLI ${cliPath}`);

  const smokeScript = path.join(packageDir, "scripts", "verify-cli-cloud-mode-smoke.mjs");
  assert(existsSync(smokeScript), `Missing local smoke script ${smokeScript}`);

  execFileSync(process.execPath, [smokeScript], {
    stdio: "inherit",
    env: {
      ...process.env,
      CLI_PATH: cliPath,
      NODE_ENV: "test",
      VITEST: "true",
    },
  });
  log("cli-cloud-mode", "passed");
}

function parseToolPayload(result) {
  const text = result?.content?.[0]?.text;
  assert(typeof text === "string" && text.length > 0, "Tool result did not contain JSON text payload");
  return JSON.parse(text);
}

/**
 * Evaluate a live queryPermissions tool envelope for post-publish smoke.
 *
 * Pure / sync so PR CI and local vitest can cover primary-path WARN and OPA
 * fallback PASS without cloud credentials.
 *
 * IMPORTANT: Do not bind the route label to a local named `path` inside
 * runLiveWithFreshServer — that shadows the node:path import and triggers TDZ
 * on earlier path.join() calls (ReferenceError in live smoke only).
 *
 * @param {object} payload Parsed tool JSON payload
 * @returns {{ routePath: "primary" | "opa-fallback", fallback: string | null, usedOpaFallback: boolean, warnPrimaryWithoutOpa: boolean, message: string }}
 */
export function evaluateLiveQueryPermissionsPayload(payload) {
  assert(
    payload?.success === true,
    `Live queryPermissions failed: ${payload?.message || JSON.stringify(payload)}`,
  );

  // OPA fallback is optional: some PG envs still route through describeEnvAuthzConfig,
  // but a healthy primary-path success must not fail the release smoke.
  // Tool envelopes nest fallback under data (see permissions.ts buildEnvelope).
  const fallbackValue = payload.data?.fallback ?? payload.fallback;
  const usedOpaFallback =
    fallbackValue === "describeEnvAuthzConfig" ||
    String(payload.message || "").includes("describeEnvAuthzConfig");
  const routePath = usedOpaFallback ? "opa-fallback" : "primary";

  return {
    routePath,
    fallback: fallbackValue || null,
    usedOpaFallback,
    warnPrimaryWithoutOpa: !usedOpaFallback,
    message: String(payload.message || ""),
  };
}

async function runLiveWithFreshServer(pkgRoot) {
  if (SKIP_LIVE_SMOKE) {
    log("live-smoke", "skipped (SKIP_LIVE_SMOKE=1)");
    return { skipped: true, reason: "SKIP_LIVE_SMOKE" };
  }

  const secretId = process.env.TENCENTCLOUD_SECRETID || process.env.TCB_SECRETID;
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY || process.env.TCB_SECRETKEY;
  const envId = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV;
  if (!secretId || !secretKey || !envId) {
    log("live-smoke", "skipped (missing TENCENTCLOUD_SECRETID/SECRETKEY or CLOUDBASE_ENV_ID)");
    return { skipped: true, reason: "missing-credentials" };
  }

  const require = createRequire(path.join(pkgRoot, "package.json"));
  const { createCloudBaseMcpServer } = require("./dist/index.cjs");
  const server = await createCloudBaseMcpServer({
    enableTelemetry: false,
    cloudBaseOptions: {
      envId,
      secretId,
      secretKey,
    },
  });

  const queryTool = server.toolDefs.find((tool) => tool.name === "queryPermissions");
  assert(queryTool, "queryPermissions tool missing for live smoke");

  const result = await queryTool.handler({
    action: "getResourcePermission",
    resourceType: "function",
    resourceId: SMOKE_PG_FUNCTION_ID,
  });
  const payload = parseToolPayload(result);
  const evaluated = evaluateLiveQueryPermissionsPayload(payload);
  // Do not name this `path` — it shadows the node:path import and triggers TDZ
  // on earlier path.join() calls in this function (live smoke ReferenceError).
  const routePath = evaluated.routePath;

  if (evaluated.warnPrimaryWithoutOpa) {
    log(
      "live-smoke",
      `WARN primary path succeeded without OPA fallback (acceptable); message=${evaluated.message}`,
    );
  }

  log(
    "live-smoke",
    `PASS env=${envId} function=${SMOKE_PG_FUNCTION_ID} path=${routePath} fallback=${evaluated.fallback || "none"}`,
  );
  return {
    skipped: false,
    envId,
    functionId: SMOKE_PG_FUNCTION_ID,
    fallback: evaluated.fallback,
    path: routePath,
  };
}

async function main() {
  const requested = resolveRequestedVersion();
  const workRoot =
    process.env.SMOKE_WORKDIR ||
    mkdtempSync(path.join(tmpdir(), "cloudbase-mcp-tarball-smoke-"));
  mkdirSync(workRoot, { recursive: true });

  const createdTemp = !process.env.SMOKE_WORKDIR;
  log("workdir", workRoot);

  try {
    const meta = await resolvePackageMeta(requested);
    log("version", `${meta.requested} -> ${meta.version}`);
    log("tarball", meta.tarball);
    log("registry-shasum", meta.shasum);

    const tarballPath = path.join(workRoot, `${PACKAGE_NAME.replace("/", "-")}-${meta.version}.tgz`);
    await downloadToFile(meta.tarball, tarballPath);
    const actualShasum = sha1File(tarballPath);
    log("actual-shasum", actualShasum);

    assert(
      actualShasum === meta.shasum,
      `Tarball shasum mismatch vs registry: expected ${meta.shasum}, got ${actualShasum}`,
    );
    if (EXPECTED_SHASUM) {
      assert(
        actualShasum === EXPECTED_SHASUM,
        `Tarball shasum mismatch vs EXPECTED_SHASUM: expected ${EXPECTED_SHASUM}, got ${actualShasum}`,
      );
      log("expected-shasum", "matched");
    }

    const extractRoot = path.join(workRoot, "extract");
    const pkgRoot = extractTarball(tarballPath, extractRoot);

    const pkgJson = JSON.parse(readFileSync(path.join(pkgRoot, "package.json"), "utf8"));
    assert(pkgJson.version === meta.version, `package.json version ${pkgJson.version} != ${meta.version}`);
    log("package.json", `version=${pkgJson.version}`);
    assertNoRuntimeDependencies(pkgJson);

    // server.json ships inside the tarball (see package.json "files"); its
    // version must match the published version, otherwise the MCP Registry
    // and other consumers reading the tarball see a stale version.
    const serverJsonPath = path.join(pkgRoot, "server.json");
    assert(existsSync(serverJsonPath), `Published tarball missing server.json at ${serverJsonPath}`);
    const serverJson = JSON.parse(readFileSync(serverJsonPath, "utf8"));
    assert(
      serverJson.version === meta.version,
      `server.json version ${serverJson.version} != published version ${meta.version}`,
    );
    const npmServerPkg = (serverJson.packages || []).find((p) => p.registryType === "npm");
    if (npmServerPkg) {
      assert(
        npmServerPkg.version === meta.version,
        `server.json npm package version ${npmServerPkg.version} != published version ${meta.version}`,
      );
    }
    log("server.json", `version=${serverJson.version}`);

    assertOpaStrings(pkgRoot);
    const { toolNames } = await assertToolRegistration(pkgRoot);
    await assertCliCloudMode(pkgRoot);
    const live = await runLiveWithFreshServer(pkgRoot);

    const summary = {
      success: true,
      package: PACKAGE_NAME,
      requested,
      version: meta.version,
      shasum: actualShasum,
      tools: {
        total: toolNames.length,
        required: REQUIRED_TOOLS,
      },
      opaStrings: OPA_STRINGS,
      cliCloudMode: true,
      live,
    };
    const summaryPath = path.join(workRoot, "smoke-summary.json");
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
    log("done", summaryPath);
  } finally {
    if (createdTemp && process.env.KEEP_SMOKE_WORKDIR !== "1") {
      rmSync(workRoot, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error("[npm-tarball-smoke] FAILED:", error);
    process.exit(1);
  });
}
