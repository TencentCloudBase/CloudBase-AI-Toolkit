#!/usr/bin/env node
"use strict";

const { spawn, spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

// A Windows first-run updater started through WMI (see spawnOutsideJob) does
// not inherit our environment. Its variables arrive in a dot-prefixed file that
// is applied here, before any constant below reads process.env, and deleted.
// If the file is gone the updater exits: running with the wrong NGE_ROOT or
// registry would be worse than not running at all.
if (process.argv[2] === "--nge-update" && process.argv[4]) {
  const f = process.argv[4];
  try {
    if (!path.basename(f).startsWith(".updater-env-")) throw new Error("bad env file");
    const vars = JSON.parse(fs.readFileSync(f, "utf8"));
    try { fs.rmSync(f, { force: true }); } catch {}
    for (const [k, v] of Object.entries(vars)) if (typeof v === "string") process.env[k] = v;
  } catch { process.exit(0); }
}

// Registries, in the order they are tried on a cold start. The default mirror
// stays first so the normal path for users in China is unchanged; the others
// are only asked after it has failed. Every source serves the same tarball, and
// the direct installer verifies `dist.integrity`, so a mirror cannot alter it.
// An explicit NGE_REGISTRY means "use exactly this" (intranet mirrors,
// compliance): no fallback. NGE_REGISTRIES replaces the default chain.
const DEFAULT_REGISTRIES = [
  "https://mirrors.cloud.tencent.com/npm/",
  "https://registry.npmmirror.com/",
  "https://registry.npmjs.org/",
];
const REGISTRIES = (() => {
  if (process.env.NGE_REGISTRY) return [process.env.NGE_REGISTRY];
  const list = String(process.env.NGE_REGISTRIES || "").split(",")
    .map((x) => x.trim()).filter((x) => /^https?:\/\//i.test(x));
  return list.length ? list : DEFAULT_REGISTRIES;
})();
const REGISTRY = REGISTRIES[0];
// Success rows record which source did the work: direct, direct-m2, direct-m3.
const viaFor = (i) => (i === 0 ? "direct" : `direct-m${i + 1}`);
const ROOT = process.env.NGE_ROOT || path.join(os.homedir(), "cloudbase-mcp", ".nge");
const isWin = process.platform === "win32";

// Numeric env vars: NaN (or a negative value) must never silently disable a
// behaviour. Only CHECK_INTERVAL accepts 0 (tests use it to force a check);
// 0 elsewhere would skip the first-run loop entirely or disable the lock.
const num = (v, d, allowZero = false) => {
  if (v === undefined || v === null || String(v).trim() === "") return d;
  const n = Number(v);
  return Number.isFinite(n) && n >= (allowZero ? 0 : 1) ? n : d;
};
const CHECK_INTERVAL = num(process.env.NGE_CHECK_INTERVAL, 5 * 60 * 1000, true);
const LOCK_STALE = num(process.env.NGE_LOCK_STALE, 10 * 60 * 1000);
const KEEP = Math.max(1, num(process.env.NGE_KEEP, 5));
const FIRST_RUN_TIMEOUT = num(process.env.NGE_FIRST_RUN_TIMEOUT, 120e3);
const TMP_TTL = num(process.env.NGE_TMP_TTL, 10 * 60 * 1000);
// Cold-start budgets per road, so one stuck road cannot eat the whole wait.
const COLD_RESOLVE_MS = num(process.env.NGE_COLD_RESOLVE_MS, 15e3);
const COLD_INSTALL_MS = num(process.env.NGE_COLD_INSTALL_MS, 90e3);
const COLD_NPM_MS = num(process.env.NGE_COLD_NPM_MS, 90e3);
// A cold start still waiting after this long reports `start/slow` once. If no
// start/ok or start/failed follows, the client gave up before we were ready.
const SLOW_MS = num(process.env.NGE_SLOW_MS, 8000);
// How long a cold start keeps retrying while every attempt fails fast and
// nothing is installing. An install in flight is always waited for.
const FAIL_BUDGET = num(process.env.NGE_FAIL_BUDGET, Math.min(30e3, FIRST_RUN_TIMEOUT / 2));
// A child that exits non-zero this soon after spawn counts as a crash.
const CRASH_WINDOW = num(process.env.NGE_CRASH_WINDOW, 5000);
// Self-update: follow the `stable` dist-tag of this package, same major only,
// and only versions published at least this long ago.
const SELF_UPDATE = process.env.NGE_SELF_UPDATE !== "0";
const SELF_MIN_AGE = num(process.env.NGE_SELF_MIN_AGE, 72 * 3600e3);
// The launcher's own `stable` tag changes rarely, and an absent tag would
// otherwise cause a registry lookup plus an update/skipped row every few
// minutes on every machine. Check it on a much longer cadence.
const SELF_CHECK_INTERVAL = num(process.env.NGE_SELF_CHECK_MS, 6 * 3600e3, true);

// Telemetry is on by default. NGE_TELEMETRY=0 / DO_NOT_TRACK turn off the
// network call only; local events.jsonl is always written for --nge-diag.
const TELEMETRY_ENABLED = process.env.NGE_TELEMETRY !== "0" && !process.env.DO_NOT_TRACK;
const TELEMETRY_ENDPOINT = process.env.NGE_TELEMETRY_ENDPOINT || "https://otheve.beacon.qq.com/analytics/v2_upload";
const TELEMETRY_TIMEOUT = num(process.env.NGE_TELEMETRY_TIMEOUT, 1000);
const IS_BACKGROUND = process.argv[2] === "--nge-update";
// On-disk files are read as "first line only": a future release can append
// extra lines without making 1.0.0 mis-read a version or a pid.
const firstLine = (s) => String(s || "").split(/\r?\n/)[0].trim();
// Only directories that look like a version may be pruned.
const VERSION_DIR = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;
// On the failure exit path keep sockets referenced and leave the loop alive
// briefly, otherwise the failure event is lost when process.exit() fires.
let FLUSH_ON_EXIT = false;
const LAUNCHER_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version; }
  catch { return "1.0.0"; }
})();
const LAUNCHER_PKG = "@cloudbase/npm-launcher";
const LAUNCHER_STABLE_SPEC = `${LAUNCHER_PKG}@stable`;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} };

function rotate(file, max = 1 << 20) {
  try {
    if (fs.statSync(file).size > max) {
      // Windows cannot rename over an existing .1 file.
      try { fs.rmSync(file + ".1", { force: true }); } catch {}
      fs.renameSync(file, file + ".1");
    }
  } catch {}
}

// Directory name for a spec; a frozen on-disk contract.
const slugOf = (spec) => String(spec).replace(/[@/\\:]/g, "_");

function context(spec) {
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  const range = (at > 0 && spec.slice(at + 1)) || "latest";
  // Only tags and exact versions are supported. A range containing spaces or
  // <>|*?" would break mkdirSync on Windows; rejecting it here also keeps the
  // directory name (a frozen on-disk contract) predictable.
  if (!/^[A-Za-z0-9._~^+-]+$/.test(range)) {
    console.error(`Unsupported version range: ${range}`);
    process.exit(1);
  }
  const base = path.join(ROOT, slugOf(`${name}@${range}`));
  const c = {
    name, range, base, rawSpec: spec,
    versions: path.join(base, "versions"),
    current: path.join(base, "current"),
    stamp: path.join(base, "last-check"),
    lock: path.join(base, "lock"),
    leases: path.join(base, "leases"),
    logFile: path.join(base, "install.log"),
    eventsFile: path.join(base, "events.jsonl"),
    quarantine: path.join(base, "quarantine"),
    crashes: path.join(base, "crashes"),
    cooldown: path.join(base, "cooldown"),
  };
  try { fs.mkdirSync(c.versions, { recursive: true }); }
  catch (err) {
    console.error(`Cannot create launcher directory: ${err.code || err.message}`);
    process.exit(1);
  }
  rotate(c.logFile);
  rotate(c.eventsFile);
  return c;
}

const log = (c, msg) => {
  try { fs.appendFileSync(c.logFile, `[${new Date().toISOString()}] [${process.pid}] ${msg}\n`); } catch {}
};

// ---- telemetry ------------------------------------------------------------
// Only these 12 keys are reported. They are registered on the beacon side as
// toolkit_launcher; any extra key would be silently dropped by the gateway.
// Device identity lives in common.A2 (the beacon `uin` column), so no extra
// parameter needs registering to join launcher and MCP events.
const MAP_KEYS = [
  "phase", "result", "launcherVersion", "spec", "targetVersion", "fromVersion",
  "osPlatform", "nodeMajor", "client", "coldStart", "reason", "elapsedMs",
];

// Never report a local path, a full command line, or raw npm output.
function safeSpec(spec) {
  return /^(@[^/\\:\s]+\/)?[^@/\\:\s]+@[^@/\\:\s]+$/.test(spec) ? spec.slice(0, 120) : "other";
}
function safeClient() {
  const v = process.env.CLOUDBASE_MCP_CLIENT || "";
  return /^[A-Za-z0-9._-]{1,64}$/.test(v) ? v : "unknown";
}
// Specific error codes first: npm output often contains the registry URL, so a
// broad /registry/i match must stay last or it swallows auth/integrity errors.
function classify(text) {
  const s = String(text || "");
  // An incomplete bundled npm can still answer `npm view` but has no install
  // command module. Keep this ahead of the broad /registry/ match: npm error
  // text usually includes the registry URL and would otherwise swallow it.
  if (/Cannot find module/i.test(s) &&
      /(?:npm[\\/]|lib[\\/]commands|node_modules[\\/]npm)/i.test(s)) return "npm-incomplete";
  if (/ENOENT/i.test(s)) return "enoent";
  if (/ENOTEMPTY/i.test(s)) return "enotempty";
  if (/EPERM/i.test(s)) return "eperm";
  if (/EBUSY/i.test(s)) return "ebusy";
  if (/EACCES/i.test(s)) return "eacces";
  if (/ENOSPC/i.test(s)) return "enospc";
  if (/EJSONPARSE/i.test(s)) return "ejsonparse";
  if (/ETIMEDOUT|TIMED?OUT|ESOCKETTIMEDOUT|SIGKILL|SIGTERM/i.test(s)) return "timeout";
  if (/E401|E403|EAUTH/i.test(s)) return "auth";
  if (/ETARGET|E404/i.test(s)) return "notfound";
  if (/EINTEGRITY/i.test(s)) return "integrity";
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|network/i.test(s)) return "network";
  if (/E500|\b50[0-9]\b|Internal Server Error|registry/i.test(s)) return "registry";
  if (/EEXIST|lock/i.test(s)) return "lock";
  return "other";
}

// ---- device id ------------------------------------------------------------
// Byte-for-byte port of mcp/src/utils/device-id.ts. Keeping the same algorithm
// means toolkit_launcher and toolkit_lifecycle / toolkit_tool_call rows carry
// the same value in the beacon `uin` column and can be joined directly.
// Anchors are system-level immutable ids, never a random fallback: a random
// value would make one machine look like a new device on every launch.
const ANCHOR_TIMEOUT_MS = 1000;
const VIRTUAL_NIC_PREFIXES = [
  "awdl", "llw", "bridge", "utun", "tun", "tap", "veth", "docker", "br-",
  "vmnet", "vboxnet", "vether", "zt", "tailscale", "wg", "lo",
];
const sha256Short = (v) => crypto.createHash("sha256").update(v).digest("hex").substring(0, 32);

function execQuietly(file, args) {
  try {
    return execFileSync(file, args, {
      timeout: ANCHOR_TIMEOUT_MS, encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
    });
  } catch { return undefined; }
}
function readFileQuietly(file) {
  try { return fs.readFileSync(file, "utf8").trim(); } catch { return undefined; }
}
const isUsableMachineId = (v) => /^[0-9a-f]{16,64}$/i.test(v) && !/^0+$/.test(v);

function readSystemAnchor(platform = process.platform) {
  if (platform === "darwin") {
    const out = execQuietly("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
    const m = out && /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out);
    if (m && m[1]) return { value: m[1].trim(), source: "platform-uuid" };
    return undefined;
  }
  if (platform === "win32") {
    const out = execQuietly("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]);
    const m = out && /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{8,})/.exec(out);
    if (m && m[1]) return { value: m[1].trim().toLowerCase(), source: "machine-guid" };
    return undefined;
  }
  for (const candidate of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    const raw = readFileQuietly(candidate);
    if (raw && isUsableMachineId(raw)) return { value: raw.toLowerCase(), source: "machine-id" };
  }
  return undefined;
}

function physicalMacAddresses(interfaces = os.networkInterfaces()) {
  const macs = new Set();
  for (const [name, list] of Object.entries(interfaces)) {
    if (!list) continue;
    const lower = name.toLowerCase();
    if (VIRTUAL_NIC_PREFIXES.some((prefix) => lower.startsWith(prefix))) continue;
    for (const nic of list) {
      const mac = nic && nic.mac && nic.mac.toLowerCase();
      if (!nic || nic.internal || !mac) continue;
      if (mac === "00:00:00:00:00:00" || mac === "ff:ff:ff:ff:ff:ff") continue;
      macs.add(mac);
    }
  }
  return [...macs].sort();
}

function collectHostSignal() {
  let hostname = "unknown-host";
  try { hostname = os.hostname() || hostname; } catch {}
  let cpu = "";
  try { cpu = os.cpus().map((x) => x.model).join(","); } catch {}
  let macs = [];
  try { macs = physicalMacAddresses(); } catch {}
  const parts = [hostname, cpu, ...macs].filter(Boolean);
  return { value: parts.join("|"), source: macs.length > 0 ? "host-fallback" : "host-only" };
}

function computeDeviceId(platform = process.platform) {
  const anchor = readSystemAnchor(platform) || collectHostSignal();
  return { deviceId: sha256Short(anchor.value), source: anchor.source };
}

// Keep the id in process memory, exactly like the MCP reporter does with its
// `deviceId` field: one launcher process serves one client connection, so the
// lifetimes match. Persisting it would freeze the value across OS reinstalls or
// hardware changes while the MCP side recomputes from the current anchor, and
// the two rows would stop sharing a uin. Reading the anchor costs about 10ms
// (the 1s timeout is only a worst-case guard), and nothing is written to disk.
let cachedDeviceId = "";
function deviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  let fresh;
  try { fresh = computeDeviceId().deviceId; }
  catch { fresh = sha256Short("cloudbase-mcp|no-device-signal"); }
  return (cachedDeviceId = fresh);
}

function sendTelemetry(e) {
  try {
    const mapValue = {};
    for (const k of MAP_KEYS) mapValue[k] = e[k];
    const payload = {
      appVersion: "",
      sdkId: "js",
      sdkVersion: "4.5.14-web",
      mainAppKey: "0WEB0AD0GM4PUUU1",
      platformId: 3,
      common: {
        // Same device id as the MCP reporter, so both events share the uin
        // column. A2 is optional on v2_upload; a non-empty value keeps the
        // gateway from dropping rows.
        A2: cachedDeviceId || "cloudbase-npm-launcher",
        A101: `cloudbase-npm-launcher/${LAUNCHER_VERSION}`,
        from: "cloudbase-npm-launcher",
        xDeployEnv: "production",
      },
      events: [{
        eventCode: "toolkit_launcher",
        eventTime: String(Date.now()),
        mapValue,
      }],
    };
    const data = JSON.stringify(payload);
    const url = new URL(TELEMETRY_ENDPOINT);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      timeout: TELEMETRY_TIMEOUT,
    }, (res) => { res.resume(); });
    req.on("error", () => {});
    req.on("timeout", () => { try { req.destroy(); } catch {} });
    req.write(data);
    req.end();
    // http.ClientRequest has no unref(); unref the socket instead. The detached
    // background updater and the failure exit path keep the socket referenced
    // so their events can flush before the process ends.
    if (!IS_BACKGROUND && !FLUSH_ON_EXIT) {
      req.on("socket", (s) => { try { s.unref(); } catch {} });
    }
  } catch {}
}

function emit(c, phase, fields = {}) {
  // Respect the opt-out: with telemetry off we never even read the anchor.
  // Reading the anchor is a telemetry side effect, so a failure there must not
  // abort an install that would otherwise succeed.
  if (TELEMETRY_ENABLED) {
    try { deviceId(); } catch {}
  }
  const e = {
    ts: new Date().toISOString(),
    phase,
    result: fields.result || "ok",
    launcherVersion: LAUNCHER_VERSION,
    spec: safeSpec(c.rawSpec || `${c.name}@${c.range}`),
    targetVersion: fields.targetVersion || "unknown",
    fromVersion: fields.fromVersion || "",
    osPlatform: process.platform,
    nodeMajor: String(process.versions.node.split(".")[0]),
    client: safeClient(),
    coldStart: String(!!fields.coldStart),
    reason: fields.reason || "none",
    elapsedMs: String(Math.max(0, Number(fields.elapsedMs) || 0)),
  };
  try { fs.appendFileSync(c.eventsFile, JSON.stringify(e) + "\n"); } catch {}
  if (TELEMETRY_ENABLED) sendTelemetry(e);
}
// ---------------------------------------------------------------------------

function binOf(c, version) {
  try {
    const dir = path.join(c.versions, version, "node_modules", c.name);
    const pj = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const short = c.name.split("/").pop();
    const rel = typeof pj.bin === "string" ? pj.bin : pj.bin && (pj.bin[short] || Object.values(pj.bin)[0]);
    const p = rel && path.join(dir, rel);
    return p && fs.existsSync(p) ? p : null;
  } catch { return null; }
}

function readCurrent(c) {
  try {
    const version = firstLine(fs.readFileSync(c.current, "utf8"));
    const bin = binOf(c, version);
    return bin ? { version, bin } : null;
  } catch { return null; }
}

// npm-cli.js alone is not enough: some clients ship an npm shim that can
// answer `npm view` but is missing the install command. Treat such a candidate
// as unusable so npm() falls through to the next one / the npm command on PATH,
// instead of failing deep inside install with an unclassifiable error.
function npmCliComplete(cli) {
  const root = path.dirname(path.dirname(cli));
  return fs.existsSync(path.join(root, "lib/commands/install.js"));
}

function npmCli() {
  const candidates = [];
  const p = process.env.npm_execpath;
  if (p) {
    candidates.push(/npx-cli\.js$/.test(p) ? path.join(path.dirname(p), "npm-cli.js") : p);
  }
  // Running npm-cli.js with the current node avoids shell:true on Windows,
  // where spawnSync's timeout only kills cmd.exe and leaves npm holding pipes.
  candidates.push(path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"));
  candidates.push(path.join(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"));
  return candidates.find((x) => /npm-cli\.js$/.test(x) && fs.existsSync(x) && npmCliComplete(x)) || null;
}

// A failed spawn is its own category: the npm process never started, so there
// is no stderr for classify() to read. A timeout beats the spawn error because
// spawnSync reports both on a timed-out child. Exported for the contract tests.
function npmFailureReason(r) {
  const timedOut = !!r.signal || !!(r.error && /ETIMEDOUT|TIMED?OUT/i.test(`${r.error.code || ""} ${r.error.message || ""}`));
  if (timedOut) return "timeout";
  if (r.error) return "spawn-failed";
  const text = String(r.stderr || "");
  return text.trim() ? classify(text) : "empty-output";
}

// ---- failure detail ------------------------------------------------------
// `classify()` answers "which bucket", which was not enough to tell two very
// different environments apart: a missing npm, an unwritable cache and a dead
// proxy all landed in `other`. The detail below adds the facts needed to tell
// them apart while keeping the red line at :123 intact.
//
// This is an ALLOWLIST, not a redactor. Nothing from npm's output is ever
// copied into the result; every token is either a fixed word from the table
// below or a bounded code shape. Trying to scrub arbitrary text is what made
// the earlier "sanitise stderr" idea unsafe -- new output formats always
// outran the rules. Here an unrecognised format yields no token at all, so a
// format nobody has seen cannot leak: the failure mode is losing detail.
//
// npm prints the code as `npm ERR! code EXXX` (v8) or `npm error code EXXX`
// (v9+). The shape is deliberately narrow: letters, a 3-digit HTTP-ish code,
// or two short underscore-joined words. A long mixed-case/underscore blob is
// rejected, which is what stops a token or path from riding this slot.
const NPM_CODE = /npm (?:ERR!|error) code\s+(E(?:[A-Z]{1,14}|[0-9]{3}|[A-Z]{1,9}_[A-Z]{1,9}))\b/;
const HTTP_STATUS = /\bE?(40[0-9]|41[0-9]|42[0-9]|50[0-9])\b/;
// Ordered: the first match wins, so put the specific cases first. Each entry
// maps a recognisable condition to a fixed word -- never to captured text.
const DETAIL_PHRASES = [
  [/ENOTEMPTY|directory not empty/i, "dir-not-empty"],
  [/ENOSPC|no space left/i, "no-space"],
  [/EROFS|read-only file system/i, "read-only-fs"],
  [/EMFILE|too many open files/i, "too-many-files"],
  [/EACCES|permission denied/i, "permission"],
  [/EPERM|operation not permitted/i, "not-permitted"],
  [/EBUSY|resource busy/i, "busy"],
  [/407|proxy authentication/i, "proxy-auth"],
  [/tunneling socket could not be established/i, "proxy-tunnel"],
  [/certificate|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO|ERR_TLS/i, "tls-cert"],
  [/ERR_OSSL|ERR_SSL/i, "ssl"],
  [/ENOTFOUND|EAI_AGAIN|getaddrinfo/i, "dns"],
  [/ECONNRESET|ECONNREFUSED|socket hang up/i, "conn-reset"],
  [/ENETUNREACH|network is unreachable/i, "net-unreach"],
  [/ETIMEDOUT|ESOCKETTIMEDOUT|network timeout/i, "net-timeout"],
  [/EINTEGRITY|integrity check/i, "integrity-fail"],
  [/EBADENGINE|unsupported engine/i, "bad-engine"],
  [/Cannot find module/i, "missing-module"],
  [/EJSONPARSE|Unexpected token .* in JSON|JSON\.parse/i, "json-parse"],
  [/ERR_INVALID_URL|Invalid URL/i, "bad-url"],
  [/EEXIST/i, "exists"],
];

// Fixed shapes only: a spawn error code, a signal name, or a numeric exit code.
function exitFact(r) {
  if (r && r.error && r.error.code) {
    const code = String(r.error.code).replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
    return code ? `spawn-${code}` : null;
  }
  if (r && r.signal) {
    const sig = String(r.signal).replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12);
    return sig ? `sig-${sig}` : null;
  }
  if (r && typeof r.status === "number") return `exit${r.status}`;
  return null;
}

function detailPhrase(text) {
  const s = String(text || "");
  for (const [re, tag] of DETAIL_PHRASES) if (re.test(s)) return tag;
  return null;
}

// `<bucket>/<exit fact>/<npm code>/<phrase>`, at most four tokens, 80 chars.
// Reported in the existing `reason` key -- a registered field whose values are
// free-form, so no new beacon parameter is needed (1.1.0 already shipped new
// values such as `empty-output` this way).
function failureDetail(r, text, bucket) {
  const parts = [bucket];
  const ef = exitFact(r);
  if (ef) parts.push(ef);
  const code = NPM_CODE.exec(String(text || ""));
  if (code) parts.push(code[1]);
  else {
    const hs = HTTP_STATUS.exec(String(text || ""));
    if (hs) parts.push(`http${hs[1]}`);
  }
  const phrase = detailPhrase(text);
  if (phrase && phrase !== bucket) parts.push(phrase);
  return parts.filter(Boolean).slice(0, 4).join("/").slice(0, 80);
}

// ---- direct installer -----------------------------------------------------
// The second road. npm is one way to put a package on disk, not the only one:
// the target package has shipped with no dependencies for every release since
// 1.9.0, so installing it is a tarball download plus an unpack. That removes
// npm -- and every way npm can be broken on a user's machine -- from the cold
// start path. Measured at well under a second against the default mirror.
//
// It runs as a child `node -e` script rather than inline, for two reasons:
//   * the download has to be awaited, but install() is synchronous and
//     sleep() is Atomics.wait, which would block the event loop and deadlock
//     the https callback;
//   * the child's stdout is never connected (`stdio` ignores it), so the
//     MCP JSON-RPC channel on our own stdout cannot be touched.
// The result travels back as an exit code plus a dot-prefixed sentinel file,
// never over stdout, so the stdout guard keeps its meaning.
//
// Only Node built-ins are used, matching the zero-dependency rule.
const DIRECT_HTTP = `
const CONNECT_MS=2500;
const get=(url,headers,n=0)=>new Promise((res,rej)=>{
  let u; try{u=new URL(url);}catch{return rej(new Error("bad-url"));}
  if(u.protocol!=="https:"&&u.protocol!=="http:")return rej(new Error("bad-scheme"));
  const mod=u.protocol==="http:"?http:https;
  let connectTimer=null;
  const clearConnect=()=>{if(connectTimer){clearTimeout(connectTimer);connectTimer=null;}};
  const req=mod.get({hostname:u.hostname,port:u.port||undefined,path:u.pathname+u.search,headers,timeout:30000},(r)=>{
    clearConnect();
    if(r.statusCode>=300&&r.statusCode<400&&r.headers.location&&n<5){r.resume();return get(new URL(r.headers.location,url).href,headers,n+1).then(res,rej);}
    if(r.statusCode!==200){r.resume();return rej(new Error("http-"+r.statusCode));}
    const b=[];let s=0;
    r.on("data",(d)=>{s+=d.length;if(s>MAX_BYTES){r.destroy();rej(new Error("too-big"));}else b.push(d);});
    r.on("end",()=>res(Buffer.concat(b)));
    r.on("error",rej);
  });
  connectTimer=setTimeout(()=>{clearConnect();try{req.destroy();}catch{};rej(new Error("net-timeout"));},CONNECT_MS);
  req.on("error",(e)=>{clearConnect();rej(e);});
  req.on("timeout",()=>{clearConnect();try{req.destroy(new Error("net-timeout"));}catch{}});
});
`;
// Resolve a tag or exact version through the registry's abbreviated packument.
const DIRECT_RESOLVE_SCRIPT = `
const fs=require("fs"),https=require("https"),http=require("http");
const MAX_BYTES=16*1024*1024;
const [,NAME,RANGE,REGISTRY,OUT,MODE]=process.argv;
${DIRECT_HTTP}
(async()=>{
  const base=REGISTRY.endsWith("/")?REGISTRY:REGISTRY+"/";
  // MODE=time asks for the full packument, which carries publish times.
  const pk=JSON.parse((await get(new URL(NAME.replace("/","%2f"),base).href,
    {accept:MODE==="time"?"application/json":"application/vnd.npm.install-v1+json"})).toString("utf8"));
  const tags=pk["dist-tags"]||{};
  const v=tags[RANGE]||((pk.versions&&pk.versions[RANGE])?RANGE:null);
  if(!v||!/^\\d+\\.\\d+\\.\\d+/.test(v))throw new Error("unresolved");
  fs.writeFileSync(OUT,MODE==="time"?v+" "+String((pk.time&&pk.time[v])||""):v);
})().catch(()=>process.exit(1));
`;
// Download, verify and unpack. Every guard npm would normally give us has to
// be made explicit here, so each one is checked on the way in.
const DIRECT_INSTALL_SCRIPT = `
const fs=require("fs"),path=require("path"),zlib=require("zlib"),crypto=require("crypto"),https=require("https"),http=require("http");
const MAX_BYTES=200*1024*1024;
const [,NAME,REGISTRY,TMP,VERSION]=process.argv;
${DIRECT_HTTP}
function untar(buf,root){
  let off=0,long=null,files=0;
  while(off+512<=buf.length){
    const h=buf.subarray(off,off+512);
    if(h.every((b)=>b===0))break;
    const fld=(s,l)=>h.subarray(s,s+l).toString("utf8").replace(/\\0.*$/,"").trim();
    const size=parseInt(fld(124,12)||"0",8)||0;
    const type=String.fromCharCode(h[156])||"0";
    const name=long||fld(0,100),prefix=fld(345,155);
    off+=512;
    const body=buf.subarray(off,off+size);
    off+=Math.ceil(size/512)*512;
    long=null;
    if(type==="L"){long=body.toString("utf8").replace(/\\0.*$/,"");continue;}
    if(type!=="0"&&type!=="")continue;
    const full=(prefix?prefix+"/":"")+name;
    if(!full.startsWith("package/"))continue;
    const rel=full.slice(8);
    if(!rel||rel.split(/[\\\\/]/).some((seg)=>seg===".."||seg==="")||path.isAbsolute(rel))continue;
    const p=path.join(root,rel);
    if(p!==root&&!p.startsWith(root+path.sep))continue;
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.writeFileSync(p,body);
    files++;
  }
  return files;
}
(async()=>{
  const base=REGISTRY.endsWith("/")?REGISTRY:REGISTRY+"/";
  const meta=JSON.parse((await get(new URL(NAME.replace("/","%2f")+"/"+VERSION,base).href,
    {accept:"application/vnd.npm.install-v1+json"})).toString("utf8"));
  if(Object.keys(meta.dependencies||{}).length)throw new Error("has-deps");
  if(!meta.dist||!meta.dist.tarball)throw new Error("no-tarball");
  const tgz=await get(meta.dist.tarball,{});
  const want=meta.dist.integrity;
  if(want){
    const algo=/^sha(\\d+)-/.exec(want);
    if(!algo)throw new Error("bad-integrity");
    const got="sha"+algo[1]+"-"+crypto.createHash("sha"+algo[1]).update(tgz).digest("base64");
    if(got!==want)throw new Error("integrity-fail");
  } else if(meta.dist.shasum){
    if(crypto.createHash("sha1").update(tgz).digest("hex")!==meta.dist.shasum)throw new Error("integrity-fail");
  } else throw new Error("no-integrity");
  const root=path.join(TMP,"node_modules",...NAME.split("/"));
  fs.mkdirSync(root,{recursive:true});
  const n=untar(zlib.gunzipSync(tgz),root);
  if(!n)throw new Error("empty-tar");
  if(!fs.existsSync(path.join(root,"package.json")))throw new Error("no-manifest");
  fs.writeFileSync(path.join(TMP,".direct-ok"),VERSION+" "+n);
})().catch((e)=>{
  try{fs.writeFileSync(path.join(TMP,".direct-err"),String((e&&e.message)||e).slice(0,60));}catch{}
  process.exit(1);
});
`;

// Only the enumerated failure words are kept, so a message from the child can
// never widen what gets reported.
const DIRECT_ERRORS = new Set([
  "bad-url", "bad-scheme", "too-big", "net-timeout", "has-deps", "no-tarball",
  "bad-integrity", "integrity-fail", "no-integrity", "empty-tar", "no-manifest",
  "unresolved",
]);
function directError(tmp) {
  try {
    const raw = firstLine(fs.readFileSync(path.join(tmp, ".direct-err"), "utf8"));
    if (DIRECT_ERRORS.has(raw)) return raw;
    const http = /^http-(\d{3})$/.exec(raw);
    if (http) return `http${http[1]}`;
  } catch {}
  return "failed";
}

// Node 22.21+/24.5+ can tunnel http/https requests through the proxy named by
// HTTP_PROXY / HTTPS_PROXY / NO_PROXY, including CONNECT and credentials in
// the proxy URL. Older runtimes ignore NODE_USE_ENV_PROXY, so a second attempt
// there would only add another timeout.
function envProxySupported() {
  const [maj, min] = process.versions.node.split(".").map(Number);
  return maj > 24 || (maj === 24 && min >= 5) || (maj === 22 && min >= 21);
}
function proxyConfigured() {
  return !!(process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy ||
    process.env.ALL_PROXY || process.env.all_proxy);
}
// Direct first, proxy second. Never skip the direct attempt just because a
// proxy variable exists: stale settings, NO_PROXY overrides and split-tunnel
// setups can still reach the registry directly, and skipping would send them
// back to the slower npm road.
function directProxyPlan() {
  return proxyConfigured() && envProxySupported() ? [false, true] : [false];
}
function directSpawnOpts(useProxy, timeout) {
  const opts = { encoding: "utf8", stdio: ["ignore", "ignore", "ignore"], windowsHide: true, timeout };
  if (useProxy) opts.env = { ...process.env, NODE_USE_ENV_PROXY: "1" };
  return opts;
}

// Returns the raw first line written by the resolve script, or null.
function directResolveRaw(c, registry, useProxy, timeout, mode) {
  const out = path.join(c.base, `.direct-resolve-${process.pid}`);
  try { fs.rmSync(out, { force: true }); } catch {}
  const args = ["-e", DIRECT_RESOLVE_SCRIPT, c.name, c.range, registry, out];
  if (mode) args.push(mode);
  const r = spawnSync(process.execPath, args, directSpawnOpts(useProxy, timeout));
  let line = "";
  try { line = firstLine(fs.readFileSync(out, "utf8")); } catch {}
  try { fs.rmSync(out, { force: true }); } catch {}
  if (r.status === 0 && line) return line;
  log(c, `direct resolve failed (exit ${r.status}${useProxy ? " via proxy" : ""}) @ ${registry}`);
  return null;
}
function directResolve(c, useProxy = false, registry = REGISTRY, timeout = 60e3) {
  const v = directResolveRaw(c, registry, useProxy, timeout);
  return v && VERSION_DIR.test(v) ? v : null;
}
function directResolveBoth(c, registry = REGISTRY, timeout = 60e3) {
  for (const useProxy of directProxyPlan()) {
    const v = directResolve(c, useProxy, registry, timeout);
    if (v) return v;
  }
  return null;
}

function directInstall(c, version, tmp, useProxy = false, registry = REGISTRY, timeout = 5 * 60e3) {
  // Sentinels belong to one attempt only. Without clearing them the proxy
  // retry could read the first attempt's stamp or error.
  for (const name of [".direct-ok", ".direct-err"]) {
    try { fs.rmSync(path.join(tmp, name), { force: true }); } catch {}
  }
  const r = spawnSync(process.execPath, ["-e", DIRECT_INSTALL_SCRIPT, c.name, registry, tmp, version],
    directSpawnOpts(useProxy, timeout));
  const stamp = path.join(tmp, ".direct-ok");
  const ok = r.status === 0 && fs.existsSync(stamp);
  if (ok) {
    let detail = "";
    try { detail = firstLine(fs.readFileSync(stamp, "utf8")); } catch {}
    try { fs.rmSync(stamp, { force: true }); } catch {}
    log(c, `direct install ok${useProxy ? " via proxy" : ""}: ${detail}`);
    return { ok: true, reason: "none" };
  }
  const reason = directError(tmp);
  try { fs.rmSync(path.join(tmp, ".direct-err"), { force: true }); } catch {}
  log(c, `direct install failed${useProxy ? " via proxy" : ""}: ${reason}`);
  return { ok: false, reason };
}
function directInstallBoth(c, version, tmp, registry = REGISTRY, timeout = 5 * 60e3) {
  let last = { ok: false, reason: "none" };
  for (const useProxy of directProxyPlan()) {
    const r = directInstall(c, version, tmp, useProxy, registry, timeout);
    if (r.ok) return r;
    last = r;
  }
  return last;
}

// stdout belongs to the MCP JSON-RPC channel. All npm output goes to the log file.
function npm(c, args, cwd, budget = 5 * 60 * 1000) {
  const full = [...args, `--registry=${REGISTRY}`, "--no-audit", "--no-fund", "--loglevel=error"];
  const opts = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: budget };
  const cli = npmCli();
  const r = cli
    ? spawnSync(process.execPath, [cli, ...full], opts)
    : spawnSync(isWin ? "npm.cmd" : "npm", full, { ...opts, shell: isWin });
  const ok = r.status === 0 && !r.error;
  const bucket = ok ? "none" : npmFailureReason(r);
  const errText = `${r.stderr || ""}${r.error ? r.error.message : ""}`;
  // `reason` carries the detailed form; `bucket` stays available for callers
  // that group failures the 1.1.0 way.
  const reason = ok ? "none" : failureDetail(r, errText, bucket);
  log(c, `npm ${args.join(" ")} -> ${r.status} [platform=${process.platform} node=${process.version} npm=${process.env.npm_execpath || "npm"} npmCli=${cli || "none"}${ok ? "" : ` reason=${reason}`}]\n${r.stdout || ""}${r.stderr || ""}${r.error ? r.error.message : ""}`);
  return { ok, out: r.stdout || "", errText, reason, bucket };
}

// Return the real failure category alongside the version. The caller must not
// hard-code "registry": `npm view` can fail for ENOENT, an incomplete npm, a
// network error, or an empty response, and each needs a different fix.
// On a cold start the registry is asked directly first: there is no installed
// version to fall back on, so the fastest working road wins.
// On a cold start every registry in the chain is asked in turn; the index of
// the one that answered is returned so the install uses the same source (a
// lagging mirror may not have the version another one resolved yet).
function resolveVersion(c, directFirst = false) {
  if (directFirst) {
    for (let i = 0; i < REGISTRIES.length; i++) {
      const direct = directResolveBoth(c, REGISTRIES[i], COLD_RESOLVE_MS);
      if (direct) return { version: direct, reason: "none", registryIndex: i };
    }
  }
  const r = npm(c, ["view", `${c.name}@${c.range}`, "version", "--json"], c.base,
    directFirst ? COLD_NPM_MS : undefined);
  if (!r.ok) {
    // npm could not answer. Ask the registry ourselves before giving up,
    // unless that was already tried above.
    if (!directFirst) {
      for (let i = 0; i < REGISTRIES.length; i++) {
        const direct = directResolveBoth(c, REGISTRIES[i]);
        if (direct) return { version: direct, reason: "none", registryIndex: i };
      }
    }
    return { version: null, reason: r.reason };
  }
  try {
    const v = JSON.parse(r.out);
    const version = Array.isArray(v) ? v[v.length - 1] : v;
    if (!version || typeof version !== "string") return { version: null, reason: "empty-output" };
    return { version, reason: "none" };
  } catch { return { version: null, reason: "empty-output" }; }
}

// Returns { ok, reason } so the caller can report the real failure category
// instead of hard-coding one on the update / fallback events.
function install(c, version, coldStart = false, firstRegistry = 0) {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  if (binOf(c, version)) {
    emit(c, "install", { result: "reused", targetVersion: version, coldStart, elapsedMs: elapsed() });
    return { ok: true, reason: "none" };
  }
  // Each process installs into its own temporary directory. No shared node_modules.
  const tmp = path.join(c.versions, `.tmp-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, "package.json"), '{"private":true}');
  // Cold start: no installed version to fall back on, so take the road that
  // does not depend on npm being usable. npm still runs if this one fails.
  // Warm start keeps npm first -- that path already succeeds for everyone.
  let r = { ok: false, reason: "none" };
  let via = "npm";
  if (coldStart) {
    // Start at the registry that resolved the version, then the rest in order.
    for (let i = Math.max(0, firstRegistry); i < REGISTRIES.length && !r.ok; i++) {
      const direct = directInstallBoth(c, version, tmp, REGISTRIES[i], COLD_INSTALL_MS);
      if (direct.ok) { r = { ok: true, reason: "none", out: "", errText: "" }; via = viaFor(i); }
    }
  }
  if (!r.ok) r = npm(c, ["install", `${c.name}@${version}`, "--no-package-lock"], tmp,
    coldStart ? COLD_NPM_MS : undefined);
  if (!r.ok && !coldStart) {
    // npm failed. Try the direct road before reporting a failure, so a broken
    // npm on a warm start cannot stop an update either.
    for (let i = 0; i < REGISTRIES.length && !r.ok; i++) {
      const direct = directInstallBoth(c, version, tmp, REGISTRIES[i]);
      if (direct.ok) {
        r = { ok: true, reason: "none", out: "", errText: "" };
        via = i === 0 ? "direct-after-npm" : `direct-m${i + 1}-after-npm`;
      }
    }
  }
  if (!r.ok) {
    const reason = r.reason;
    emit(c, "install", { result: "failed", targetVersion: version, reason, coldStart, elapsedMs: elapsed() });
    rm(tmp);
    return { ok: false, reason };
  }
  const dest = path.join(c.versions, version);
  let lastErr = "";
  // Exponential backoff: Defender / antivirus can hold freshly unpacked files
  // for well over the old 1.5s window. A half-written dest is moved aside first.
  for (let i = 0, wait = 100; i < 10; i++, wait = Math.min(wait * 2, 2000)) {
    try {
      fs.renameSync(tmp, dest);
      // `reason` on a success row records which installer did the work, so the
      // direct road can be measured without registering a new beacon key.
      emit(c, "install", { result: "ok", targetVersion: version, reason: via, coldStart, elapsedMs: elapsed() });
      return { ok: true, reason: "none" };
    } catch (err) {
      lastErr = `${err.code || ""} ${err.message || ""}`;
      if (binOf(c, version)) {
        rm(tmp);
        emit(c, "install", { result: "reused", targetVersion: version, coldStart, elapsedMs: elapsed() });
        return { ok: true, reason: "none" };
      }
      // Never move aside a version that a running window still holds a lease on.
      // Antivirus can briefly make package.json unreadable, so binOf() may
      // return null for a perfectly good directory: re-check after a pause.
      if (fs.existsSync(dest) && !versionsInUse(c).has(version)) {
        sleep(200);
        if (!binOf(c, version)) {
          try { fs.renameSync(dest, path.join(c.versions, `.trash-${Date.now()}-${version}`)); } catch {}
        }
      }
      sleep(wait);
    }
  }
  const reason = classify(lastErr);
  emit(c, "install", { result: "failed", targetVersion: version, reason, coldStart, elapsedMs: elapsed() });
  rm(tmp);
  return { ok: false, reason };
}

function setCurrent(c, version) {
  // Dot-prefixed so prune can reclaim it if rename fails on Windows.
  const t = path.join(c.base, `.current.${process.pid}`);
  fs.writeFileSync(t, version);
  fs.renameSync(t, c.current);
}

// ---- version leases -------------------------------------------------------
// A long-running MCP window may still be using an older version. prune must not
// delete a version whose launcher process is alive, even if KEEP is exceeded.
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === "EPERM"; }
}

function acquireLease(c, version, pid = process.pid) {
  try {
    fs.mkdirSync(c.leases, { recursive: true });
    const f = path.join(c.leases, String(pid));
    fs.writeFileSync(f + ".tmp", version);
    fs.renameSync(f + ".tmp", f);
    process.on("exit", () => { try { fs.unlinkSync(f); } catch {} });
  } catch {}
}

function versionsInUse(c) {
  const used = new Set();
  let files = [];
  try { files = fs.readdirSync(c.leases); } catch { return used; }
  for (const f of files) {
    if (!/^\d+$/.test(f)) continue;
    const p = path.join(c.leases, f);
    if (alive(Number(f))) {
      try { used.add(firstLine(fs.readFileSync(p, "utf8"))); } catch {}
    } else {
      rm(p); // lease left behind by a kill -9
    }
  }
  return used;
}
// ---------------------------------------------------------------------------

function prune(c, keepVersion) {
  const inUse = versionsInUse(c);
  let all = [];
  try {
    all = fs.readdirSync(c.versions).map((d) => {
      try { return { d, t: fs.statSync(path.join(c.versions, d)).mtimeMs }; }
      catch { return null; }
    }).filter(Boolean);
  } catch { return; }
  all.filter((x) => x.d.startsWith(".") && Date.now() - x.t > TMP_TTL)
    .forEach((x) => rm(path.join(c.versions, x.d)));
  // Anything that is not a version directory is left alone: a future release
  // may store metadata here and 1.0.0 must not delete it.
  all.filter((x) => !x.d.startsWith(".") && VERSION_DIR.test(x.d)
    && x.d !== keepVersion && !inUse.has(x.d))
    .sort((a, b) => b.t - a.t).slice(KEEP - 1)
    .forEach((x) => {
      const trash = path.join(c.versions, `.trash-${Date.now()}-${x.d}`);
      try {
        fs.renameSync(path.join(c.versions, x.d), trash);
        rm(trash);
      } catch {}
    });
  // A setCurrent() temp file whose rename failed, or a WMI env file nobody
  // picked up, is never reused; drop it once no live process could want it.
  try {
    for (const f of fs.readdirSync(c.base)) {
      if (!f.startsWith(".current.") && !f.startsWith(".updater-env-")) continue;
      const p = path.join(c.base, f);
      try { if (Date.now() - fs.statSync(p).mtimeMs > TMP_TTL) rm(p); } catch {}
    }
  } catch {}
}

function lockStale(c) {
  try {
    const age = Date.now() - fs.statSync(c.lock).mtimeMs;
    if (age > LOCK_STALE) return true;
    let pid = 0;
    try { pid = Number(firstLine(fs.readFileSync(path.join(c.lock, "pid"), "utf8"))); } catch {}
    if (!pid) return age > 5000; // just created, or a legacy lock without pid
    try { process.kill(pid, 0); return false; }
    catch (e) { return e.code === "ESRCH"; }
  } catch { return false; }
}

function tryLock(c) {
  for (let i = 0; i < 2; i++) {
    try {
      fs.mkdirSync(c.lock);
      try { fs.writeFileSync(path.join(c.lock, "pid"), String(process.pid)); } catch {}
      return true;
    } catch (e) {
      if (e.code !== "EEXIST" || !lockStale(c)) return false;
      rm(c.lock); // two processes may both reclaim; worst case is one extra download
    }
  }
  return false;
}

// ---- quarantine, crash rollback, cooldown -------------------------------------
// All three live in new files next to the frozen layout; 1.0.0-1.2.0 never read
// them, so an older launcher on the same machine is unaffected.

// Versions that crashed on start or failed their self-test. One per line.
function quarantined(c) {
  try {
    return new Set(fs.readFileSync(c.quarantine, "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  } catch { return new Set(); }
}
function addQuarantine(c, version) {
  try {
    const keep = [...quarantined(c)].filter((v) => v !== version).slice(-19);
    fs.writeFileSync(c.quarantine, [...keep, version].join("\n") + "\n");
  } catch {}
}

// Installed, runnable and not quarantined, newest first.
function usableVersions(c, except) {
  const bad = quarantined(c);
  let dirs = [];
  try { dirs = fs.readdirSync(c.versions); } catch { return []; }
  return dirs
    .filter((d) => VERSION_DIR.test(d) && d !== except && !bad.has(d) && binOf(c, d))
    .map((d) => { try { return { d, t: fs.statSync(path.join(c.versions, d)).mtimeMs }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => b.t - a.t)
    .map((x) => x.d);
}

// Numeric x.y.z compare; a prerelease sorts below its release.
function cmpVersion(a, b) {
  const pa = String(a).split(/[-+]/)[0].split(".").map(Number);
  const pb = String(b).split(/[-+]/)[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  const ra = /-/.test(a), rb = /-/.test(b);
  return ra === rb ? 0 : ra ? -1 : 1;
}
const majorOf = (v) => Number(String(v).split(".")[0]);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// Consecutive failed cold-start connections on this machine (counted by the
// foreground when it gives up, not per attempt). From the third one on, a
// reconnect gets one attempt instead of a backoff loop: a machine that cannot
// install must not hammer the registry (one device logged 1,552 failures in
// 20 hours), while a recovered network still heals on the next reconnect.
function coolingDown(c) {
  const s = readJson(c.cooldown);
  return !!(s && Number(s.until) > Date.now());
}
function recordColdFailure(c) {
  const s = readJson(c.cooldown) || { failures: 0, until: 0 };
  const failures = (Number(s.failures) || 0) + 1;
  const until = failures >= 3 ? Date.now() + Math.min(30 * 60e3, 60e3 * 2 ** (failures - 3)) : 0;
  try { fs.writeFileSync(c.cooldown, JSON.stringify({ failures, until })); } catch {}
}
function clearColdFailures(c) { rm(c.cooldown); }

function update(c) {
  if (c.name === LAUNCHER_PKG) return selfUpdate(c);
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  const from = readCurrent(c);
  const fromVersion = from ? from.version : "";
  const coldStart = !from;
  const resolved = resolveVersion(c, coldStart);
  const version = resolved.version;
  if (!version) {
    const reason = resolved.reason;
    emit(c, "update", { result: "skipped", reason, fromVersion, coldStart, elapsedMs: elapsed() });
    if (fromVersion) {
      emit(c, "fallback", { result: "fallback", reason, targetVersion: fromVersion, coldStart, elapsedMs: elapsed() });
    }
    return log(c, "resolve failed, keep current");
  }
  // A version that crashed on start here is not switched back to; the next
  // release clears the way. The cold path has nothing to fall back on, so it
  // still installs (otherwise the machine could never start at all).
  if (!coldStart && quarantined(c).has(version)) {
    try { fs.writeFileSync(c.stamp, String(Date.now())); } catch {}
    emit(c, "update", { result: "skipped", reason: "quarantined", targetVersion: version, fromVersion, elapsedMs: elapsed() });
    return log(c, `${version} is quarantined, keep current`);
  }
  // Nothing to install: refresh the check stamp and leave the metrics alone.
  if (version === fromVersion) {
    try { fs.writeFileSync(c.stamp, String(Date.now())); } catch {}
    return;
  }
  const installed = install(c, version, coldStart, resolved.registryIndex || 0);
  if (!installed.ok) {
    emit(c, "update", { result: "failed", targetVersion: version, fromVersion, reason: installed.reason, coldStart, elapsedMs: elapsed() });
    if (fromVersion) {
      emit(c, "fallback", { result: "fallback", reason: installed.reason, targetVersion: fromVersion, coldStart, elapsedMs: elapsed() });
    }
    return log(c, `install ${version} failed, keep current`);
  }
  try {
    setCurrent(c, version);
    fs.writeFileSync(c.stamp, String(Date.now()));
  } catch (err) {
    // Do not report success or prune if current never switched: pruning could
    // remove the version that running windows still use.
    const reason = classify(`${err.code || ""} ${err.message || ""}`);
    emit(c, "update", { result: "failed", targetVersion: version, fromVersion, reason, coldStart, elapsedMs: elapsed() });
    return log(c, `setCurrent ${version} failed, keep current`);
  }
  clearColdFailures(c);
  emit(c, "update", { result: "ok", targetVersion: version, fromVersion, coldStart, elapsedMs: elapsed() });
  prune(c, version);
}

// ---- self-update -------------------------------------------------------------
// The launcher installs a newer copy of itself the same way it installs the
// target package, into ROOT/@cloudbase_npm-launcher_stable/. The pinned copy a
// client starts then hands over to it (see delegate()). This is what lets a
// launcher fix reach users without rewriting every pinned config again.
//
// Guard rails, all checked here before anything is switched:
//   * only the `stable` dist-tag, which maintainers move by hand after a
//     release has proven itself; moving it back rolls every machine back;
//   * same major version only;
//   * published at least SELF_MIN_AGE ago (72 h by default);
//   * never a version quarantined on this machine;
//   * the new copy must pass `--nge-selftest` before `current` points at it.
function selfUpdate(c) {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  try { fs.writeFileSync(c.stamp, String(Date.now())); } catch {}
  const from = readCurrent(c);
  const fromVersion = from ? from.version : "";
  let raw = null, idx = 0;
  for (; idx < REGISTRIES.length && !raw; idx++) raw = directResolveRaw(c, REGISTRIES[idx], false, COLD_RESOLVE_MS, "time");
  idx -= 1;
  const [version, published] = String(raw || "").split(" ");
  if (!version || !VERSION_DIR.test(version)) {
    emit(c, "update", { result: "skipped", reason: "unresolved", fromVersion, elapsedMs: elapsed() });
    return log(c, "self-update: stable tag not resolved");
  }
  const age = Date.now() - Date.parse(published || "");
  const hold = majorOf(version) !== majorOf(LAUNCHER_VERSION) || !(age >= SELF_MIN_AGE)
    || quarantined(c).has(version);
  // `stable` moved back to (or below) the copy the client started: stop
  // delegating. Nothing needs installing for that.
  if (!hold && cmpVersion(version, LAUNCHER_VERSION) <= 0) {
    if (fromVersion) { rm(c.current); emit(c, "update", { result: "ok", targetVersion: version, fromVersion, elapsedMs: elapsed() }); }
    return log(c, `self-update: stable ${version} is not newer than ${LAUNCHER_VERSION}`);
  }
  if (hold) {
    emit(c, "update", { result: "skipped", reason: "self-hold", targetVersion: version, fromVersion, elapsedMs: elapsed() });
    return log(c, `self-update: holding ${version} (age ${Math.round(age / 3600e3)}h)`);
  }
  if (version === fromVersion) return;
  const installed = install(c, version, true, idx);
  if (!installed.ok) {
    emit(c, "update", { result: "failed", targetVersion: version, fromVersion, reason: installed.reason, elapsedMs: elapsed() });
    return log(c, `self-update: install ${version} failed`);
  }
  const bin = binOf(c, version);
  const r = bin ? spawnSync(process.execPath, [bin, "--nge-selftest"], {
    encoding: "utf8", stdio: ["ignore", "ignore", "pipe"], windowsHide: true, timeout: 5000,
    env: { ...process.env, NGE_DELEGATED: LAUNCHER_VERSION },
  }) : null;
  if (!r || r.status !== 0 || !String(r.stderr || "").includes(`nge-selftest-ok ${version}`)) {
    addQuarantine(c, version);
    emit(c, "update", { result: "failed", targetVersion: version, fromVersion, reason: "selftest", elapsedMs: elapsed() });
    return log(c, `self-update: ${version} failed its self-test, quarantined`);
  }
  try { setCurrent(c, version); } catch (err) {
    emit(c, "update", { result: "failed", targetVersion: version, fromVersion, reason: classify(`${err.code || ""}`), elapsedMs: elapsed() });
    return;
  }
  emit(c, "update", { result: "ok", targetVersion: version, fromVersion, elapsedMs: elapsed() });
  prune(c, version);
}

// Hand this run over to a newer self-updated launcher, if one is ready.
// Returns true when the delegate took over. A delegate that throws while
// loading or starting is quarantined and this copy carries on: the pinned
// launcher is always the floor.
function delegate() {
  if (!SELF_UPDATE || process.env.NGE_DELEGATED) return false;
  // Cheap existence check first: no self-updated copy means nothing to do, and
  // context() would create directories on every launch.
  if (!fs.existsSync(path.join(ROOT, slugOf(LAUNCHER_STABLE_SPEC), "current"))) return false;
  let lc;
  try { lc = context(LAUNCHER_STABLE_SPEC); } catch { return false; }
  const cur = readCurrent(lc);
  if (!cur || cmpVersion(cur.version, LAUNCHER_VERSION) <= 0
    || majorOf(cur.version) !== majorOf(LAUNCHER_VERSION) || quarantined(lc).has(cur.version)) return false;
  process.env.NGE_DELEGATED = LAUNCHER_VERSION;
  try {
    const mod = require(cur.bin);
    if (!mod || typeof mod.main !== "function") throw new Error("no main");
    mod.main();
    return true;
  } catch (err) {
    delete process.env.NGE_DELEGATED;
    addQuarantine(lc, cur.version);
    log(lc, `delegate ${cur.version} failed, quarantined: ${err && err.message}`);
    emit(lc, "fallback", { result: "fallback", reason: "delegate-failed", targetVersion: cur.version });
    return false;
  }
}

function lockedUpdate(c, opts = {}) {
  if (!tryLock(c)) {
    if (!opts.quiet) emit(c, "update", { result: "skipped", reason: "lock" });
    return false;
  }
  try { update(c); } finally { rm(c.lock); }
  return true;
}

// Variables the updater needs when it cannot inherit our environment.
const UPDATER_ENV = /^(NGE_|npm_|DO_NOT_TRACK$|CLOUDBASE_MCP_CLIENT$|INTEGRATION_IDE$|(HTTPS?|NO|ALL)_PROXY$|NODE_EXTRA_CA_CERTS$|PATH$|PATHEXT$|SystemRoot$|ComSpec$|USERPROFILE$|HOMEDRIVE$|HOMEPATH$|APPDATA$|LOCALAPPDATA$|TEMP$|TMP$)/i;
// `npm_` also matches NPM_TOKEN and .npmrc-derived auth keys, and a proxy URL
// may carry user:pass@. None of that may reach the on-disk env file.
const SECRET_KEY = /(TOKEN|SECRET|PASSWORD|PASSWD|AUTH|CREDENTIAL|APIKEY|API_KEY|PRIVATE_KEY)/i;

function stripUserinfo(value) {
  return String(value).replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/i, "$1");
}

function collectUpdaterEnv() {
  const vars = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v !== "string") continue;
    if (!UPDATER_ENV.test(k) || SECRET_KEY.test(k)) continue;
    vars[k] = stripUserinfo(v);
  }
  return vars;
}

// Windows clients often run MCP servers inside a Job object with
// KILL_ON_JOB_CLOSE. `detached: true` does not leave the job, so a first-run
// installer spawned normally dies with the client and every reconnect starts
// the download from scratch. A process created through WMI is parented to the
// WMI provider host, not to us, and is outside the client's job.
// Used only for the first install (once per machine); warm-start update checks
// stay on the plain spawn so a usable version still starts immediately.
function spawnOutsideJob(c, spec) {
  if (/["\r\n]/.test(spec + process.execPath + __filename)) return false;
  const envFile = path.join(c.base, `.updater-env-${process.pid}-${Date.now()}.json`);
  try {
    fs.writeFileSync(envFile, JSON.stringify(collectUpdaterEnv()), { mode: 0o600 });
  } catch { return false; }
  // Values travel in environment variables, so the script itself has no quoting.
  const script = [
    "$ErrorActionPreference='Stop'",
    "$si=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}",
    "$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$env:NGE_WMI_CMD;CurrentDirectory=$env:NGE_WMI_CWD;ProcessStartupInformation=$si}",
    "if($r.ReturnValue -ne 0){exit 3}",
    "[Console]::Out.Write($r.ProcessId)",
  ].join(";");
  const exe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const cmd = `"${process.execPath}" "${__filename}" --nge-update "${spec}" "${envFile}"`;
  const r = spawnSync(exe, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, NGE_WMI_CMD: cmd, NGE_WMI_CWD: c.base },
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: 20000,
  });
  const pid = String(r.stdout || "").trim();
  const ok = r.status === 0 && /^\d+$/.test(pid);
  log(c, ok ? `updater started outside the job: pid ${pid}`
    : `WMI updater failed (status=${r.status}), using plain spawn: ${String(r.stderr || "").slice(0, 300)}${r.error ? r.error.message : ""}`);
  // Without its env file a stray WMI process exits on its own (see the top of this file).
  if (!ok) rm(envFile);
  return ok;
}

function spawnUpdater(c, spec, opts = {}) {
  if (opts.outsideJob && isWin && process.env.NGE_WIN_BREAKAWAY !== "0" && spawnOutsideJob(c, spec)) {
    return true;
  }
  try {
    const bg = spawn(process.execPath, [__filename, "--nge-update", spec],
      { detached: true, stdio: "ignore", windowsHide: true });
    bg.on("error", () => {});
    bg.unref();
    return true;
  } catch { return false; }
}

function installerBusy(c) {
  return fs.existsSync(c.lock) && !lockStale(c);
}

// The foreground waits but never runs npm, so read the last real failure from
// the local event log. Events older than `since` belong to an earlier session
// (yesterday's ENOSPC, say) and must not be blamed for today's slow download.
// Returns null when this session has recorded no terminal failure yet -- the
// caller uses that to tell "still working" from "already given up".
function failureSince(c, since) {
  try {
    const lines = fs.readFileSync(c.eventsFile, "utf8").trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      let e;
      try { e = JSON.parse(lines[i]); } catch { continue; }
      const ts = Date.parse(e.ts);
      if (!Number.isFinite(ts) || ts < since) break;
      const failed = (e.phase === "install" || e.phase === "update") && e.result === "failed";
      const skipped = e.phase === "update" && e.result === "skipped"
        && e.reason && e.reason !== "lock" && e.reason !== "none";
      if (failed || skipped) {
        return { reason: e.reason && e.reason !== "none" ? e.reason : "other", ts };
      }
    }
  } catch {}
  return null;
}

// Only a genuine wait expiry should be reported as timeout.
function lastFailureReason(c, since) {
  const f = failureSince(c, since);
  return f ? f.reason : "timeout";
}

// A bare "Failed to install" sends the user to a log file to find out what
// happened. The reason is already known by then, so say it, and say the one
// thing worth trying. Keyed on the detail tokens from failureDetail(), so a
// reason like `network/exit1/EAI_AGAIN/dns` matches on `dns`.
const FAILURE_HINTS = [
  [/\bdns\b|ENOTFOUND|EAI_AGAIN/, "Cannot resolve the registry host. Check DNS or your network connection."],
  [/proxy-auth|http407/, "The HTTP proxy rejected the request. Check the proxy credentials in HTTPS_PROXY / npm config."],
  [/proxy-tunnel/, "The HTTP proxy refused to tunnel. Check HTTPS_PROXY, or unset it to connect directly."],
  [/tls-cert|\bssl\b/, "The TLS certificate was rejected. A corporate proxy may be re-signing traffic; set NODE_EXTRA_CA_CERTS to its root certificate."],
  [/conn-reset|net-unreach/, "The connection to the registry was dropped. Check network access to the registry."],
  [/net-timeout|\btimeout\b/, `The download did not finish in time. Retry, or set NGE_REGISTRY to a closer mirror (current: ${REGISTRY}).`],
  [/no-space/, "The disk is full. Free some space and retry."],
  [/read-only-fs/, "The install directory is read-only. Set NGE_ROOT to a writable path."],
  [/permission|EACCES|not-permitted|EPERM/, `No permission to write the install directory. Check ownership of ${ROOT}, or set NGE_ROOT to a writable path.`],
  [/too-many-files|EMFILE/, "Too many open files. Raise the open-file limit and retry."],
  [/\bauth\b|http401|http403/, "The registry rejected the credentials. Check the auth token for this registry in .npmrc."],
  [/notfound|http404/, "The registry has no such package or version. Check the package name and the registry URL."],
  [/integrity-fail/, "The downloaded package failed its checksum. A proxy or mirror may be serving altered content."],
  [/bad-engine/, "The installed Node version is not supported by the package. Upgrade Node (>= 18)."],
  [/missing-module|npm-incomplete/, "The bundled npm is incomplete. Install a full npm, or let the launcher install without npm."],
  [/dir-not-empty|ENOTEMPTY|\bbusy\b|EBUSY/, "A leftover directory is in the way, often held by antivirus. Retry, or remove the install directory."],
  [/has-deps/, "The package now declares dependencies, so it cannot be installed without npm. Install a working npm."],
  [/http5\d\d|\bregistry\b/, `The registry returned a server error. Retry later, or set NGE_REGISTRY to another mirror (current: ${REGISTRY}).`],
  [/spawn-/, "npm could not be started on this machine. The launcher installs without npm when the package allows it; see the log for why that did not happen."],
  [/empty-output/, "The registry returned an empty response. Retry, or set NGE_REGISTRY to another mirror."],
];
function startFailureMessage(c, spec, reason) {
  const hint = (FAILURE_HINTS.find(([re]) => re.test(reason)) || [])[1];
  return [
    `Failed to install ${spec} (${reason}).`,
    hint || "See the log for details.",
    `Log: ${c.logFile}`,
    `Diagnostics: npx ${LAUNCHER_PKG}@${LAUNCHER_VERSION} --nge-diag ${spec}`,
  ].join("\n");
}

function needCheck(c, interval = CHECK_INTERVAL) {
  let last = NaN;
  try { last = Number(firstLine(fs.readFileSync(c.stamp, "utf8"))); } catch {}
  const now = Date.now();
  return !Number.isFinite(last) || now - last > interval || last > now + 60e3;
}

// Only a child that really exits non-zero inside the crash window is a broken
// release. A signal (SIGKILL, Ctrl-C, a client killing the process) has no
// numeric code, and a clean disconnect exits 0; neither may quarantine a
// working version.
function crashExit(code, signal, elapsedMs) {
  return typeof code === "number" && code !== 0 && !signal && elapsedMs < CRASH_WINDOW;
}

function run(c, version, bin, args) {
  const child = spawn(process.execPath, [bin, ...args], { stdio: "inherit", windowsHide: true });
  // If this launcher is kill -9'd, the MCP child keeps the client's pipes and
  // keeps running. Its own lease protects the version it is using.
  if (child.pid) acquireLease(c, version, child.pid);
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(s, () => { try { child.kill(s); } catch {} });
  }
  // Crash detection. A child that exits non-zero within CRASH_WINDOW of being
  // spawned never got going (a clean client disconnect exits 0, a signal has no
  // code). Twice in a row for the same version and it is quarantined and
  // `current` goes back to the newest other usable version, so the next
  // connection starts something that works. The client's stdin is already
  // consumed by the dead child, so this connection cannot be retried in place.
  const spawnedAt = Date.now();
  const settle = setTimeout(() => {
    const s = readJson(c.crashes);
    if (s && s.version === version) rm(c.crashes);
  }, CRASH_WINDOW);
  try { settle.unref(); } catch {}
  child.on("exit", (code, signal) => {
    const status = code ?? (signal ? 1 : 0);
    if (crashExit(code, signal, Date.now() - spawnedAt) && crashedAgain(c, version)) {
      FLUSH_ON_EXIT = true;
      setTimeout(() => process.exit(status), TELEMETRY_TIMEOUT + 200);
      return;
    }
    process.exit(status);
  });
  child.on("error", (e) => { console.error(e.message); process.exit(1); });
}

// Returns true when this crash triggered a rollback (and telemetry must flush).
function crashedAgain(c, version) {
  const s = readJson(c.crashes);
  const n = s && s.version === version ? (Number(s.n) || 0) + 1 : 1;
  if (n < 2) {
    try { fs.writeFileSync(c.crashes, JSON.stringify({ version, n })); } catch {}
    return false;
  }
  rm(c.crashes);
  const prev = usableVersions(c, version)[0];
  // Without an older working copy there is nothing to roll back to; quarantining
  // would only turn the next start into a cold install of the same version.
  if (!prev) return false;
  addQuarantine(c, version);
  try { setCurrent(c, prev); } catch { return false; }
  log(c, `${version} crashed on start twice, rolled back to ${prev}`);
  emit(c, "fallback", { result: "fallback", reason: "crash-rollback", targetVersion: prev, fromVersion: version });
  console.error(`${c.name}@${version} exited right after starting, twice. Switched back to ${prev}; reconnect to use it.`);
  return true;
}

// Node < 18 is outside `engines`. Say so plainly instead of failing somewhere
// deep inside an install, and report it at most once a day per machine.
function nodeUnsupported(spec) {
  if (Number(process.versions.node.split(".")[0]) >= 18) return false;
  console.error(`${LAUNCHER_PKG} needs Node.js 18 or newer; this is ${process.version}. Upgrade Node.js and reconnect.`);
  try {
    const c = context(spec);
    const day = new Date().toISOString().slice(0, 10);
    const mark = path.join(c.base, ".node-unsupported-day");
    let last = "";
    try { last = firstLine(fs.readFileSync(mark, "utf8")); } catch {}
    if (last !== day) {
      try { fs.writeFileSync(mark, day); } catch {}
      FLUSH_ON_EXIT = true;
      emit(c, "start", { result: "failed", reason: "node-unsupported", coldStart: !readCurrent(c) });
    }
  } catch {}
  process.exitCode = 1;
  setTimeout(() => process.exit(1), TELEMETRY_TIMEOUT + 200);
  return true;
}

function main() {
  const [spec, ...args] = process.argv.slice(2);
  // Contract with a bootstrapping launcher (see selfUpdate): prove this copy
  // loads and runs on this machine.
  if (spec === "--nge-selftest") {
    process.stderr.write(`nge-selftest-ok ${LAUNCHER_VERSION}\n`);
    return;
  }
  // Only a normal launch is handed over. The updater and diagnostics run in the
  // copy that was started (the WMI updater's env file is single-use).
  if (spec && !spec.startsWith("--")) {
    if (nodeUnsupported(spec)) return;
    if (delegate()) return;
  }
  if (!spec) {
    console.error("Usage: npm-launcher <package>[@tag] [args...]");
    process.exit(1);
  }
  if (spec === "--nge-update") {
    lockedUpdate(context(args[0]));
    return;
  }
  if (spec === "--nge-diag") {
    if (!args[0]) {
      console.error("Usage: npm-launcher --nge-diag <package>[@tag]");
      process.exit(1);
    }
    const c = context(args[0]);
    const cur = readCurrent(c);
    const versions = fs.readdirSync(c.versions).filter((d) => !d.startsWith("."));
    const recent = fs.existsSync(c.eventsFile)
      ? fs.readFileSync(c.eventsFile, "utf8").trim().split("\n").filter(Boolean).slice(-50)
      : [];
    process.stdout.write([
      `platform=${process.platform} node=${process.version}`,
      `npm_execpath=${process.env.npm_execpath || "(none)"}`,
      `root=${ROOT}`,
      `spec=${args[0]} registry=${REGISTRY}`,
      `current=${cur ? cur.version : "(none)"}`,
      `versions=${versions.join(",") || "(none)"}`,
      `leases=${versionsInUse(c).size}`,
      `lock=${fs.existsSync(c.lock) ? "present" : "absent"}`,
      `last_check=${fs.existsSync(c.stamp) ? fs.readFileSync(c.stamp, "utf8").trim() : "(none)"}`,
      `telemetry=${TELEMETRY_ENABLED ? "on" : "off"}`,
      `install_log=${c.logFile}`,
      `events=${c.eventsFile} (${recent.length})`,
      ...recent.map((line) => `  ${line}`),
    ].join("\n") + "\n");
    return;
  }

  const c = context(spec);
  const t0 = Date.now();
  let cur = readCurrent(c);
  // `current` unreadable, pointing at a damaged directory, or at a quarantined
  // version: an older working copy is still a warm start, not a cold install.
  if (!cur || quarantined(c).has(cur.version)) {
    const alt = usableVersions(c, cur && cur.version)[0];
    if (alt) {
      try { setCurrent(c, alt); } catch {}
      cur = readCurrent(c) || { version: alt, bin: binOf(c, alt) };
      log(c, `current unusable, starting ${alt} instead`);
    }
  }
  const hadCurrent = !!cur;

  if (cur) {
    // A usable version exists: start immediately, check for updates in the background.
    acquireLease(c, cur.version);
    if (needCheck(c)) {
      try { fs.writeFileSync(c.stamp, String(Date.now())); } catch {}
      spawnUpdater(c, spec);
    }
    // Keep the launcher itself current too (same schedule, own stamp).
    if (SELF_UPDATE && !process.env.NGE_DELEGATED) {
      try {
        const lc = context(LAUNCHER_STABLE_SPEC);
        if (needCheck(lc, SELF_CHECK_INTERVAL)) {
          try { fs.writeFileSync(lc.stamp, String(Date.now())); } catch {}
          spawnUpdater(lc, LAUNCHER_STABLE_SPEC);
        }
      } catch {}
    }
    emit(c, "start", {
      result: "ok", targetVersion: cur.version,
      coldStart: !hadCurrent, elapsedMs: Date.now() - t0,
    });
    return run(c, cur.version, cur.bin, args);
  }

  // First run: a detached updater owns the download. The foreground only waits
  // for `current` to appear. If the client kills this process, the updater keeps
  // running and the next reconnect continues waiting instead of downloading
  // from scratch.
  //
  // Retries are driven by the updater's own outcome: as soon as this session
  // records a terminal failure, the next attempt is scheduled. 1.2.0 stopped
  // after three attempts, which could be five seconds in: a network that came
  // back ten seconds later, or a slow fallback road that would have worked,
  // found the client already told "failed". The attempts are now spread out
  // over time instead (BACKOFF), and only stop when FAIL_BUDGET has passed
  // with every attempt failed and nothing installing -- so a machine that
  // genuinely cannot install still gets a specific error well before the
  // full wait budget. An install that is actually in flight is always waited
  // for, up to FIRST_RUN_TIMEOUT.
  //
  // In cooldown (repeated cold failures on this machine) a connection gets one
  // attempt and no backoff, so reconnect loops cannot turn into a retry storm.
  const deadline = Date.now() + FIRST_RUN_TIMEOUT;
  const cooling = coolingDown(c);
  const BACKOFF = [2000, 5000, 10000];
  const MAX_ATTEMPTS = cooling ? 1 : 10;
  const failDeadline = t0 + (cooling ? 0 : FAIL_BUDGET);
  let attempts = 0;
  let giveUp = null;
  let nextAttemptAt = 0;
  let slowReported = false;
  // Failures already in the log belong to earlier sessions; only ones recorded
  // after this timestamp describe the attempt being waited on.
  let since = t0;
  if (spawnUpdater(c, spec, { outsideJob: true })) attempts = 1;
  while (Date.now() < deadline) {
    sleep(500);
    cur = readCurrent(c);
    if (cur) break;
    if (!slowReported && Date.now() - t0 >= SLOW_MS) {
      // Reported once. A connection with start/slow and neither start/ok nor
      // start/failed afterwards is one the client abandoned before we were
      // ready -- otherwise invisible.
      slowReported = true;
      emit(c, "start", { result: "slow", coldStart: true, reason: cooling ? "cooldown" : "none", elapsedMs: Date.now() - t0 });
    }
    // An installer holding the lock is still working: leave it alone.
    if (installerBusy(c)) continue;
    if (nextAttemptAt) {
      if (Date.now() < nextAttemptAt) continue;
      nextAttemptAt = 0;
      if (spawnUpdater(c, spec, { outsideJob: true })) attempts += 1;
      else break;
      continue;
    }
    const failure = failureSince(c, since);
    if (!failure) continue;        // nothing has failed yet, keep waiting
    since = failure.ts + 1;
    giveUp = failure.reason;
    const next = Date.now() + BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)];
    // Do not schedule an attempt that would start after the budget: report now.
    if (attempts >= MAX_ATTEMPTS || next > failDeadline) break;
    nextAttemptAt = next;
  }
  if (!cur) {
    FLUSH_ON_EXIT = true;
    recordColdFailure(c);
    const base = giveUp || lastFailureReason(c, t0);
    const reason = cooling ? `cooldown/${base}`.slice(0, 80) : base;
    // No old version exists, so this is a start failure, not a fallback.
    emit(c, "start", {
      result: "failed", reason,
      coldStart: true, elapsedMs: Date.now() - t0,
    });
    console.error(startFailureMessage(c, spec, reason));
    process.exitCode = 1;
    setTimeout(() => process.exit(1), TELEMETRY_TIMEOUT + 200);
    return;
  }
  acquireLease(c, cur.version);
  emit(c, "start", {
    result: "ok", targetVersion: cur.version,
    coldStart: true, elapsedMs: Date.now() - t0,
  });
  run(c, cur.version, cur.bin, args);
}

if (require.main === module) main();
module.exports = {
  main, cmpVersion, REGISTRIES, viaFor,
  collectUpdaterEnv, stripUserinfo, npmCli, classify, npmFailureReason,
  computeDeviceId, deviceId, failureDetail, exitFact, detailPhrase,
  startFailureMessage, DIRECT_INSTALL_SCRIPT, DIRECT_RESOLVE_SCRIPT,
  envProxySupported, proxyConfigured, directProxyPlan, directSpawnOpts,
  crashExit,
};
