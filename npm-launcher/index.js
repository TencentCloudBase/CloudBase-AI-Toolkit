#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");

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

const REGISTRY = process.env.NGE_REGISTRY || "https://mirrors.cloud.tencent.com/npm/";
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
  const base = path.join(ROOT, `${name}@${range}`.replace(/[@/\\:]/g, "_"));
  const c = {
    name, range, base, rawSpec: spec,
    versions: path.join(base, "versions"),
    current: path.join(base, "current"),
    stamp: path.join(base, "last-check"),
    lock: path.join(base, "lock"),
    leases: path.join(base, "leases"),
    logFile: path.join(base, "install.log"),
    eventsFile: path.join(base, "events.jsonl"),
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
        // A fixed source marker, not a device fingerprint. A2 is optional on
        // v2_upload but a non-empty value keeps the gateway from dropping rows.
        A2: "cloudbase-npm-launcher",
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

// stdout belongs to the MCP JSON-RPC channel. All npm output goes to the log file.
function npm(c, args, cwd) {
  const budget = 5 * 60 * 1000;
  const full = [...args, `--registry=${REGISTRY}`, "--no-audit", "--no-fund", "--loglevel=error"];
  const opts = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: budget };
  const cli = npmCli();
  const r = cli
    ? spawnSync(process.execPath, [cli, ...full], opts)
    : spawnSync(isWin ? "npm.cmd" : "npm", full, { ...opts, shell: isWin });
  const timedOut = !!r.signal || !!(r.error && /ETIMEDOUT|TIMED?OUT/i.test(`${r.error.code || ""} ${r.error.message || ""}`));
  const ok = r.status === 0 && !r.error;
  const errText = `${r.stderr || ""}${r.error ? r.error.message : ""}${timedOut ? " ETIMEDOUT" : ""}`;
  let reason = "none";
  if (!ok) {
    reason = errText.trim() ? classify(errText) : "empty-output";
    if (reason === "other" && r.error) reason = "spawn-failed";
  }
  log(c, `npm ${args.join(" ")} -> ${r.status} [platform=${process.platform} node=${process.version} npm=${process.env.npm_execpath || "npm"} npmCli=${cli || "none"}${ok ? "" : ` reason=${reason}`}]\n${r.stdout || ""}${r.stderr || ""}${r.error ? r.error.message : ""}`);
  return { ok, out: r.stdout || "", errText, reason };
}

// Return the real failure category alongside the version. The caller must not
// hard-code "registry": `npm view` can fail for ENOENT, an incomplete npm, a
// network error, or an empty response, and each needs a different fix.
function resolveVersion(c) {
  const r = npm(c, ["view", `${c.name}@${c.range}`, "version", "--json"], c.base);
  if (!r.ok) return { version: null, reason: r.reason };
  try {
    const v = JSON.parse(r.out);
    const version = Array.isArray(v) ? v[v.length - 1] : v;
    if (!version || typeof version !== "string") return { version: null, reason: "empty-output" };
    return { version, reason: "none" };
  } catch { return { version: null, reason: "empty-output" }; }
}

// Returns { ok, reason } so the caller can report the real failure category
// instead of hard-coding one on the update / fallback events.
function install(c, version, coldStart = false) {
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
  const r = npm(c, ["install", `${c.name}@${version}`, "--no-package-lock"], tmp);
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
      emit(c, "install", { result: "ok", targetVersion: version, coldStart, elapsedMs: elapsed() });
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

function update(c) {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  const from = readCurrent(c);
  const fromVersion = from ? from.version : "";
  const coldStart = !from;
  const resolved = resolveVersion(c);
  const version = resolved.version;
  if (!version) {
    const reason = resolved.reason;
    emit(c, "update", { result: "skipped", reason, fromVersion, coldStart, elapsedMs: elapsed() });
    if (fromVersion) {
      emit(c, "fallback", { result: "fallback", reason, targetVersion: fromVersion, coldStart, elapsedMs: elapsed() });
    }
    return log(c, "resolve failed, keep current");
  }
  // Nothing to install: refresh the check stamp and leave the metrics alone.
  if (version === fromVersion) {
    try { fs.writeFileSync(c.stamp, String(Date.now())); } catch {}
    return;
  }
  const installed = install(c, version, coldStart);
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
  emit(c, "update", { result: "ok", targetVersion: version, fromVersion, coldStart, elapsedMs: elapsed() });
  prune(c, version);
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
// the local event log. Only a genuine wait expiry should be reported as timeout.
// Events older than `since` belong to an earlier session (yesterday's ENOSPC,
// say) and must not be blamed for today's slow download.
function lastFailureReason(c, since) {
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
        return e.reason && e.reason !== "none" ? e.reason : "other";
      }
    }
  } catch {}
  return "timeout";
}

function needCheck(c) {
  let last = NaN;
  try { last = Number(firstLine(fs.readFileSync(c.stamp, "utf8"))); } catch {}
  const now = Date.now();
  return !Number.isFinite(last) || now - last > CHECK_INTERVAL || last > now + 60e3;
}

function run(c, version, bin, args) {
  const child = spawn(process.execPath, [bin, ...args], { stdio: "inherit", windowsHide: true });
  // If this launcher is kill -9'd, the MCP child keeps the client's pipes and
  // keeps running. Its own lease protects the version it is using.
  if (child.pid) acquireLease(c, version, child.pid);
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(s, () => { try { child.kill(s); } catch {} });
  }
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.on("error", (e) => { console.error(e.message); process.exit(1); });
}

function main() {
  const [spec, ...args] = process.argv.slice(2);
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
  const hadCurrent = !!cur;

  if (cur) {
    // A usable version exists: start immediately, check for updates in the background.
    acquireLease(c, cur.version);
    if (needCheck(c)) {
      try { fs.writeFileSync(c.stamp, String(Date.now())); } catch {}
      spawnUpdater(c, spec);
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
  const deadline = Date.now() + FIRST_RUN_TIMEOUT;
  let attempts = 0;
  let lastAttempt = 0;
  if (spawnUpdater(c, spec, { outsideJob: true })) { attempts = 1; lastAttempt = Date.now(); }
  // `cur` is null here (the branch above returned), and the loop breaks as soon
  // as readCurrent() succeeds, so only the deadline needs re-testing.
  while (Date.now() < deadline) {
    sleep(500);
    cur = readCurrent(c);
    if (cur) break;
    // Retry inside the remaining budget if an updater died without installing.
    if (attempts < 3 && Date.now() - lastAttempt > 10000 && !installerBusy(c)) {
      if (spawnUpdater(c, spec, { outsideJob: true })) { attempts += 1; lastAttempt = Date.now(); }
    }
  }
  if (!cur) {
    FLUSH_ON_EXIT = true;
    // No old version exists, so this is a start failure, not a fallback.
    emit(c, "start", {
      result: "failed", reason: lastFailureReason(c, t0),
      coldStart: true, elapsedMs: Date.now() - t0,
    });
    console.error(`Failed to install ${spec}. See log: ${c.logFile}`);
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
module.exports = { collectUpdaterEnv, stripUserinfo, npmCli, classify };
