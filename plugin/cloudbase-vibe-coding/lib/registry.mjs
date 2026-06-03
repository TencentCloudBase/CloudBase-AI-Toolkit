/**
 * Global registry for vibe-coding workspaces.
 *
 * The supervisor and the bin scripts share state through:
 *   ~/.cloudbase-agent/registry.json
 *
 * Schema:
 *   { version, updatedAt,
 *     entries: [
 *       { cwd, sessionId, port, mountPath, previewPid,
 *         registeredAt, lastCheckedAt, lastRestartAt,
 *         restartCount, consecutiveFailures, status, lastFailureReason? } ] }
 *
 * Concurrency:
 *   - mkdir-based file lock for each mutation (cross-process atomic)
 *   - reads are lock-free; tolerate truncated/missing files
 *   - mutations always rewrite the entire file (no partial JSON updates)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const GLOBAL_DIR = join(homedir(), ".cloudbase-agent");
export const REGISTRY_PATH = join(GLOBAL_DIR, "registry.json");
export const SUPERVISOR_STATE_PATH = join(GLOBAL_DIR, "supervisor.json");
export const SUPERVISOR_LOCK_DIR = join(GLOBAL_DIR, "supervisor.lock");
export const REGISTRY_LOCK_DIR = join(GLOBAL_DIR, "registry.lock");
export const SUPERVISOR_LOG = join(GLOBAL_DIR, "supervisor.log");

const REGISTRY_VERSION = 1;
const RESTART_BUDGET_BEFORE_DEGRADED = 5;
export const RESTART_BUDGET = RESTART_BUDGET_BEFORE_DEGRADED;

export const STATUS = Object.freeze({
  RUNNING: "running",
  STARTING: "starting",
  RESTARTING: "restarting",
  DEGRADED: "degraded",
});

export function ensureGlobalDir() {
  if (!existsSync(GLOBAL_DIR)) mkdirSync(GLOBAL_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Lock helpers (mkdir-based, atomic across processes)
// ---------------------------------------------------------------------------

function tryAcquireLock(lockDir, { timeoutMs = 2000, retryMs = 30 } = {}) {
  ensureGlobalDir();
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(lockDir); return true; } catch {}
    if (Date.now() - t0 >= timeoutMs) return false;
    // Tiny busy-wait (sync; ms-scale, OK for short locks).
    const start = Date.now();
    while (Date.now() - start < retryMs) { /* spin */ }
  }
}

function releaseLock(lockDir) {
  try { rmdirSync(lockDir); } catch {}
}

function withRegistryLock(fn) {
  if (!tryAcquireLock(REGISTRY_LOCK_DIR)) {
    // Stuck lock — break it. Risk is minimal since each mutation is a
    // wholesale rewrite anyway.
    try { rmdirSync(REGISTRY_LOCK_DIR); } catch {}
    tryAcquireLock(REGISTRY_LOCK_DIR, { timeoutMs: 100 });
  }
  try { return fn(); } finally { releaseLock(REGISTRY_LOCK_DIR); }
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

export function readRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    return { version: REGISTRY_VERSION, updatedAt: null, entries: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
    if (!Array.isArray(parsed.entries)) parsed.entries = [];
    return parsed;
  } catch {
    return { version: REGISTRY_VERSION, updatedAt: null, entries: [] };
  }
}

function writeRegistry(reg) {
  ensureGlobalDir();
  reg.version = REGISTRY_VERSION;
  reg.updatedAt = new Date().toISOString();
  const tmp = `${REGISTRY_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(reg, null, 2));
  renameSync(tmp, REGISTRY_PATH);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Idempotent: if cwd already exists, port/sessionId/previewPid are updated
 * and counters reset.
 */
export function registerWorkspace({ cwd, sessionId, port, previewPid }) {
  return withRegistryLock(() => {
    const reg = readRegistry();
    const i = reg.entries.findIndex((e) => e.cwd === cwd);
    const now = new Date().toISOString();
    const sid = sessionId || (reg.entries[i]?.sessionId ?? cwd.split("/").filter(Boolean).pop() ?? "vibe");
    const next = {
      cwd,
      sessionId: sid,
      port,
      mountPath: `/s/${sid}/`,
      previewPid: previewPid || null,
      registeredAt: i === -1 ? now : reg.entries[i].registeredAt,
      lastCheckedAt: now,
      lastRestartAt: null,
      restartCount: i === -1 ? 0 : (reg.entries[i].restartCount || 0),
      consecutiveFailures: 0,
      status: STATUS.RUNNING,
    };
    if (i === -1) reg.entries.push(next);
    else reg.entries[i] = { ...reg.entries[i], ...next };
    writeRegistry(reg);
    return next;
  });
}

export function unregisterWorkspace(cwd) {
  return withRegistryLock(() => {
    const reg = readRegistry();
    const before = reg.entries.length;
    reg.entries = reg.entries.filter((e) => e.cwd !== cwd);
    if (reg.entries.length !== before) {
      writeRegistry(reg);
      return true;
    }
    return false;
  });
}

export function patchWorkspace(cwd, patch) {
  return withRegistryLock(() => {
    const reg = readRegistry();
    const i = reg.entries.findIndex((e) => e.cwd === cwd);
    if (i === -1) return null;
    reg.entries[i] = { ...reg.entries[i], ...patch };
    writeRegistry(reg);
    return reg.entries[i];
  });
}

/**
 * Increment failure counter; if it crosses the budget, mark as degraded.
 * Returns { entry, degraded }.
 */
export function recordFailure(cwd, reason) {
  return withRegistryLock(() => {
    const reg = readRegistry();
    const i = reg.entries.findIndex((e) => e.cwd === cwd);
    if (i === -1) return { entry: null, degraded: false };
    const e = reg.entries[i];
    const fails = (e.consecutiveFailures || 0) + 1;
    const degraded = fails >= RESTART_BUDGET_BEFORE_DEGRADED;
    reg.entries[i] = {
      ...e,
      consecutiveFailures: fails,
      lastRestartAt: new Date().toISOString(),
      status: degraded ? STATUS.DEGRADED : STATUS.RESTARTING,
      lastFailureReason: reason || null,
    };
    writeRegistry(reg);
    return { entry: reg.entries[i], degraded };
  });
}

export function recordSuccess(cwd, { wasRestart = false, previewPid = null, port = null } = {}) {
  return withRegistryLock(() => {
    const reg = readRegistry();
    const i = reg.entries.findIndex((e) => e.cwd === cwd);
    if (i === -1) return null;
    const now = new Date().toISOString();
    const e = reg.entries[i];
    reg.entries[i] = {
      ...e,
      lastCheckedAt: now,
      consecutiveFailures: 0,
      status: STATUS.RUNNING,
      previewPid: previewPid ?? e.previewPid,
      port: port ?? e.port,
      ...(wasRestart ? { restartCount: (e.restartCount || 0) + 1, lastRestartAt: now } : {}),
    };
    writeRegistry(reg);
    return reg.entries[i];
  });
}

export function listWorkspaces() {
  return readRegistry().entries;
}
