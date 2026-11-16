#!/usr/bin/env node
"use strict";

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const NAME = "@cloudbase/nge-testpkg";
const VERSIONS = ["1.0.0", "2.0.0", "3.0.0", "4.0.0", "5.0.0"];
// 5.0.0 exits 1 immediately: a release that crashes on start.
const CRASH_VERSION = "5.0.0";
const LAUNCHER = "@cloudbase/npm-launcher";

const BIN = `#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const sleepAt = process.argv.indexOf("--sleep");
if (sleepAt > -1) {
  // Keep the launcher alive long enough for a fire-and-forget telemetry request
  // to flush, but exit on its own so the test works on Windows too.
  setTimeout(() => { console.log("TARGET_OK " + pkg.version); process.exit(0); },
    Number(process.argv[sleepAt + 1] || 1000));
} else if (process.argv.includes("--hold")) {
  process.on("SIGTERM", () => { console.log("GOT_SIGTERM"); process.exit(0); });
  setInterval(() => {}, 1000);
} else {
  console.log("TARGET_OK " + pkg.version + " " + process.argv.slice(2).join(" "));
}
`;

// Pure JS USTAR + gzip: no system `tar` binary, so the suite runs on Windows too.
function tarGz(files) {
  const chunks = [];
  for (const f of files) {
    const h = Buffer.alloc(512);
    h.write(f.name, 0, 100, "utf8");
    h.write("0000644\0", 100, 8, "utf8");
    h.write("0000000\0", 108, 8, "utf8");
    h.write("0000000\0", 116, 8, "utf8");
    h.write(f.data.length.toString(8).padStart(11, "0") + "\0", 124, 12, "utf8");
    h.write("00000000000\0", 136, 12, "utf8");
    h.fill(0x20, 148, 156);
    h.write("0", 156, 1, "utf8");
    h.write("ustar\0", 257, 6, "utf8");
    h.write("00", 263, 2, "utf8");
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
    chunks.push(h, f.data);
    const pad = (512 - (f.data.length % 512)) % 512;
    if (pad) chunks.push(Buffer.alloc(pad));
  }
  chunks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(chunks));
}

function tarball(version) {
  const packageJson = JSON.stringify({
    name: NAME, version, private: true,
    bin: { "nge-testpkg": "bin.js" },
  });
  const bin = version === CRASH_VERSION
    ? '#!/usr/bin/env node\nprocess.stderr.write("boom\\n"); process.exit(1);\n'
    : BIN;
  return pack([
    { name: "package/package.json", data: Buffer.from(packageJson) },
    { name: "package/bin.js", data: Buffer.from(bin) },
  ]);
}

function pack(files) {
  const buf = tarGz(files);
  return {
    buf,
    shasum: crypto.createHash("sha1").update(buf).digest("hex"),
    integrity: "sha512-" + crypto.createHash("sha512").update(buf).digest("base64"),
  };
}

// Launcher copies for self-update tests: { version: indexJsSource }.
function launcherTarball(version, source) {
  const packageJson = JSON.stringify({
    name: LAUNCHER, version, main: "index.js", bin: { "npm-launcher": "index.js" },
  });
  return pack([
    { name: "package/package.json", data: Buffer.from(packageJson) },
    { name: "package/index.js", data: Buffer.from(source) },
  ]);
}

export function startMockRegistry() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nge-registry-"));
  const tars = Object.fromEntries(VERSIONS.map((v) => [v, tarball(v)]));
  // mode: "ok" | "empty" (200 with empty body) | "500"
  const state = { latest: "1.0.0", failVersion: null, offline: false, tarballDelay: 0, mode: "ok", hits: 0 };
  const launcher = { stable: null, versions: {}, tars: {}, time: {} };

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "").split("?")[0]);
    state.hits += 1;
    if (state.offline) { res.writeHead(503); res.end("offline"); return; }
    if (state.mode === "empty") { res.writeHead(200, { "content-type": "application/json" }); res.end(""); return; }
    if (state.mode === "500") { res.writeHead(500); res.end("server error"); return; }

    const ltgz = url.match(/npm-launcher-([0-9.]+)\.tgz$/);
    if (ltgz) {
      const t = launcher.tars[ltgz[1]];
      if (!t) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(t.buf);
      return;
    }
    if (url.includes("npm-launcher")) {
      const port = server.address().port;
      const versions = {};
      for (const v of Object.keys(launcher.tars)) {
        versions[v] = {
          name: LAUNCHER, version: v, bin: { "npm-launcher": "index.js" }, dependencies: {},
          dist: {
            tarball: `http://127.0.0.1:${port}/@cloudbase/npm-launcher/-/npm-launcher-${v}.tgz`,
            shasum: launcher.tars[v].shasum, integrity: launcher.tars[v].integrity,
          },
        };
      }
      const single = url.match(/npm-launcher\/([0-9][^/]*)$/);
      if (single) {
        if (!versions[single[1]]) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(versions[single[1]]));
        return;
      }
      const tags = launcher.stable ? { stable: launcher.stable, latest: launcher.stable } : {};
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ name: LAUNCHER, "dist-tags": tags, versions, time: launcher.time }));
      return;
    }

    const tgz = url.match(/nge-testpkg-([0-9.]+)\.tgz$/);
    if (tgz) {
      const v = tgz[1];
      if (!tars[v] || state.failVersion === v) { res.writeHead(500); res.end("broken tarball"); return; }
      // A delay keeps an install in flight long enough for a test to kill it.
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(tars[v].buf);
      }, state.tarballDelay);
      return;
    }
    if (url.includes("nge-testpkg")) {
      const versions = {};
      for (const v of VERSIONS) {
        versions[v] = {
          name: NAME, version: v, bin: { "nge-testpkg": "bin.js" }, dependencies: {},
          dist: {
            tarball: `http://127.0.0.1:${server.address().port}/@cloudbase/nge-testpkg/-/nge-testpkg-${v}.tgz`,
            shasum: tars[v].shasum,
            integrity: tars[v].integrity,
          },
        };
      }
      const single = url.match(/nge-testpkg\/([0-9][^/]*)$/);
      if (single) {
        if (!versions[single[1]]) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(versions[single[1]]));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ name: NAME, "dist-tags": { latest: state.latest }, versions }));
      return;
    }
    res.writeHead(404); res.end("not found");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${server.address().port}/`;
      resolve({
        url,
        setLatest: (v) => { state.latest = v; },
        failTarball: (v) => { state.failVersion = v; },
        setOffline: (v) => { state.offline = v; },
        setTarballDelay: (ms) => { state.tarballDelay = ms; },
        setMode: (m) => { state.mode = m; },
        hits: () => state.hits,
        resetHits: () => { state.hits = 0; },
        // Publish a launcher copy; `ageMs` back-dates its publish time.
        publishLauncher: (version, source, ageMs = 0) => {
          launcher.tars[version] = launcherTarball(version, source);
          launcher.time[version] = new Date(Date.now() - ageMs).toISOString();
        },
        setLauncherStable: (v) => { launcher.stable = v; },
        close: () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); },
      });
    });
  });
}
