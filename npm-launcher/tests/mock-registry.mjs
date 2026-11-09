#!/usr/bin/env node
"use strict";

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const NAME = "@cloudbase/nge-testpkg";
const VERSIONS = ["1.0.0", "2.0.0", "3.0.0", "4.0.0"];

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
  const buf = tarGz([
    { name: "package/package.json", data: Buffer.from(packageJson) },
    { name: "package/bin.js", data: Buffer.from(BIN) },
  ]);
  return {
    buf,
    shasum: crypto.createHash("sha1").update(buf).digest("hex"),
    integrity: "sha512-" + crypto.createHash("sha512").update(buf).digest("base64"),
  };
}

export function startMockRegistry() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nge-registry-"));
  const tars = Object.fromEntries(VERSIONS.map((v) => [v, tarball(v)]));
  const state = { latest: "1.0.0", failVersion: null, offline: false, tarballDelay: 0 };

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "").split("?")[0]);
    if (state.offline) { res.writeHead(503); res.end("offline"); return; }

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
        close: () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); },
      });
    });
  });
}
