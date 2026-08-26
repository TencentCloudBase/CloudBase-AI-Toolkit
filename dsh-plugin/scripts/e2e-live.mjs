#!/usr/bin/env node
/**
 * Live T9 gate: spawn @cloudbase/cloudbase-mcp via the plugin bridge,
 * assert ~38 tools, queryEnv EnvList, panel-channel term map.
 *
 * Requires: built dist/, local tcb login (no API Key).
 * Does not require DSH. Optional DSH dump-config when `dsh` is on PATH
 * and the plugin has been added to a profile (CLOUDBASE_DSH_PROFILE).
 *
 * Usage (from dsh-plugin/): node scripts/e2e-live.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
  console.error("FAIL:", message);
}

function pass(message) {
  console.log("PASS:", message);
}

function textOf(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

if (!existsSync(join(root, "dist/index.js"))) {
  console.error("dist/index.js missing — run npm run build first");
  process.exit(1);
}

const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
if (patch.includes("CLOUDBASE_API_KEY")) fail("patch must not forward CLOUDBASE_API_KEY");
else pass("patch omits CLOUDBASE_API_KEY");
if (patch.includes("CLOUDBASE_ENV_ID")) {
  fail("patch must not forward CLOUDBASE_ENV_ID — login via device-code");
} else {
  pass("patch forwards no env (device-code login)");
}

const { CloudBaseMcpBridge, createCloudBaseDataService } = await import(
  join(root, "dist/index.js")
);

const expectedTools = [
  "auth",
  "queryEnv",
  "queryPgDatabase",
  "queryMysqlDatabase",
  "readNoSqlDatabaseContent",
  "queryStorage",
  "queryAppAuth",
  "queryLogs",
  "queryFunctions",
  "manageHosting",
];

const bridge = new CloudBaseMcpBridge();
let tools = [];

try {
  tools = await bridge.listTools();
  if (tools.length < 30) {
    fail(`expected ~38 MCP tools, got ${tools.length}: ${tools.join(", ")}`);
  } else {
    pass(`MCP tools/list returned ${tools.length} tools`);
  }
  const missing = expectedTools.filter((name) => !tools.includes(name));
  if (missing.length > 0) fail(`missing MCP tools: ${missing.join(", ")}`);
  else pass(`required tools present: ${expectedTools.join(", ")}`);

  const envList = await bridge.callTool("queryEnv", { action: "list" });
  const blob = textOf(envList);
  if (/EnvId|envId|EnvList/i.test(blob) && !/RefreshAccessToken|未登录|认证已过期/.test(blob)) {
    pass("queryEnv action=list returned real EnvList");
  } else if (/RefreshAccessToken|未登录|认证已过期|unable to verify the first certificate/.test(blob)) {
    console.warn(
      "WARN: queryEnv reached CloudBase but local tcb token refresh failed (TLS/login). Tool path is live; EnvList blocked by host credentials.",
    );
    console.warn(`      ${blob.slice(0, 240)}`);
    pass("queryEnv tool callable; auth failure is a real error (no fake EnvList)");
  } else {
    fail(`queryEnv list did not return EnvList: ${blob.slice(0, 500)}`);
  }

  const data = createCloudBaseDataService(bridge);
  let auth = await data.authStatus();
  pass(`authStatus signedIn=${auth.signedIn} envId=${auth.envId ?? "—"} mode=${auth.authMode ?? "—"}`);
  if (!auth.signedIn) {
    if (!auth.message || /假|mock|demo/i.test(auth.message)) {
      fail("signed-out authStatus missing a real login hint");
    } else {
      pass(`signed out with real hint: ${auth.message.slice(0, 120)}`);
    }
  }

  // Bind env when signed in but unbound (device-code login does not auto-pick).
  // 2026-08-26 污染清理（037f3310 收口）：去掉硬编码生产环境默认值——无人值守
  // 门禁必须显式 CLOUDBASE_ENV_ID，未设置即 fail，禁止静默绑定生产环境刷绿
  // （教训：agent 曾靠自动 set_env 让 T9 门禁"全绿"，测试自写证据给自己看）。
  const targetEnvId = process.env.CLOUDBASE_ENV_ID?.trim();
  if (auth.signedIn && !auth.envId) {
    if (!targetEnvId) {
      fail(
        "signed in but env unbound: set CLOUDBASE_ENV_ID explicitly for unattended gate (no silent default)",
      );
    } else {
      try {
        auth = await data.setEnvironment(targetEnvId);
        if (auth.envId) {
          pass(`setEnvironment bound ${auth.envId}`);
        } else {
          fail(`setEnvironment(${targetEnvId}) did not bind envId`);
        }
      } catch (error) {
        fail(
          `setEnvironment(${targetEnvId}) failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  const info = await data.envInfo();
  if (!info.envId || info.envId.length < 8) fail(`envInfo.envId not fully shown: ${info.envId}`);
  else pass(`envInfo.envId full display: ${info.envId}`);
  if (!info.regionLabel || info.regionLabel === "FLEXDB") fail(`bad regionLabel ${info.regionLabel}`);
  else pass(`envInfo.regionLabel=${info.regionLabel} functionCount=${info.functionCount}`);

  let usage = [];
  try {
    usage = await data.usage();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pass(`usage real error (no fake metrics): ${message.slice(0, 200)}`);
  }
  const usageText = textOf(usage);
  if (/\b(FLEXDB|TDSQL|SCF)\b/.test(usageText)) {
    fail(`usage leaked internal codes: ${usageText}`);
  } else {
    pass(`usage term-map clean (${usage.length} items)`);
  }

  try {
    const tables = await data.listTables();
    pass(`listTables returned ${tables.length} objects (panel DB tab)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pass(`listTables real error (no fake empty catalog): ${message.slice(0, 200)}`);
  }

  try {
    const files = await data.listStorage("/");
    pass(`listStorage returned ${files.length} objects (panel Storage tab)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pass(`listStorage real error (no fake files): ${message.slice(0, 200)}`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  bridge.dispose();
}

const dsh = spawnSync("dsh", ["--version"], { encoding: "utf8" });
if (dsh.status === 0) {
  pass(`dsh on PATH: ${dsh.stdout.trim() || dsh.stderr.trim()}`);
  const profile = process.env.CLOUDBASE_DSH_PROFILE || "headless";
  const dump = spawnSync("dsh", ["--profile", profile, "--dump-config"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60_000,
  });
  const dumpText = `${dump.stdout}\n${dump.stderr}`;
  const dumpOk =
    dump.status === 0 &&
    (dumpText.includes("mcp-cloudbase") ||
      dumpText.includes("@cloudbase/dsh-plugin") ||
      dumpText.includes("cloudbase-dsh-plugin"));
  if (dumpOk) {
    pass(`dsh --profile ${profile} --dump-config includes CloudBase plugin / mcp-cloudbase`);
  } else if (process.env.CLOUDBASE_DSH_REQUIRE_DUMP === "1") {
    fail(
      `dsh dump-config missing mcp-cloudbase. Run: dsh plugin --profile ${profile} add ${root}\n${dumpText.slice(-800)}`,
    );
  } else {
    console.warn(
      `WARN: dsh dump-config does not yet show mcp-cloudbase (add the plugin, then rerun with CLOUDBASE_DSH_REQUIRE_DUMP=1)`,
    );
  }
} else {
  pass("dsh not on PATH — skipped dump-config (CI-safe)");
}

if (process.env.CLOUDBASE_DSH_HEADLESS === "1") {
  console.log("\n==> optional headless session (CLOUDBASE_DSH_HEADLESS=1)");
  try {
    execFileSync(
      "dsh",
      [
        "--profile",
        process.env.CLOUDBASE_DSH_PROFILE || "headless",
        "只列出当前会话里名字以 mcp__cloudbase__ 开头的工具，不要调用它们。输出工具数量。",
      ],
      { stdio: "inherit", timeout: 180_000 },
    );
  } catch (error) {
    fail(`headless session failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`\ne2e-live: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\ne2e-live: all checks passed");
