/**
 * `cloudbase-sites preview` — daemonize/inspect/stop/restart Vite dev server.
 *
 * One verb, multiple modes via flags:
 *   cloudbase-sites preview              # ensure running (start if not)
 *   cloudbase-sites preview --status     # JSON status
 *   cloudbase-sites preview --status -q  # exit code only
 *   cloudbase-sites preview --restart    # stop + start
 *   cloudbase-sites preview --stop       # stop the dev server
 *   cloudbase-sites preview --port 17180
 *   cloudbase-sites preview --base /s/sid/
 *
 * Always daemonizes (PPID=1, detached). Uses 17173..17272 port range by default.
 */

import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import net from "node:net";
import http from "node:http";
import {
  STATE_DIR, LOG_DIR,
  readPreview, writePreview, clearPreview,
  isAlive, healthOk, stopPid,
  ensureDir, ERR,
} from "../preview-state.mjs";
import { emitOk, withCode } from "../emit.mjs";
import { registerWorkspace, unregisterWorkspace } from "../registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT_RANGE_START = Number(process.env.CLOUDBASE_SITES_PORT_START || 17173);
const DEFAULT_PORT_RANGE_END = Number(process.env.CLOUDBASE_SITES_PORT_END || 17272);
const HEALTH_TIMEOUT_MS = Number(process.env.CLOUDBASE_SITES_HEALTH_TIMEOUT_MS || 30_000);

export const previewHelp = `cloudbase-sites preview — daemonize/inspect/stop/restart Vite dev server in cwd

Modes (default = ensure running):
  --status             JSON status; exit code 0=healthy, 5=not running
  --quiet, -q          (with --status) no output, exit code only
  --restart            stop + start in one shot
  --stop               stop the dev server
  --force, -f          (with --stop) SIGKILL immediately

Options for start/restart:
  --port <N>           request specific port (default: auto from 17173..17272)
  --base <P>           path-mount base, e.g. /s/<sid>/ (default: /)

State file: <cwd>/.cloudbase-sites/preview.json
Logs dir:   <cwd>/.cloudbase-sites/logs/`;

export async function runPreview(args) {
  if (args.stop) return runStop(args);
  if (args.restart) {
    await runStop({ ...args, force: true });
    return runStart({ ...args, force: false });
  }
  if (args.status) return runStatus(args);
  return runStart(args);
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function runStatus(args) {
  const state = readPreview();
  if (!state) {
    if (args.quiet) process.exit(ERR.NO_PREVIEW_RUNNING);
    emitOk({ running: false, reason: "no preview recorded" }, "no preview running");
    process.exit(ERR.NO_PREVIEW_RUNNING);
  }
  const alive = state.pid ? isAlive(state.pid) : false;
  const healthy = alive && state.port ? await healthOk(state.port) : false;
  const ok = alive && healthy;
  if (args.quiet) process.exit(ok ? 0 : ERR.NO_PREVIEW_RUNNING);
  emitOk(
    {
      running: ok,
      alive,
      healthy,
      pid: state.pid,
      port: state.port,
      framework: state.framework,
      base: state.base,
      internalUrl: state.internalUrl,
      logPath: state.logPath,
      startedAt: state.startedAt,
    },
    ok
      ? `preview healthy: ${state.internalUrl}`
      : `preview unhealthy (alive=${alive}, http=${healthy})`,
  );
  process.exit(ok ? 0 : ERR.NO_PREVIEW_RUNNING);
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

async function runStop(args) {
  const state = readPreview();
  if (!state) {
    unregisterWorkspace(process.cwd());
    emitOk({ stopped: false, reason: "no preview recorded" }, "no preview to stop");
    return;
  }
  if (!state.pid || !isAlive(state.pid)) {
    clearPreview();
    unregisterWorkspace(process.cwd());
    emitOk({ stopped: false, reason: "process already gone", pid: state.pid }, "stale state cleared");
    return;
  }
  const graceMs = args.force ? 0 : 3_000;
  const result = await stopPid(state.pid, { graceMs });
  if (!result.ok) {
    throw withCode(ERR.STOP_FAILED, `Failed to stop pid=${state.pid}: ${result.error || "still alive after SIGKILL"}`);
  }
  clearPreview();
  unregisterWorkspace(process.cwd());
  emitOk(
    { stopped: true, pid: state.pid, escalated: result.escalated, port: state.port },
    `preview stopped (pid=${state.pid}${result.escalated ? ", SIGKILL" : ", SIGTERM"})`,
  );
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

async function runStart(args) {
  const CWD = process.cwd();
  ensureDir(STATE_DIR);
  ensureDir(LOG_DIR);

  const fingerprint = checkViteProject(CWD);
  if (!fingerprint.ok) {
    throw withCode(ERR.NOT_VITE_PROJECT, `Not a Vite project: ${fingerprint.reason}`);
  }

  // Idempotent reuse.
  const existing = readPreview();
  if (existing && existing.pid && isAlive(existing.pid) && (await healthOk(existing.port))) {
    if (args.force) {
      try { process.kill(existing.pid, "SIGTERM"); } catch {}
      clearPreview();
    } else {
      registerInRegistry(existing, CWD);
      emitOk({ ...existing, reused: true }, `preview ready: ${existing.internalUrl}`);
      return;
    }
  }
  if (existing) {
    try { if (existing.pid) process.kill(existing.pid, "SIGTERM"); } catch {}
    clearPreview();
  }

  const port = await allocPort(args.port ? Number(args.port) : null, DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END);
  const base = args.base || process.env.CLOUDBASE_SITES_BASE || "/";

  const ts = Date.now();
  const logPath = join(LOG_DIR, `preview-${ts}.log`);
  const logFd = openSync(logPath, "a");

  const env = {
    ...process.env,
    HOST: "0.0.0.0",
    PORT: String(port),
    VITE_BASE_URL: base,
  };

  const argv = [
    ...(fingerprint._viteEntry ? [fingerprint._viteEntry] : []),
    "--host", "0.0.0.0",
    "--port", String(port),
    "--strictPort",
    "--base", base,
  ];

  const child = spawn(fingerprint.viteBin, argv, {
    cwd: CWD,
    env,
    stdio: ["ignore", logFd, logFd],
    detached: true,
    windowsHide: true,
  });
  child.unref();

  const outcome = await Promise.race([
    waitForHealth(port, HEALTH_TIMEOUT_MS),
    waitForExit(child).then((code) => ({ exited: true, code })),
  ]);
  if (outcome && outcome.exited) {
    throw withCode(ERR.HEALTH_CHECK_FAILED, `Dev server exited early with code=${outcome.code}. See log: ${logPath}`);
  }
  if (outcome && outcome.timedOut) {
    try { process.kill(child.pid); } catch {}
    throw withCode(ERR.HEALTH_CHECK_FAILED, `Dev server failed health check within ${HEALTH_TIMEOUT_MS}ms. See log: ${logPath}`);
  }

  const internalUrl = `http://127.0.0.1:${port}${base.endsWith("/") ? base : base + "/"}`;
  const state = {
    pid: child.pid,
    port,
    host: "0.0.0.0",
    base,
    framework: fingerprint.framework,
    command: [fingerprint.viteBin, ...argv].join(" "),
    internalUrl,
    logPath,
    cwd: CWD,
    startedAt: new Date().toISOString(),
  };
  writePreview(state);
  registerInRegistry(state, CWD);
  emitOk({ ...state, reused: false }, `preview ready: ${internalUrl}`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function checkViteProject(dir) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return { ok: false, reason: "no package.json in cwd" };
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")); }
  catch (e) { return { ok: false, reason: `invalid package.json: ${e.message}` }; }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!deps.vite) return { ok: false, reason: "vite not in dependencies/devDependencies" };
  const hasReact = !!deps.react;
  const hasVue = !!deps.vue;
  if (!hasReact && !hasVue) return { ok: false, reason: "neither react nor vue is a dependency" };

  const candidatePosixJs = join(dir, "node_modules", "vite", "bin", "vite.js");
  const candidateBinPosix = join(dir, "node_modules", ".bin", "vite");
  const candidateWin = join(dir, "node_modules", ".bin", "vite.cmd");

  if (process.platform === "win32") {
    if (existsSync(candidateWin)) {
      return { ok: true, framework: hasReact ? "vite-react" : "vite-vue", viteBin: candidateWin, _viteEntry: null };
    }
  } else {
    if (existsSync(candidatePosixJs)) {
      return { ok: true, framework: hasReact ? "vite-react" : "vite-vue", viteBin: process.execPath, _viteEntry: candidatePosixJs };
    }
    if (existsSync(candidateBinPosix)) {
      return { ok: true, framework: hasReact ? "vite-react" : "vite-vue", viteBin: candidateBinPosix, _viteEntry: null };
    }
  }
  return { ok: false, reason: "local vite binary missing — run `pnpm install` (or `npm install`) first" };
}

async function allocPort(requested, start, end) {
  if (requested) {
    if (await portFree(requested)) return requested;
    throw withCode(ERR.PORT_POOL_EXHAUSTED, `Requested port ${requested} is occupied.`);
  }
  for (let p = start; p <= end; p++) {
    if (await portFree(p)) return p;
  }
  throw withCode(ERR.PORT_POOL_EXHAUSTED, `No free port in [${start}..${end}].`);
}

function portFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", () => resolve(false))
      .once("listening", () => tester.close(() => resolve(true)))
      .listen(port, "0.0.0.0");
  });
}

function waitForHealth(port, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const probe = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve({ ready: true });
        retry();
      });
      req.on("error", retry);
      req.on("timeout", () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - t0 >= timeoutMs) return resolve({ timedOut: true });
      setTimeout(probe, 500);
    };
    probe();
  });
}

function waitForExit(child) {
  return new Promise((resolve) => { child.once("exit", (code) => resolve(code)); });
}

function registerInRegistry(state, cwd) {
  let sessionId = null;
  const appJsonPath = join(STATE_DIR, "app.json");
  if (existsSync(appJsonPath)) {
    try {
      const app = JSON.parse(readFileSync(appJsonPath, "utf8"));
      sessionId = app.siteName || app.serviceName || null;
    } catch { /* ignore */ }
  }
  if (!sessionId) sessionId = cwd.split("/").filter(Boolean).pop() || "vibe";
  try {
    registerWorkspace({ cwd, sessionId, port: state.port, previewPid: state.pid });
  } catch (e) {
    process.stderr.write(`[cloudbase-sites] registry write failed: ${e.message}\n`);
  }
}
