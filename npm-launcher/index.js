#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");

const REGISTRY = process.env.NGE_REGISTRY || "https://mirrors.cloud.tencent.com/npm/";
const ROOT = process.env.NGE_ROOT || path.join(os.homedir(), "cloudbase-mcp", ".nge");
const isWin = process.platform === "win32";

// Numeric env vars: NaN (or a negative value) must never silently disable a
// behaviour. Zero is valid: tests use NGE_CHECK_INTERVAL=0 to force a check.
const num = (v, d) => {
  if (v === undefined || v === null || String(v).trim() === "") return d;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const CHECK_INTERVAL = num(process.env.NGE_CHECK_INTERVAL, 5 * 60 * 1000);
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
// Foreground first install gets one overall deadline; background updaters do not.
let DEADLINE = 0;
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
  fs.mkdirSync(c.versions, { recursive: true });
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
    // background updater keeps the socket referenced so its events can flush.
    if (!IS_BACKGROUND) {
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
    const version = fs.readFileSync(c.current, "utf8").trim();
    const bin = binOf(c, version);
    return bin ? { version, bin } : null;
  } catch { return null; }
}

function npmCli() {
  const p = process.env.npm_execpath;
  if (!p) return null;
  const cand = /npx-cli\.js$/.test(p) ? path.join(path.dirname(p), "npm-cli.js") : p;
  return /npm-cli\.js$/.test(cand) && fs.existsSync(cand) ? cand : null;
}

// stdout belongs to the MCP JSON-RPC channel. All npm output goes to the log file.
function npm(c, args, cwd) {
  const budget = DEADLINE ? Math.max(5e3, DEADLINE - Date.now()) : 5 * 60 * 1000;
  const full = [...args, `--registry=${REGISTRY}`, "--no-audit", "--no-fund", "--loglevel=error"];
  const opts = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: budget };
  const cli = npmCli();
  const r = cli
    ? spawnSync(process.execPath, [cli, ...full], opts)
    : spawnSync(isWin ? "npm.cmd" : "npm", full, { ...opts, shell: isWin });
  const timedOut = !!r.signal || !!(r.error && /ETIMEDOUT|TIMED?OUT/i.test(`${r.error.code || ""} ${r.error.message || ""}`));
  log(c, `npm ${args.join(" ")} -> ${r.status} [platform=${process.platform} node=${process.version} npm=${process.env.npm_execpath || "npm"}]\n${r.stdout || ""}${r.stderr || ""}${r.error ? r.error.message : ""}`);
  return {
    ok: r.status === 0 && !r.error,
    out: r.stdout || "",
    errText: `${r.stderr || ""}${r.error ? r.error.message : ""}${timedOut ? " ETIMEDOUT" : ""}`,
  };
}

function resolveVersion(c) {
  const r = npm(c, ["view", `${c.name}@${c.range}`, "version", "--json"], c.base);
  if (!r.ok) return null;
  try {
    const v = JSON.parse(r.out);
    return Array.isArray(v) ? v[v.length - 1] : v;
  } catch { return null; }
}

// Returns { ok, reason } so the caller can report the real failure category
// instead of hard-coding one on the update / fallback events.
function install(c, version) {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  if (binOf(c, version)) {
    emit(c, "install", { result: "reused", targetVersion: version, elapsedMs: elapsed() });
    return { ok: true, reason: "none" };
  }
  // Each process installs into its own temporary directory. No shared node_modules.
  const tmp = path.join(c.versions, `.tmp-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, "package.json"), '{"private":true}');
  const r = npm(c, ["install", `${c.name}@${version}`, "--no-package-lock"], tmp);
  if (!r.ok) {
    const reason = classify(r.errText);
    emit(c, "install", { result: "failed", targetVersion: version, reason, elapsedMs: elapsed() });
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
      emit(c, "install", { result: "ok", targetVersion: version, elapsedMs: elapsed() });
      return { ok: true, reason: "none" };
    } catch (err) {
      lastErr = `${err.code || ""} ${err.message || ""}`;
      if (binOf(c, version)) {
        rm(tmp);
        emit(c, "install", { result: "reused", targetVersion: version, elapsedMs: elapsed() });
        return { ok: true, reason: "none" };
      }
      if (fs.existsSync(dest)) {
        try { fs.renameSync(dest, path.join(c.versions, `.trash-${Date.now()}-${version}`)); } catch {}
      }
      sleep(wait);
    }
  }
  const reason = classify(lastErr);
  emit(c, "install", { result: "failed", targetVersion: version, reason, elapsedMs: elapsed() });
  rm(tmp);
  return { ok: false, reason };
}

function setCurrent(c, version) {
  const t = `${c.current}.${process.pid}`;
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

function acquireLease(c, version) {
  try {
    fs.mkdirSync(c.leases, { recursive: true });
    const f = path.join(c.leases, String(process.pid));
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
      try { used.add(fs.readFileSync(p, "utf8").trim()); } catch {}
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
      catch { return null; } // another process may have removed it mid-scan
    }).filter(Boolean);
  } catch { return; }
  all.filter((x) => x.d.startsWith(".") && Date.now() - x.t > TMP_TTL)
    .forEach((x) => rm(path.join(c.versions, x.d)));
  all.filter((x) => !x.d.startsWith(".") && x.d !== keepVersion && !inUse.has(x.d))
    .sort((a, b) => b.t - a.t).slice(KEEP - 1)
    .forEach((x) => {
      const trash = path.join(c.versions, `.trash-${Date.now()}-${x.d}`);
      try {
        fs.renameSync(path.join(c.versions, x.d), trash);
        rm(trash);
      } catch {}
    });
}

function lockStale(c) {
  try {
    const age = Date.now() - fs.statSync(c.lock).mtimeMs;
    if (age > LOCK_STALE) return true;
    let pid = 0;
    try { pid = Number(fs.readFileSync(path.join(c.lock, "pid"), "utf8")); } catch {}
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
  const version = resolveVersion(c);
  if (!version) {
    emit(c, "update", { result: "skipped", reason: "registry", fromVersion, elapsedMs: elapsed() });
    emit(c, "fallback", { result: "fallback", reason: "registry", targetVersion: fromVersion || "unknown", elapsedMs: elapsed() });
    return log(c, "resolve failed, keep current");
  }
  // Nothing to install: refresh the check stamp and leave the metrics alone.
  if (version === fromVersion) {
    try { fs.writeFileSync(c.stamp, String(Date.now())); } catch {}
    return;
  }
  const installed = install(c, version);
  if (!installed.ok) {
    emit(c, "update", { result: "failed", targetVersion: version, fromVersion, reason: installed.reason, elapsedMs: elapsed() });
    emit(c, "fallback", { result: "fallback", reason: installed.reason, targetVersion: fromVersion || "unknown", elapsedMs: elapsed() });
    return log(c, `install ${version} failed, keep current`);
  }
  try {
    setCurrent(c, version);
    fs.writeFileSync(c.stamp, String(Date.now()));
  } catch (err) {
    // Do not report success or prune if current never switched: pruning could
    // remove the version that running windows still use.
    const reason = classify(`${err.code || ""} ${err.message || ""}`);
    emit(c, "update", { result: "failed", targetVersion: version, fromVersion, reason, elapsedMs: elapsed() });
    return log(c, `setCurrent ${version} failed, keep current`);
  }
  emit(c, "update", { result: "ok", targetVersion: version, fromVersion, elapsedMs: elapsed() });
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

function needCheck(c) {
  let last = NaN;
  try { last = Number(fs.readFileSync(c.stamp, "utf8")); } catch {}
  const now = Date.now();
  return !Number.isFinite(last) || now - last > CHECK_INTERVAL || last > now + 60e3;
}

function run(bin, args) {
  const child = spawn(process.execPath, [bin, ...args], { stdio: "inherit", windowsHide: true });
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
      try {
        const bg = spawn(process.execPath, [__filename, "--nge-update", spec],
          { detached: true, stdio: "ignore", windowsHide: true });
        bg.on("error", () => {});
        bg.unref();
      } catch {}
    }
    emit(c, "start", {
      result: "ok", targetVersion: cur.version,
      coldStart: !hadCurrent, elapsedMs: Date.now() - t0,
    });
    return run(cur.bin, args);
  }

  // First run: install in the foreground under one overall deadline.
  DEADLINE = Date.now() + FIRST_RUN_TIMEOUT;
  let reportedWait = false;
  while (!cur && Date.now() < DEADLINE) {
    if (lockedUpdate(c, { quiet: true })) { cur = readCurrent(c); break; }
    if (!reportedWait) {
      reportedWait = true;
      emit(c, "update", { result: "skipped", reason: "lock", coldStart: true });
    }
    sleep(500);
    cur = readCurrent(c);
  }
  if (!cur) {
    emit(c, "fallback", {
      result: "failed", reason: "timeout", coldStart: true, elapsedMs: Date.now() - t0,
    });
    console.error(`Failed to install ${spec}. See log: ${c.logFile}`);
    process.exit(1);
  }
  acquireLease(c, cur.version);
  emit(c, "start", {
    result: "ok", targetVersion: cur.version,
    coldStart: true, elapsedMs: Date.now() - t0,
  });
  run(cur.bin, args);
}

main();
