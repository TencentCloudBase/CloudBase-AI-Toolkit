/**
 * Shared helpers for the cloudbase-vibe-* preview scripts.
 *
 * State lives at <cwd>/.cloudbase-agent/preview.json. Each cwd is its own
 * world; cross-cwd coordination lives in lib/registry.mjs.
 *
 * Exports:
 *   STATE_DIR / LOG_DIR / PREVIEW_JSON  — absolute paths under process.cwd()
 *   ERR                                 — frozen error-code table
 *   readPreview()                       — null | PreviewState
 *   writePreview(state)                 — atomic write (tmp + rename)
 *   clearPreview()                      — unlink preview.json (best-effort)
 *   isAlive(pid)                        — kill -0 probe
 *   healthOk(port, timeoutMs?)          — one-shot HTTP probe on 127.0.0.1
 *   stopPid(pid, { graceMs? })          — SIGTERM, escalate to SIGKILL after grace
 *   ensureDir(p)                        — mkdir -p
 *   emitOk(payload, humanLine?)         — JSON line on stdout + stderr summary
 *   emitErr(message, code, hint?)       — JSON line on stdout + stderr summary
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import http from "node:http";

// ---------------------------------------------------------------------------
// Paths (resolved against current working directory at module load time)
// ---------------------------------------------------------------------------

export const STATE_DIR = join(process.cwd(), ".cloudbase-agent");
export const LOG_DIR = join(STATE_DIR, "logs");
export const PREVIEW_JSON = join(STATE_DIR, "preview.json");

// ---------------------------------------------------------------------------
// Error codes (kept stable so the SKILL and hooks can rely on them)
// ---------------------------------------------------------------------------

export const ERR = Object.freeze({
  GENERIC: 1,
  NOT_VITE_PROJECT: 2,
  PORT_POOL_EXHAUSTED: 3,
  HEALTH_CHECK_FAILED: 4,
  NO_PREVIEW_RUNNING: 5,
  STOP_FAILED: 6,
  BUILD_FAILED: 7,
  DIST_MISSING: 8,
});

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

export function readPreview() {
  if (!existsSync(PREVIEW_JSON)) return null;
  try {
    return JSON.parse(readFileSync(PREVIEW_JSON, "utf8"));
  } catch {
    return null;
  }
}

export function writePreview(state) {
  ensureDir(STATE_DIR);
  // Write to temp + rename — atomic on POSIX, safe against partial writes mid-crash.
  const tmp = `${PREVIEW_JSON}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, PREVIEW_JSON);
}

export function clearPreview() {
  try { if (existsSync(PREVIEW_JSON)) unlinkSync(PREVIEW_JSON); } catch {}
}

// ---------------------------------------------------------------------------
// Process / health probes
// ---------------------------------------------------------------------------

export function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function healthOk(port, timeoutMs = 2_000) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/", timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(!!(res.statusCode && res.statusCode < 500));
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

/**
 * Send SIGTERM, then escalate to SIGKILL after `graceMs` if still alive.
 * graceMs=0 → straight to SIGKILL.
 * Resolves to { ok, escalated, error? }.
 */
export async function stopPid(pid, { graceMs = 3_000 } = {}) {
  if (!pid || !isAlive(pid)) return { ok: true, escalated: false };
  if (graceMs > 0) {
    try { process.kill(pid, "SIGTERM"); } catch (e) {
      return { ok: false, escalated: false, error: e.message };
    }
    const t0 = Date.now();
    while (Date.now() - t0 < graceMs) {
      if (!isAlive(pid)) return { ok: true, escalated: false };
      await sleep(120);
    }
  }
  // Still alive (or graceMs=0): escalate.
  try { process.kill(pid, "SIGKILL"); } catch {}
  await sleep(200);
  return { ok: !isAlive(pid), escalated: true };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

export function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

export function emitOk(payload, humanLine) {
  process.stdout.write(JSON.stringify({ ok: true, ...payload }) + "\n");
  if (humanLine) process.stderr.write(`[cloudbase-agent] ${humanLine}\n`);
}

export function emitErr(message, code = ERR.GENERIC, hint) {
  const out = { ok: false, code, message };
  if (hint) out.hint = hint;
  process.stdout.write(JSON.stringify(out) + "\n");
  process.stderr.write(`[cloudbase-agent] error (code=${code}): ${message}\n`);
}
