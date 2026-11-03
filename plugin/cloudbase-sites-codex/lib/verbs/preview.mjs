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
import os from "node:os";
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

// Bind address policy: loopback by default. A dev server serves unauthenticated
// project source, so binding every interface must be a decision the operator
// made — never a silent default.
const LOOPBACK_HOST = "127.0.0.1";
const WILDCARD_HOST = "0.0.0.0";
// Remote / container hosts where a loopback bind would be unreachable through
// the port forward. Opt in automatically, but still announce the bind.
const REMOTE_HOST_ENV_VARS = [
  "CLOUDBASE_SITES_REMOTE",
  "REMOTE_CONTAINERS",
  "CODESPACES",
  "GITPOD_WORKSPACE_ID",
  "CLAUDE_CODE_REMOTE",
];

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
  --host <addr>        bind address (default: 127.0.0.1 — local only)
                       use 0.0.0.0 to expose the dev server to your network

The bind address defaults to ${LOOPBACK_HOST} (this machine only). Set
CLOUDBASE_SITES_HOST to change the default without passing --host. Anything
other than ${LOOPBACK_HOST}/localhost is announced on start: the dev server has no
authentication, so any host that can reach the port can read the project.

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
  const healthy = alive && state.port ? await healthOk(state.port, { host: probeHost(state.host) }) : false;
  const ok = alive && healthy;
  if (args.quiet) process.exit(ok ? 0 : ERR.NO_PREVIEW_RUNNING);
  const bindHost = state.host || LOOPBACK_HOST;
  const exposed = !isLoopbackHost(bindHost);
  const urls = exposed ? networkUrls(state.port, state.base, bindHost) : [];
  emitOk(
    {
      running: ok,
      alive,
      healthy,
      pid: state.pid,
      port: state.port,
      host: bindHost,
      exposed,
      networkUrls: urls,
      framework: state.framework,
      base: state.base,
      internalUrl: state.internalUrl,
      logPath: state.logPath,
      startedAt: state.startedAt,
    },
    ok
      ? `preview healthy: ${state.internalUrl}` + (exposed ? exposureSuffix(urls, bindHost) : "")
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

  const { host: bindHost, source: hostSource } = resolveHost(args);

  // Idempotent reuse — but a reused dev server must already listen on the
  // address this run asked for. A server left exposed by an older version (or
  // a supervisor heal) is restarted on the resolved host instead of inherited.
  const existing = readPreview();
  if (existing && existing.pid && isAlive(existing.pid) && (await healthOk(existing.port, { host: probeHost(existing.host) }))) {
    const existingHost = existing.host || LOOPBACK_HOST;
    if (!args.force && existingHost === bindHost) {
      registerInRegistry(existing, CWD);
      const urls = isLoopbackHost(existingHost) ? [] : networkUrls(existing.port, existing.base, existingHost);
      emitOk(
        { ...existing, reused: true, host: existingHost, exposed: !isLoopbackHost(existingHost), networkUrls: urls },
        `preview ready: ${existing.internalUrl}` + (isLoopbackHost(existingHost) ? "" : exposureSuffix(urls, existingHost)),
      );
      return;
    }
    await stopPid(existing.pid, { graceMs: 3_000 });
    clearPreview();
  } else if (existing) {
    if (existing.pid) await stopPid(existing.pid, { graceMs: 3_000 });
    clearPreview();
  }

  const port = await allocPort(args.port ? Number(args.port) : null, DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END);
  const base = args.base || process.env.CLOUDBASE_SITES_BASE || "/";

  const ts = Date.now();
  const logPath = join(LOG_DIR, `preview-${ts}.log`);
  const logFd = openSync(logPath, "a");

  const env = {
    ...process.env,
    HOST: bindHost,
    PORT: String(port),
    VITE_BASE_URL: base,
  };

  const argv = [
    ...(fingerprint._viteEntry ? [fingerprint._viteEntry] : []),
    "--host", bindHost,
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
    waitForHealth(port, HEALTH_TIMEOUT_MS, bindHost),
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
  const urls = isLoopbackHost(bindHost) ? [] : networkUrls(port, base, bindHost);
  const state = {
    pid: child.pid,
    port,
    host: bindHost,
    hostSource,
    exposed: !isLoopbackHost(bindHost),
    networkUrls: urls,
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
  if (state.exposed) {
    process.stderr.write(
      `[cloudbase-sites] warning: dev server bound to ${bindHost} — reachable from other hosts` +
      (urls.length ? ` (${urls.join(", ")})` : "") +
      `. It has no authentication: anyone who can reach the port can read this project.\n`,
    );
  }
  emitOk({ ...state, reused: false }, `preview ready: ${internalUrl}` + (state.exposed ? exposureSuffix(urls, bindHost) : ""));
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Decide which address the dev server binds to.
 *
 * Precedence: `--host` flag > CLOUDBASE_SITES_HOST > remote/container detection
 * > 127.0.0.1. Remote hosts bind all interfaces because a loopback-only server
 * would be unreachable through their port forward; everything else stays local.
 */
export function resolveHost(args = {}) {
  const fromFlag = typeof args.host === "string" && args.host.trim() ? args.host.trim() : null;
  if (fromFlag) return { host: fromFlag, source: "flag" };

  const fromEnv = typeof process.env.CLOUDBASE_SITES_HOST === "string" ? process.env.CLOUDBASE_SITES_HOST.trim() : "";
  if (fromEnv) return { host: fromEnv, source: "env" };

  const remoteVar = REMOTE_HOST_ENV_VARS.find((name) => {
    const value = process.env[name];
    return Boolean(value) && value !== "0" && value !== "false";
  });
  if (remoteVar) return { host: WILDCARD_HOST, source: `remote:${remoteVar}` };

  return { host: LOOPBACK_HOST, source: "default" };
}

export function isLoopbackHost(host) {
  if (!host) return true;
  const h = String(host).trim().toLowerCase();
  return h === "localhost" || h === "::1" || h === "[::1]" || h === "127.0.0.1" || h.startsWith("127.");
}

/** Address a health probe should connect to for a given bind address. */
function probeHost(host) {
  if (!host || isLoopbackHost(host) || host === WILDCARD_HOST || host === "::") return LOOPBACK_HOST;
  return host;
}

/** Reachable URLs for a non-loopback bind (LAN IPv4 addresses of this machine). */
export function networkUrls(port, base = "/", host = WILDCARD_HOST) {
  if (isLoopbackHost(host)) return [];
  const suffix = base.endsWith("/") ? base : `${base}/`;
  const hosts = [];
  if (host !== WILDCARD_HOST && host !== "::") {
    hosts.push(host);
  } else {
    for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
      if (name.startsWith("utun") || name.startsWith("llw") || name.startsWith("awdl")) continue;
      for (const addr of addrs || []) {
        if (addr.internal || addr.family !== "IPv4") continue;
        if (addr.address.startsWith("169.254.")) continue;
        hosts.push(addr.address);
      }
    }
  }
  return [...new Set(hosts)].map((h) => `http://${h}:${port}${suffix}`);
}

/** One-line suffix appended to the success message when the bind is not local. */
function exposureSuffix(urls, host) {
  const where = urls.length ? urls.join(", ") : `every interface (${host})`;
  return ` — EXPOSED to other hosts: ${where} (no authentication)`;
}

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

function waitForHealth(port, timeoutMs, host = LOOPBACK_HOST) {
  const connectHost = probeHost(host);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const probe = () => {
      const req = http.get({ host: connectHost, port, path: "/", timeout: 2000 }, (res) => {
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
