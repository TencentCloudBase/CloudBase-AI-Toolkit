#!/usr/bin/env node
"use strict";

// The direct installer must keep the fast path when a proxy is configured.
//
// Three properties are pinned here:
//   * a stale/broken proxy variable must not stop a direct connection that
//     would otherwise work (we never branch on the presence of the variable);
//   * when the proxy really is the only way out, NODE_USE_ENV_PROXY lets
//     Node's own http/https client tunnel there -- no hand-written CONNECT;
//   * a registry that accepts the socket but never answers is given up on in
//     a few seconds instead of the full 30 s socket timeout.
// All servers live in this process, so the installer has to be spawned
// asynchronously; spawnSync would block the loop that answers its requests.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { removeTempRoot } from "./cleanup.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const require_ = createRequire(import.meta.url);
const {
  DIRECT_INSTALL_SCRIPT, envProxySupported, proxyConfigured,
  directProxyPlan, directSpawnOpts,
} = require_(INDEX);

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-proxy-"));
const results = [];
function check(ok, label, detail = "") {
  results.push({ ok, label });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// ---- a minimal, verifiable tarball -----------------------------------------
function tarEntry(name, body) {
  const h = Buffer.alloc(512);
  const b = Buffer.from(body);
  h.write(name.slice(0, 100), 0, 100, "utf8");
  h.write("0000644\0", 100, 8, "utf8");
  h.write("0000000\0", 108, 8, "utf8");
  h.write("0000000\0", 116, 8, "utf8");
  h.write(b.length.toString(8).padStart(11, "0") + "\0", 124, 12, "utf8");
  h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "utf8");
  h.write("        ", 148, 8, "utf8");
  h.write("0", 156, 1, "utf8");
  h.write("ustar", 257, 5, "utf8");
  h.write("00", 263, 2, "utf8");
  let sum = 0;
  for (const byte of h) sum += byte;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
  return Buffer.concat([h, b, Buffer.alloc(Math.ceil(b.length / 512) * 512 - b.length)]);
}
const TGZ = zlib.gzipSync(Buffer.concat([
  tarEntry("package/package.json", '{"name":"@scope/pkg","version":"1.0.0","bin":{"pkg":"cli.js"}}'),
  tarEntry("package/cli.js", "//ok\n"),
  Buffer.alloc(1024),
]));
const INTEGRITY = "sha512-" + crypto.createHash("sha512").update(TGZ).digest("base64");

const PROXY_KEYS = [
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "all_proxy", "no_proxy", "NODE_USE_ENV_PROXY",
];
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of PROXY_KEYS) delete env[k];
  return Object.assign(env, extra);
}
function withEnv(extra, fn) {
  const saved = {};
  for (const k of PROXY_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, extra);
  try { return fn(); } finally {
    for (const k of PROXY_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}
async function listen(server) {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return server.address().port;
}
async function deadPort() {
  const probe = net.createServer();
  const port = await listen(probe);
  await new Promise((r) => probe.close(r));
  return port;
}
function blackhole() {
  let hits = 0;
  const s = net.createServer((c) => { hits++; c.on("error", () => {}); });
  return { server: s, hits: () => hits };
}
function registry() {
  const s = http.createServer((req, res) => {
    const raw = decodeURIComponent(req.url || "/");
    if (raw.includes("/tarball")) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end(TGZ);
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      name: "@scope/pkg", version: "1.0.0", dependencies: {},
      dist: {
        tarball: `http://127.0.0.1:${s.address().port}/tarball`,
        integrity: INTEGRITY,
      },
    }));
  });
  return s;
}
// A proxy that deliberately ignores the host in the request line and always
// forwards to the real registry. That models "the proxy is the only way out":
// the address the client thinks it is calling is not listening.
function proxyTo(port) {
  let hits = 0;
  const s = http.createServer((req, res) => {
    hits++;
    let target = req.url || "/";
    try { const u = new URL(target); target = u.pathname + u.search; } catch {}
    const up = http.request({ hostname: "127.0.0.1", port, path: target,
      method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => { res.writeHead(502); res.end(); });
    up.end();
  });
  return { server: s, hits: () => hits };
}

function runInstall(registryUrl, envExtra = {}) {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-"));
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath,
      ["-e", DIRECT_INSTALL_SCRIPT, "@scope/pkg", registryUrl, tmp, "1.0.0"],
      { env: cleanEnv(envExtra), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.resume();
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 20000);
    child.on("exit", (status) => {
      clearTimeout(timer);
      let err = "";
      try { err = fs.readFileSync(path.join(tmp, ".direct-err"), "utf8").trim(); } catch {}
      resolve({
        status, stdout, err, ms: Date.now() - t0,
        ok: fs.existsSync(path.join(tmp, ".direct-ok")),
        manifest: fs.existsSync(path.join(tmp, "node_modules", "@scope", "pkg", "package.json")),
      });
    });
  });
}

// ---- [1] the plan and the spawn env ---------------------------------------
console.log("[1] proxy plan and spawn options");
{
  check(Array.isArray(directProxyPlan()), "directProxyPlan returns an array");
  withEnv({}, () => {
    check(proxyConfigured() === false, "no proxy variables are detected as absent");
    check(directProxyPlan().length === 1 && directProxyPlan()[0] === false,
      "with no proxy the plan has exactly one direct attempt");
  });
  withEnv({ HTTPS_PROXY: "http://127.0.0.1:1" }, () => {
    check(proxyConfigured() === true, "HTTPS_PROXY is detected");
    const plan = directProxyPlan();
    const want = envProxySupported() ? [false, true] : [false];
    check(JSON.stringify(plan) === JSON.stringify(want),
      "plan retries through the proxy only when this Node supports it",
      `node=${process.version} plan=${JSON.stringify(plan)}`);
  });
  const plain = directSpawnOpts(false, 1000);
  check(plain.env === undefined, "a direct attempt inherits process.env unchanged");
  const proxied = directSpawnOpts(true, 1000);
  check(proxied.env && proxied.env.NODE_USE_ENV_PROXY === "1",
    "the proxy attempt sets NODE_USE_ENV_PROXY=1");
  // Windows process.env is case-insensitive, but a spread into a plain object
  // is not: comparing PATH against an object that holds Path would fail there.
  const keepKey = Object.keys(process.env).find((k) => k !== "NODE_USE_ENV_PROXY");
  check(proxied.env && keepKey && proxied.env[keepKey] === process.env[keepKey],
    "the proxy attempt keeps the rest of the environment", `key=${keepKey}`);
}

// ---- [2] a broken proxy variable must not break a working direct path -----
console.log("\n[2] stale/broken proxy does not disturb a direct install");
{
  const reg = registry();
  const regPort = await listen(reg);
  const bad = blackhole();
  const badPort = await listen(bad.server);
  const r = await runInstall(`http://127.0.0.1:${regPort}/`,
    { HTTP_PROXY: `http://127.0.0.1:${badPort}` });
  check(r.status === 0 && r.ok && r.manifest, "install succeeds without the flag",
    `status=${r.status} err=${r.err}`);
  check(bad.hits() === 0, "the direct attempt never contacts the proxy",
    `hits=${bad.hits()}`);
  check(r.stdout === "", "the child writes nothing to stdout");
  reg.close();
  bad.server.close();
}

// ---- [3] a registry that never answers is given up quickly ----------------
console.log("\n[3] connect timeout caps a hanging registry");
{
  const bh = blackhole();
  const port = await listen(bh.server);
  const r = await runInstall(`http://127.0.0.1:${port}/`);
  check(!r.ok && r.err === "net-timeout", "failure is reported as net-timeout",
    `err=${r.err}`);
  check(r.ms < 4000, "it gives up in under 4 s instead of 30 s", `${r.ms}ms`);
  bh.server.close();
}

// ---- [4] proxy as the only way out ----------------------------------------
console.log("\n[4] proxy is the only route to the registry");
{
  const reg = registry();
  const regPort = await listen(reg);
  const px = proxyTo(regPort);
  const pxPort = await listen(px.server);
  const unreachable = await deadPort();
  const url = `http://127.0.0.1:${unreachable}/`;
  const envProxy = { HTTP_PROXY: `http://127.0.0.1:${pxPort}` };

  const plain = await runInstall(url, envProxy);
  check(!plain.ok, "without the flag the direct attempt fails",
    `status=${plain.status} err=${plain.err}`);

  if (envProxySupported()) {
    const tunnelled = await runInstall(url, { ...envProxy, NODE_USE_ENV_PROXY: "1" });
    check(tunnelled.ok && tunnelled.manifest, "with NODE_USE_ENV_PROXY=1 the install succeeds",
      `status=${tunnelled.status} err=${tunnelled.err}`);
    check(px.hits() > 0, "the request really went through the proxy",
      `hits=${px.hits()}`);
    check(tunnelled.ms < 4000, "the proxy attempt stays fast", `${tunnelled.ms}ms`);
  } else {
    check(true, "proxy attempt skipped on a Node without built-in proxy support",
      `node=${process.version}`);
  }
  reg.close();
  px.server.close();
}

// ---- [5] the entry points really use the two-attempt wrappers -------------
console.log("\n[5] resolve and install both go through the two-attempt plan");
{
  const src = fs.readFileSync(INDEX, "utf8");
  const calls = (needle) => src.split("\n").filter((l) =>
    l.includes(needle) && !l.trimStart().startsWith("function ")).length;
  check(calls("directResolveBoth(c)") === 2,
    "both resolve paths call directResolveBoth", `calls=${calls("directResolveBoth(c)")}`);
  check(calls("directInstallBoth(c, version, tmp)") === 2,
    "both install paths call directInstallBoth", `calls=${calls("directInstallBoth(c, version, tmp)")}`);
  check(/for \(const useProxy of directProxyPlan\(\)\)/.test(src),
    "the attempts are driven by directProxyPlan");
  check(/NODE_USE_ENV_PROXY/.test(src), "the built-in proxy switch is referenced");
}

removeTempRoot(ROOT);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  for (const f of failed) console.log(`  FAILED: ${f.label}`);
  process.exit(1);
}
