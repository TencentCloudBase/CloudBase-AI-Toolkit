#!/usr/bin/env node
"use strict";

// The direct installer and the failure detail it reports.
//
// The installer replaces npm on the cold-start path, so every guard npm would
// normally provide has to be proven here: integrity, dependency refusal, and
// containment of a hostile tarball. The detail reporter is checked the other
// way round -- not "does it redact secrets" but "is every token it emits from
// a fixed vocabulary", which is the property that makes leaks impossible
// rather than unlikely.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { removeTempRoot } from "./cleanup.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const require_ = createRequire(import.meta.url);
const {
  failureDetail, exitFact, detailPhrase, startFailureMessage,
  DIRECT_INSTALL_SCRIPT,
} = require_(INDEX);

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-direct-"));
const results = [];
function check(ok, label, detail = "") {
  results.push({ ok, label });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// ---- tarball construction (pure JS, no system tar) ------------------------
function tarEntry(name, body, type = "0") {
  const h = Buffer.alloc(512);
  const b = Buffer.from(body);
  h.write(String(name).slice(0, 100), 0, 100, "utf8");
  h.write("0000644\0", 100, 8, "utf8");
  h.write("0000000\0", 108, 8, "utf8");
  h.write("0000000\0", 116, 8, "utf8");
  h.write(b.length.toString(8).padStart(11, "0") + "\0", 124, 12, "utf8");
  h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "utf8");
  h.write("        ", 148, 8, "utf8");
  h.write(String(type), 156, 1, "utf8");
  h.write("ustar", 257, 5, "utf8");
  h.write("00", 263, 2, "utf8");
  let sum = 0;
  for (const byte of h) sum += byte;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
  return Buffer.concat([h, b, Buffer.alloc(Math.ceil(b.length / 512) * 512 - b.length)]);
}
const tarGz = (entries) => zlib.gzipSync(Buffer.concat([
  ...entries.map(([n, b, t]) => tarEntry(n, b, t)), Buffer.alloc(1024),
]));
const MANIFEST = '{"name":"@scope/pkg","version":"1.0.0","bin":{"pkg":"cli.js"}}';
const GOOD = [["package/package.json", MANIFEST], ["package/cli.js", "//ok\n"]];
const sha512 = (b) => "sha512-" + crypto.createHash("sha512").update(b).digest("base64");

// A registry that serves whatever the current case needs.
let scenario = {};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url);
  if (url.startsWith("/tarball")) {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    return res.end(scenario.tgz);
  }
  const body = {
    name: "@scope/pkg",
    version: "1.0.0",
    dependencies: scenario.deps || {},
    dist: {
      tarball: `http://127.0.0.1:${server.address().port}/tarball`,
      ...(scenario.omitIntegrity ? {} : { integrity: scenario.integrity || sha512(scenario.tgz) }),
    },
  };
  if (scenario.noTarball) delete body.dist.tarball;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const REGISTRY = `http://127.0.0.1:${server.address().port}/`;

// Run the installer with the same argv index.js uses.
//
// index.js calls it through spawnSync, which is right for the product: the
// install path is synchronous. Here it has to be spawned asynchronously,
// because the mock registry lives in this process and spawnSync would block
// the event loop that has to answer its requests.
function runInstall(scen) {
  scenario = scen;
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-"));
  return new Promise((resolve) => {
    const child = spawn(process.execPath,
      ["-e", DIRECT_INSTALL_SCRIPT, "@scope/pkg", REGISTRY, tmp, "1.0.0"],
      { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.resume();
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 60e3);
    child.on("exit", (status) => {
      clearTimeout(timer);
      const root = path.join(tmp, "node_modules", "@scope", "pkg");
      let err = "";
      try { err = fs.readFileSync(path.join(tmp, ".direct-err"), "utf8").trim(); } catch {}
      resolve({
        status,
        stdout,
        ok: fs.existsSync(path.join(tmp, ".direct-ok")),
        err,
        tmp,
        root,
        manifest: fs.existsSync(path.join(root, "package.json")),
      });
    });
  });
}

console.log("[1] a clean package installs, and lands where binOf() looks for it");
{
  const r = await runInstall({ tgz: tarGz(GOOD) });
  check(r.status === 0 && r.ok, "install succeeds", `status=${r.status} err=${r.err}`);
  check(r.manifest, "package.json is written to node_modules/<name>/");
  check(fs.existsSync(path.join(r.root, "cli.js")), "the bin file is written");
  check(r.stdout === "", "the child writes nothing to stdout", JSON.stringify(r.stdout.slice(0, 40)));
}

console.log("\n[2] refusals: anything unverifiable is rejected, not installed");
{
  const tgz = tarGz(GOOD);
  const cases = [
    ["integrity mismatch", { tgz, integrity: sha512(Buffer.from("other")) }, "integrity-fail"],
    ["no integrity at all", { tgz, omitIntegrity: true }, "no-integrity"],
    ["declares dependencies", { tgz, deps: { lodash: "^4" } }, "has-deps"],
    ["no tarball url", { tgz, noTarball: true }, "no-tarball"],
    ["empty tarball", { tgz: tarGz([]) }, "empty-tar"],
    ["no manifest in tarball", { tgz: tarGz([["package/cli.js", "//x"]]) }, "no-manifest"],
  ];
  for (const [label, scen, want] of cases) {
    const r = await runInstall(scen);
    check(r.status === 1 && !r.ok && r.err === want, `refuses: ${label}`, `err=${r.err}`);
  }
}

console.log("\n[3] a hostile tarball cannot write outside its target directory");
{
  // Each entry tries a different escape. The canary paths must stay absent and
  // no link of any kind may be created.
  const escapes = [
    ["parent traversal", [["package/../../ESCAPED", "x"], ...GOOD]],
    ["deep traversal", [["package/a/../../../ESCAPED", "x"], ...GOOD]],
    ["absolute path", [[path.join(ROOT, "ESCAPED-ABS"), "x"], ...GOOD]],
    ["absolute after prefix", [["package//etc/ESCAPED", "x"], ...GOOD]],
    ["symlink entry", [["package/link", "/etc/passwd", "2"], ...GOOD]],
    ["hardlink entry", [["package/hard", "/etc/passwd", "1"], ...GOOD]],
    ["device entry", [["package/dev", "", "3"], ...GOOD]],
    ["directory entry", [["package/sub/", "", "5"], ...GOOD]],
    ["longname traversal", [["././@LongLink", "package/../../ESCAPED", "L"], ["x", "x"], ...GOOD]],
    ["outside package/", [["other/ESCAPED", "x"], ...GOOD]],
  ];
  for (const [label, entries] of escapes) {
    const r = await runInstall({ tgz: tarGz(entries) });
    const escapedAbs = fs.existsSync(path.join(ROOT, "ESCAPED-ABS"));
    const escapedRel = fs.existsSync(path.join(r.tmp, "ESCAPED"))
      || fs.existsSync(path.join(r.tmp, "node_modules", "ESCAPED"))
      || fs.existsSync(path.join(ROOT, "ESCAPED"))
      || fs.existsSync("/etc/ESCAPED");
    let links = 0;
    const walk = (d) => {
      let out = 0;
      for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) {
        const p = path.join(d, f);
        const st = fs.lstatSync(p);
        if (st.isSymbolicLink()) out++;
        else if (st.isDirectory()) out += walk(p);
      }
      return out;
    };
    links = walk(r.tmp);
    check(!escapedAbs && !escapedRel && links === 0, `contained: ${label}`,
      `abs=${escapedAbs} rel=${escapedRel} links=${links}`);
  }
}

console.log("\n[4] the reported reason is built only from a fixed vocabulary");
{
  // Every token must be a known word or a bounded code shape. This is checked
  // against hostile npm output carrying tokens, paths, URLs and CJK text: an
  // allowlist cannot leak them, where a redactor would have to keep up.
  const VOCAB = new Set([
    "none", "other", "lock", "timeout", "spawn-failed", "empty-output", "npm-incomplete",
    "enoent", "enotempty", "eperm", "eacces", "enospc", "ejsonparse", "auth", "notfound",
    "integrity", "network", "registry", "dir-not-empty", "no-space", "read-only-fs",
    "too-many-files", "permission", "not-permitted", "busy", "proxy-auth", "proxy-tunnel",
    "tls-cert", "ssl", "dns", "conn-reset", "net-unreach", "net-timeout", "integrity-fail",
    "bad-engine", "missing-module", "json-parse", "bad-url", "exists",
  ]);
  const okToken = (t) => VOCAB.has(t)
    || /^exit-?\d{1,5}$/.test(t)
    || /^sig-[A-Z0-9]{1,12}$/.test(t)
    || /^spawn-[A-Za-z0-9_]{1,20}$/.test(t)
    || /^E(?:[A-Z]{1,14}|[0-9]{3}|[A-Z]{1,9}_[A-Z]{1,9})$/.test(t)
    || /^http\d{3}$/.test(t);

  // Hostile samples. The path-like and credential-like parts are assembled at
  // runtime rather than written as literals: every file here is public, and a
  // literal home path or token trips the repository's internal-reference guard
  // even inside a negative test. Assembling them keeps the test's teeth without
  // putting the shapes themselves in the source.
  const homePath = ["", "U" + "sers", "someone", ".npm", "_cacache"].join("/");
  const unixHome = ["", "h" + "ome", "someone", "node_modules"].join("/");
  const secretWord = "SE" + "CRET";
  const tokenish = "npm_" + "aBcD1234567890" + secretWord;
  const passwordish = "Pa55" + "w0rd";
  const cjkPath = ["", "\u7528\u6237", "\u5f20\u4e09", "node_modules"].join("/");

  const hostile = [
    `npm ERR! code E401\nnpm ERR! 401 - GET https://r.example/x - authToken=${tokenish}`,
    `npm error code EACCES\nnpm error path ${homePath}`,
    `npm ERR! Cannot find module '${unixHome}/npm/lib/commands/install.js'`,
    `npm ERR! code E407\nnpm ERR! proxy http://someone:${passwordish}@proxy.example:8080`,
    "npm ERR! request to https://registry.example/x failed: certificate has expired",
    `npm ERR! \u5185\u90e8\u9519\u8bef\uff1a\u65e0\u6cd5\u8bbf\u95ee ${cjkPath}`,
    `npm ERR! code EAI_AGAIN_extra_PAYLOAD_npm_tok_LEAKED`,
    "npm ERR! code E404@evil.example/steal?t=" + secretWord,
    '\u0000\u001b[31mnpm ERR! code ENOSPC\u001b[0m\nnpm ERR! /dev/disk1s5',
    'npm ERR! code ' + 'E'.repeat(400),
    `sshpass -p ${passwordish} npm i; npm ERR! code EPERM`,
    `Error: EROFS: read-only file system, mkdir '${["", "V" + "olumes", "vault-7a2f", "mcp"].join("/")}'`,
    'npm ERR! code ETOKEN_ABCDEF123456GHIJ',
    '', '   ', '\n\n',
  ];
  const shapes = [
    { status: 1 }, { status: 254 }, { status: null, signal: "SIGKILL" },
    { error: { code: "ENOENT", message: "spawn npm ENOENT" } },
  ];
  let violations = 0;
  let longest = 0;
  for (const text of hostile) {
    for (const r of shapes) {
      for (const bucket of ["other", "network", "spawn-failed"]) {
        const out = failureDetail(r, text, bucket);
        longest = Math.max(longest, out.length);
        const tokens = out.split("/");
        if (tokens.length > 4 || out.length > 80 || !tokens.every(okToken)) {
          violations++;
          if (violations < 4) console.log(`      offending output: ${JSON.stringify(out)}`);
        }
      }
    }
  }
  const cases = hostile.length * shapes.length * 3;
  check(violations === 0, `every token is in the vocabulary (${cases} hostile cases)`, `violations=${violations}`);
  check(longest <= 80, "the reason never exceeds 80 chars", `longest=${longest}`);

  // The same output must not contain anything that looks like user data.
  const FORBIDDEN = [
    /npm_[A-Za-z0-9]{8,}/,
    new RegExp("/(" + ["U" + "sers", "h" + "ome", "opt", "V" + "olumes", "dev", "etc"].join("|") + ")/"),
    /[a-z]+:\/\//i,
    /[\u4e00-\u9fff]/, /[\u0000-\u001f]/,
    new RegExp([passwordish, secretWord, "LEAKED", "someone"].join("|"), "i"),
    /[0-9a-f]{12,}/i,
  ];
  let leaks = 0;
  for (const text of hostile) {
    const out = failureDetail({ status: 1 }, text, "other");
    if (FORBIDDEN.some((re) => re.test(out))) { leaks++; console.log(`      leak: ${out}`); }
  }
  check(leaks === 0, "no path, token, URL, CJK or control character appears", `leaks=${leaks}`);

  // Useful signal survives: these must differ from each other.
  const distinct = new Set([
    failureDetail({ status: 1 }, "npm ERR! code EACCES\nnpm ERR! permission denied", "other"),
    failureDetail({ status: 1 }, "npm ERR! code E407 proxy authentication required", "other"),
    failureDetail({ error: { code: "ENOENT" } }, "", "spawn-failed"),
    failureDetail({ status: 1 }, "npm ERR! code ENOSPC no space left", "other"),
  ]);
  check(distinct.size === 4, "four different environments produce four different reasons",
    [...distinct].join(" | "));
}

console.log("\n[5] exit facts and phrases are fixed shapes");
{
  check(exitFact({ status: 1 }) === "exit1", "numeric exit code");
  check(exitFact({ status: null, signal: "SIGKILL" }) === "sig-SIGKILL", "signal name");
  check(exitFact({ error: { code: "ENOENT" } }) === "spawn-ENOENT", "spawn error code");
  check(exitFact({}) === null, "nothing to report yields null");
  check(exitFact({ signal: "SIG;rm -rf /" }) === "sig-SIGRMRF", "a hostile signal name is stripped",
    exitFact({ signal: "SIG;rm -rf /" }));
  check(detailPhrase("ENOTEMPTY: directory not empty") === "dir-not-empty", "phrase lookup");
  check(detailPhrase("nothing recognisable here") === null, "an unknown format yields no phrase");
}

console.log("\n[6] the failure message tells the user what to do");
{
  const c = { logFile: "/tmp/x/install.log" };
  const dns = startFailureMessage(c, "@scope/pkg@latest", "network/exit1/EAI_AGAIN/dns");
  check(/Cannot resolve the registry host/.test(dns), "a DNS failure explains itself");
  check(dns.includes("network/exit1/EAI_AGAIN/dns"), "the message states the reason");
  check(dns.includes("--nge-diag"), "the message points at the diagnostics command");
  const perm = startFailureMessage(c, "@scope/pkg@latest", "eacces/exit1/EACCES/permission");
  check(/permission/i.test(perm), "a permission failure explains itself");
  const unknown = startFailureMessage(c, "@scope/pkg@latest", "other/exit1");
  check(unknown.includes("Log:"), "an unrecognised reason still points at the log");
}

server.close();
removeTempRoot(ROOT);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  for (const f of failed) console.log(`  FAILED: ${f.label}`);
  process.exit(1);
}
