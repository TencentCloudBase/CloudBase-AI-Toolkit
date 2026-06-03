/**
 * Supervisor control plane: shared helpers used by both the supervisor daemon
 * (cloudbase-vibe-supervisor) and every other bin script.
 *
 * The exported `ensureSupervisorRunning()` is the contract every bin command
 * calls at startup. It is:
 *   - safe (mkdir-based lock so 5 parallel callers spawn at most 1 daemon)
 *   - cheap (a healthy supervisor returns in ~1ms)
 *   - non-blocking (spawns detached and returns; doesn't wait for daemon ready)
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  GLOBAL_DIR,
  SUPERVISOR_LOCK_DIR,
  SUPERVISOR_LOG,
  SUPERVISOR_STATE_PATH,
  ensureGlobalDir,
} from "./registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPERVISOR_BIN = join(__dirname, "..", "bin", "cloudbase-vibe-supervisor");

// ---------------------------------------------------------------------------
// Supervisor PID file
// ---------------------------------------------------------------------------

export function readSupervisorState() {
  if (!existsSync(SUPERVISOR_STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SUPERVISOR_STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function writeSupervisorState(state) {
  ensureGlobalDir();
  const tmp = `${SUPERVISOR_STATE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, SUPERVISOR_STATE_PATH);
}

export function clearSupervisorState() {
  try { if (existsSync(SUPERVISOR_STATE_PATH)) unlinkSync(SUPERVISOR_STATE_PATH); } catch {}
}

export function isSupervisorAlive() {
  const s = readSupervisorState();
  if (!s?.pid) return false;
  try { process.kill(s.pid, 0); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// ensureSupervisorRunning — public entry every bin command calls
// ---------------------------------------------------------------------------

/**
 * Spawn a detached supervisor daemon if (and only if) one isn't already
 * running. Idempotent and concurrency-safe.
 *
 * Returns: { spawned: boolean, alive: boolean, pid: number|null }
 */
export function ensureSupervisorRunning({ silent = true } = {}) {
  if (isSupervisorAlive()) {
    return { spawned: false, alive: true, pid: readSupervisorState()?.pid ?? null };
  }

  ensureGlobalDir();

  // Acquire spawn lock so 5 parallel callers don't all spawn.
  const lockTimeoutMs = 1500;
  const t0 = Date.now();
  let acquired = false;
  while (Date.now() - t0 < lockTimeoutMs) {
    try { mkdirSync(SUPERVISOR_LOCK_DIR); acquired = true; break; } catch {}
    // Re-probe in case the other caller already finished spawning.
    if (isSupervisorAlive()) {
      return { spawned: false, alive: true, pid: readSupervisorState()?.pid ?? null };
    }
    const start = Date.now();
    while (Date.now() - start < 60) { /* spin */ }
  }
  if (!acquired) {
    // Stuck lock — break it (the previous spawn likely crashed mid-flight).
    try { rmdirSync(SUPERVISOR_LOCK_DIR); } catch {}
    try { mkdirSync(SUPERVISOR_LOCK_DIR); } catch {}
  }

  try {
    // Re-check inside the lock.
    if (isSupervisorAlive()) {
      return { spawned: false, alive: true, pid: readSupervisorState()?.pid ?? null };
    }
    const logFd = openSync(SUPERVISOR_LOG, "a");
    const child = spawn(process.execPath, [SUPERVISOR_BIN, "--daemon-loop"], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
      cwd: GLOBAL_DIR,
    });
    child.unref();
    if (!silent) {
      process.stderr.write(`[cloudbase-agent] supervisor started (pid ${child.pid})\n`);
    }
    // The daemon writes supervisor.json itself once running; we don't pre-write
    // here because a race could leave a stale file if the daemon crashes early.
    return { spawned: true, alive: true, pid: child.pid };
  } finally {
    try { rmdirSync(SUPERVISOR_LOCK_DIR); } catch {}
  }
}

/**
 * Stop the running supervisor (graceful TERM, then KILL fallback).
 * Returns { stopped, pid, escalated?, reason? }.
 */
export async function stopSupervisor({ graceMs = 3000 } = {}) {
  const s = readSupervisorState();
  if (!s?.pid) {
    clearSupervisorState();
    return { stopped: false, pid: null, reason: "not running" };
  }
  if (!isSupervisorAlive()) {
    clearSupervisorState();
    return { stopped: false, pid: s.pid, reason: "process already gone" };
  }
  try { process.kill(s.pid, "SIGTERM"); } catch {}
  const t0 = Date.now();
  while (Date.now() - t0 < graceMs) {
    if (!isSupervisorAlive()) {
      clearSupervisorState();
      return { stopped: true, pid: s.pid, escalated: false };
    }
    await sleep(120);
  }
  try { process.kill(s.pid, "SIGKILL"); } catch {}
  await sleep(200);
  const finallyDead = !isSupervisorAlive();
  if (finallyDead) clearSupervisorState();
  return { stopped: finallyDead, pid: s.pid, escalated: true };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
