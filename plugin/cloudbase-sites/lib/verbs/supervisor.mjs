/**
 * `cloudbase-sites supervisor` — global watchdog daemon.
 *
 * Two modes:
 *   1. Subcommands: start/stop/status/list/heal/reload (called by user).
 *   2. --daemon-loop: internal entry point for the spawned detached child.
 *
 * Walks ~/.cloudbase-sites/registry.json every TICK_MS, probes each cwd's
 * preview.json, restarts dead vites via the binary's own `preview` verb.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import http from "node:http";
import {
  ensureGlobalDir,
  listWorkspaces,
  patchWorkspace,
  recordFailure,
  recordSuccess,
  STATUS,
  RESTART_BUDGET,
} from "../registry.mjs";
import {
  clearSupervisorState,
  ensureSupervisorRunning,
  isSupervisorAlive,
  readSupervisorState,
  stopSupervisor,
  writeSupervisorState,
} from "../supervisor-ctl.mjs";
import { emitOk, emitErr } from "../emit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_BIN = join(__dirname, "..", "..", "bin", "cloudbase-sites");

const TICK_MS = Number(process.env.CLOUDBASE_SITES_SUPERVISOR_TICK_MS || 15_000);
const HEALTH_HTTP_TIMEOUT_MS = 1500;

export const supervisorHelp = `cloudbase-sites supervisor — global watchdog for vibe-coding cwds

Subcommands:
  start                    spawn daemon (no-op if already running)
  stop                     SIGTERM daemon (with SIGKILL fallback)
  status                   JSON: alive/pid/uptime/workspaceCount
  list                     JSON: all registered workspaces with health
  heal <cwd>               clear DEGRADED state, trigger one restart
  reload                   send SIGHUP to daemon (re-read registry)

Internal:
  --daemon-loop            entered by the spawned child; do not run manually

State files:
  ~/.cloudbase-sites/supervisor.json   daemon PID + startedAt + lastTickAt
  ~/.cloudbase-sites/registry.json     all registered cwds
  ~/.cloudbase-sites/supervisor.log    daemon stdout/stderr

Tick interval: ${TICK_MS}ms (env CLOUDBASE_SITES_SUPERVISOR_TICK_MS to override)`;

export async function runSupervisor(subcmd, rest) {
  switch (subcmd) {
    case "--daemon-loop": return runDaemonLoop();
    case "start":         return cmdStart();
    case "stop":          return cmdStop();
    case "status":        return cmdStatus();
    case "list":          return cmdList();
    case "heal":          return cmdHeal(rest);
    case "reload":        return cmdReload();
    default:
      emitErr(`Unknown supervisor subcommand: ${subcmd}`, 1);
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Daemon loop
// ---------------------------------------------------------------------------

async function runDaemonLoop() {
  ensureGlobalDir();
  writeSupervisorState({
    pid: process.pid,
    startedAt: new Date().toISOString(),
    tickMs: TICK_MS,
  });

  let running = true;
  const shutdown = () => {
    running = false;
    try { clearSupervisorState(); } catch {}
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGHUP", () => { /* registry is re-read every tick anyway */ });

  log("daemon started");

  while (running) {
    await tickOnce().catch((e) => log(`tick error: ${e.message || e}`));
    const s = readSupervisorState();
    if (s) writeSupervisorState({ ...s, lastTickAt: new Date().toISOString() });
    await sleep(TICK_MS);
  }
}

async function tickOnce() {
  const entries = listWorkspaces();
  if (entries.length === 0) return;

  for (const entry of entries) {
    if (entry.status === STATUS.DEGRADED) continue;

    const result = await checkHealth(entry);
    if (result.healthy) {
      recordSuccess(entry.cwd, { previewPid: result.observedPid });
      continue;
    }
    log(`unhealthy cwd=${entry.cwd} reason=${result.reason}`);
    const { degraded } = recordFailure(entry.cwd, result.reason);
    if (degraded) {
      log(`cwd=${entry.cwd} now DEGRADED after ${RESTART_BUDGET} consecutive failures`);
      continue;
    }
    triggerRestart(entry.cwd);
  }
}

async function checkHealth(entry) {
  const previewJson = join(entry.cwd, ".cloudbase-sites", "preview.json");
  if (!existsSync(previewJson)) return { healthy: false, reason: "preview.json missing" };
  let pj;
  try { pj = JSON.parse(readFileSync(previewJson, "utf8")); }
  catch { return { healthy: false, reason: "preview.json unreadable" }; }
  if (!pj.pid) return { healthy: false, reason: "no pid in preview.json" };
  try { process.kill(pj.pid, 0); }
  catch { return { healthy: false, reason: `pid ${pj.pid} dead` }; }
  if (!pj.port) return { healthy: false, reason: "no port in preview.json" };
  const httpOk = await httpHealthy("127.0.0.1", pj.port);
  if (!httpOk) return { healthy: false, reason: `http probe ${pj.port} failed` };
  return { healthy: true, observedPid: pj.pid };
}

function httpHealthy(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: "/", timeout: HEALTH_HTTP_TIMEOUT_MS }, (res) => {
      res.resume();
      resolve(!!(res.statusCode && res.statusCode < 500));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function triggerRestart(cwd) {
  try {
    const child = spawn(SITES_BIN, ["preview", "--restart"], {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    log(`spawned restart for cwd=${cwd}`);
  } catch (e) {
    log(`failed to spawn restart for cwd=${cwd}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// User-facing subcommands
// ---------------------------------------------------------------------------

async function cmdStart() {
  const r = ensureSupervisorRunning({ silent: false });
  emitOk(r);
}

async function cmdStop() {
  const r = await stopSupervisor();
  if (r.stopped || r.reason) emitOk(r);
  else emitErr(r.reason || "stop failed", 1);
}

async function cmdStatus() {
  const s = readSupervisorState();
  const alive = isSupervisorAlive();
  emitOk({
    alive,
    pid: s?.pid ?? null,
    startedAt: s?.startedAt ?? null,
    lastTickAt: s?.lastTickAt ?? null,
    tickMs: s?.tickMs ?? null,
    workspaceCount: listWorkspaces().length,
  });
}

async function cmdList() {
  const entries = listWorkspaces();
  emitOk({ count: entries.length, entries });
}

async function cmdHeal(rest) {
  const cwd = rest[0];
  if (!cwd) {
    emitErr("usage: cloudbase-sites supervisor heal <cwd>", 1);
    process.exit(1);
  }
  const r = patchWorkspace(cwd, {
    status: STATUS.RUNNING,
    consecutiveFailures: 0,
    lastFailureReason: null,
  });
  if (!r) {
    emitErr(`cwd not registered: ${cwd}`, 1);
    process.exit(1);
  }
  triggerRestart(cwd);
  emitOk({ healed: r });
}

async function cmdReload() {
  const s = readSupervisorState();
  if (!s?.pid) { emitErr("supervisor not running", 1); process.exit(1); }
  try { process.kill(s.pid, "SIGHUP"); } catch (e) {
    emitErr(`kill -HUP ${s.pid} failed: ${e.message}`, 1);
    process.exit(1);
  }
  emitOk({ signaled: s.pid });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stderr.write(`[supervisor ${new Date().toISOString()}] ${msg}\n`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
