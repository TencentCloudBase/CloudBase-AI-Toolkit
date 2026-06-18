/**
 * Preview state helpers (per-cwd).
 *
 * State at <cwd>/.cloudbase-sites/preview.json. Each cwd is its own world;
 * cross-cwd coordination lives in lib/registry.mjs.
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

export const STATE_DIR = join(process.cwd(), ".cloudbase-sites");
export const LOG_DIR = join(STATE_DIR, "logs");
export const PREVIEW_JSON = join(STATE_DIR, "preview.json");

export const ERR = Object.freeze({
  GENERIC: 1,
  NOT_VITE_PROJECT: 2,
  PORT_POOL_EXHAUSTED: 3,
  HEALTH_CHECK_FAILED: 4,
  NO_PREVIEW_RUNNING: 5,
  STOP_FAILED: 6,
  BUILD_FAILED: 7,
  DIST_MISSING: 8,
  CWD_BLACKLISTED: 9,
  CWD_NOT_EMPTY: 10,
  DOWNLOAD_FAILED: 11,
  EXTRACT_FAILED: 12,
  INSTALL_FAILED: 13,
  // V2: version control verbs
  VERSION_NOT_FOUND: 14,
  ROLLBACK_FAILED: 15,
});

// Re-export emit helpers so existing call sites keep working.
export { emitOk, emitErr, withCode } from "./emit.mjs";

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

export function readPreview() {
  if (!existsSync(PREVIEW_JSON)) return null;
  try { return JSON.parse(readFileSync(PREVIEW_JSON, "utf8")); }
  catch { return null; }
}

export function writePreview(state) {
  ensureDir(STATE_DIR);
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
  try { process.kill(pid, "SIGKILL"); } catch {}
  await sleep(200);
  return { ok: !isAlive(pid), escalated: true };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}
