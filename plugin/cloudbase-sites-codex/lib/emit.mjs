/**
 * Shared emit + error helpers used by every verb.
 *
 * Convention:
 *   stdout — single JSON line, machine-readable.
 *   stderr — single human-readable summary line, prefixed with [cloudbase-sites].
 */

export function emitOk(payload, humanLine) {
  process.stdout.write(JSON.stringify({ ok: true, ...payload }) + "\n");
  if (humanLine) process.stderr.write(`[cloudbase-sites] ${humanLine}\n`);
}

export function emitErr(message, code = 1, hint) {
  const out = { ok: false, code, message };
  if (hint) out.hint = hint;
  process.stdout.write(JSON.stringify(out) + "\n");
  process.stderr.write(`[cloudbase-sites] error (code=${code}): ${message}\n`);
}

export function emitErrPayload(message, code = 1, extra = {}) {
  process.stdout.write(JSON.stringify({ ok: false, code, message, ...extra }) + "\n");
  process.stderr.write(`[cloudbase-sites] error (code=${code}): ${message}\n`);
}

export function withCode(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
