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
const CHECK_INTERVAL = Number(process.env.NGE_CHECK_INTERVAL || 5 * 60 * 1000);
const LOCK_STALE = Number(process.env.NGE_LOCK_STALE || 10 * 60 * 1000);
const KEEP = Number(process.env.NGE_KEEP || 5);
const FIRST_RUN_TIMEOUT = Number(process.env.NGE_FIRST_RUN_TIMEOUT || 120e3);
const isWin = process.platform === "win32";

// Telemetry is on by default. NGE_TELEMETRY=0 turns off the network call only;
// local events.jsonl is always written so --nge-diag works offline.
const TELEMETRY_ENABLED = process.env.NGE_TELEMETRY !== "0";
const TELEMETRY_ENDPOINT = process.env.NGE_TELEMETRY_ENDPOINT || "https://otheve.beacon.qq.com/analytics/v2_upload";
const TELEMETRY_TIMEOUT = Number(process.env.NGE_TELEMETRY_TIMEOUT || 1000);
const IS_BACKGROUND = process.argv[2] === "--nge-update";
const LAUNCHER_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version; }
  catch { return "1.0.0"; }
})();

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} };

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
    logFile: path.join(base, "install.log"),
    eventsFile: path.join(base, "events.jsonl"),
  };
  fs.mkdirSync(c.versions, { recursive: true });
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
function classify(text) {
  const s = String(text || "");
  if (/ENOTEMPTY/i.test(s)) return "enotempty";
  if (/EPERM/i.test(s)) return "eperm";
  if (/EBUSY/i.test(s)) return "ebusy";
  if (/EJSONPARSE/i.test(s)) return "ejsonparse";
  if (/ETIMEDOUT|TIMED?OUT|ESOCKETTIMEDOUT/i.test(s)) return "timeout";
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|network/i.test(s)) return "network";
  if (/E404|E500|\b50[0-9]\b|Internal Server Error|registry/i.test(s)) return "registry";
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
    // The detached background updater has no other handles; keeping this one
    // referenced lets its events actually flush. The foreground start path
    // never waits for the network — process.exit() ends it with the child.
    if (!IS_BACKGROUND && req.unref) req.unref();
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

// stdout belongs to the MCP JSON-RPC channel. All npm output goes to the log file.
function npm(c, args, cwd) {
  const full = [...args, `--registry=${REGISTRY}`, "--no-audit", "--no-fund", "--loglevel=error"];
  const opts = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: 5 * 60 * 1000 };
  const cli = process.env.npm_execpath;
  const r = cli && /npm-cli\.js$/.test(cli) && fs.existsSync(cli)
    ? spawnSync(process.execPath, [cli, ...full], opts)
    : spawnSync(isWin ? "npm.cmd" : "npm", full, { ...opts, shell: isWin });
  log(c, `npm ${args.join(" ")} -> ${r.status} [platform=${process.platform} node=${process.version} npm=${process.env.npm_execpath || "npm"}]\n${r.stdout || ""}${r.stderr || ""}${r.error ? r.error.message : ""}`);
  return {
    ok: r.status === 0,
    out: r.stdout || "",
    errText: `${r.stderr || ""}${r.error ? r.error.message : ""}`,
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
    emit(c, "install", {
      result: "failed", targetVersion: version, reason, elapsedMs: elapsed(),
    });
    rm(tmp);
    return { ok: false, reason };
  }
  let lastErr = "";
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmp, path.join(c.versions, version));
      emit(c, "install", { result: "ok", targetVersion: version, elapsedMs: elapsed() });
      return { ok: true, reason: "none" };
    } catch (err) {
      lastErr = `${err.code || ""} ${err.message || ""}`;
      if (binOf(c, version)) {
        rm(tmp);
        emit(c, "install", { result: "reused", targetVersion: version, elapsedMs: elapsed() });
        return { ok: true, reason: "none" };
      }
      sleep(300);
    }
  }
  const reason = classify(lastErr);
  emit(c, "install", {
    result: "failed", targetVersion: version, reason, elapsedMs: elapsed(),
  });
  rm(tmp);
  return { ok: false, reason };
}

function setCurrent(c, version) {
  const t = `${c.current}.${process.pid}`;
  fs.writeFileSync(t, version);
  fs.renameSync(t, c.current);
}

function prune(c, keepVersion) {
  try {
    const all = fs.readdirSync(c.versions).map((d) => ({
      d, t: fs.statSync(path.join(c.versions, d)).mtimeMs,
    }));
    all.filter((x) => x.d.startsWith(".") && Date.now() - x.t > (Number(process.env.NGE_TMP_TTL) || 10 * 60 * 1000))
      .forEach((x) => rm(path.join(c.versions, x.d)));
    all.filter((x) => !x.d.startsWith(".") && x.d !== keepVersion)
      .sort((a, b) => b.t - a.t).slice(KEEP - 1)
      .forEach((x) => {
        const trash = path.join(c.versions, `.trash-${Date.now()}-${x.d}`);
        try {
          fs.renameSync(path.join(c.versions, x.d), trash);
          rm(trash);
        } catch {}
      });
  } catch {}
}

function tryLock(c) {
  try {
    fs.mkdirSync(c.lock);
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") return false;
    try {
      if (Date.now() - fs.statSync(c.lock).mtimeMs > LOCK_STALE) {
        rm(c.lock);
        fs.mkdirSync(c.lock);
        return true;
      }
    } catch {}
    return false;
  }
}

function update(c) {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  const from = readCurrent(c);
  const fromVersion = from ? from.version : "";
  const version = resolveVersion(c);
  if (!version) {
    emit(c, "update", { result: "skipped", reason: "registry", fromVersion, elapsedMs: elapsed() });
    emit(c, "fallback", {
      result: "fallback", reason: "registry",
      targetVersion: fromVersion || "unknown", elapsedMs: elapsed(),
    });
    return log(c, "resolve failed, keep current");
  }
  const installed = install(c, version);
  if (!installed.ok) {
    emit(c, "update", {
      result: "failed", targetVersion: version, fromVersion,
      reason: installed.reason, elapsedMs: elapsed(),
    });
    emit(c, "fallback", {
      result: "fallback", reason: installed.reason,
      targetVersion: fromVersion || "unknown", elapsedMs: elapsed(),
    });
    return log(c, `install ${version} failed, keep current`);
  }
  setCurrent(c, version);
  fs.writeFileSync(c.stamp, String(Date.now()));
  emit(c, "update", { result: "ok", targetVersion: version, fromVersion, elapsedMs: elapsed() });
  prune(c, version);
}

function lockedUpdate(c) {
  if (!tryLock(c)) {
    emit(c, "update", { result: "skipped", reason: "lock" });
    return false;
  }
  try { update(c); } finally { rm(c.lock); }
  return true;
}

function needCheck(c) {
  try { return Date.now() - Number(fs.readFileSync(c.stamp, "utf8")) > CHECK_INTERVAL; } catch { return true; }
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
    if (needCheck(c)) {
      fs.writeFileSync(c.stamp, String(Date.now()));
      spawn(process.execPath, [__filename, "--nge-update", spec],
        { detached: true, stdio: "ignore", windowsHide: true }).unref();
    }
    emit(c, "start", {
      result: "ok", targetVersion: cur.version,
      coldStart: !hadCurrent, elapsedMs: Date.now() - t0,
    });
    return run(cur.bin, args);
  }

  // First run: install in the foreground. If another process holds the lock, wait for it.
  const deadline = Date.now() + FIRST_RUN_TIMEOUT;
  while (!cur && Date.now() < deadline) {
    if (lockedUpdate(c)) { cur = readCurrent(c); break; }
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
  emit(c, "start", {
    result: "ok", targetVersion: cur.version,
    coldStart: true, elapsedMs: Date.now() - t0,
  });
  run(cur.bin, args);
}

main();
