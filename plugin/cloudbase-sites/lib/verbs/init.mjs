/**
 * `cloudbase-sites init` — bootstrap CloudBase + React/Vue + Vite project from zero.
 *
 * Steps:
 *   1. Sanity: cwd is not in the danger blacklist.
 *   2. Sanity: cwd is "empty enough" (only .git/.gitignore/README/LICENSE/.cloudbase-sites allowed).
 *   3. Download CloudBase official template zip via HTTPS.
 *   4. Extract zip into cwd (template is a flat zip).
 *   5. Run pnpm/npm install.
 *   6. Optionally `cloudbase-sites preview` if --start passed.
 */

import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import https from "node:https";
import { emitOk, emitErr, withCode } from "../emit.mjs";
import { ensureGitignoreEntry } from "../git-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ERR = {
  GENERIC: 1,
  CWD_BLACKLISTED: 9,
  CWD_NOT_EMPTY: 10,
  DOWNLOAD_FAILED: 11,
  EXTRACT_FAILED: 12,
  INSTALL_FAILED: 13,
};

const TEMPLATE_URLS = {
  react: "https://static.cloudbase.net/cloudbase-examples/web-cloudbase-react-template.zip",
  vue: "https://static.cloudbase.net/cloudbase-examples/web-cloudbase-vue-template.zip",
};

export const initHelp = `cloudbase-sites init — bootstrap CloudBase + React/Vue + Vite project in cwd

Options:
  --template <name>   react (default) | vue
  --start             also start dev server after install (call cloudbase-sites preview)
  --skip-install      download + extract only, no npm/pnpm install

Refuses to run in danger blacklist dirs ($HOME, /, /tmp, ~/Desktop, ...).
Refuses to run if cwd has files other than .git/.gitignore/README/LICENSE/.cloudbase-sites.

Exit codes:  9=cwd blacklisted  10=cwd not empty  11=download failed
             12=extract failed  13=install failed`;

export async function runInit(args) {
  const CWD = process.cwd();

  // 1. Blacklist check.
  const blackReason = checkBlacklist(CWD);
  if (blackReason) {
    throw withCode(ERR.CWD_BLACKLISTED, `Refusing to init in '${CWD}' (${blackReason}). Cd to a project directory first.`);
  }

  // 2. Empty-enough check.
  const occupants = listMeaningfulFiles(CWD);
  if (occupants.length > 0) {
    throw withCode(
      ERR.CWD_NOT_EMPTY,
      `Cwd is not empty (found: ${occupants.slice(0, 5).join(", ")}${occupants.length > 5 ? ", ..." : ""}). Remove or move them first.`,
    );
  }

  const template = args.template || "react";
  if (!TEMPLATE_URLS[template]) {
    throw withCode(ERR.GENERIC, `unsupported template '${template}', expected react|vue`);
  }
  ensureGitignoreEntry(CWD, ".cloudbase-sites/");
  const url = TEMPLATE_URLS[template];

  // 3. Download.
  const zipPath = join(CWD, ".cloudbase-sites", "template.zip");
  mkdirSync(dirname(zipPath), { recursive: true });
  process.stderr.write(`[cloudbase-sites] downloading ${template} template…\n`);
  await downloadFile(url, zipPath);

  // 4. Extract.
  process.stderr.write(`[cloudbase-sites] extracting…\n`);
  const unzipR = spawnSync("unzip", ["-q", "-o", zipPath, "-d", CWD], { stdio: "inherit" });
  if (unzipR.status !== 0) {
    throw withCode(ERR.EXTRACT_FAILED, `unzip exited with code ${unzipR.status}. Is 'unzip' installed?`);
  }
  try { rmSync(zipPath); } catch {}

  // 5. Install.
  if (!args.skipInstall) {
    process.stderr.write(`[cloudbase-sites] installing dependencies (this may take ~30s)…\n`);
    const ok = runInstall(CWD);
    if (!ok) throw withCode(ERR.INSTALL_FAILED, "dependency install failed; see terminal output above");
  }

  // 6. Optionally start preview.
  let preview = null;
  if (args.start) {
    process.stderr.write(`[cloudbase-sites] starting preview…\n`);
    preview = await runPreviewSubprocess();
  }

  emitOk(
    {
      template,
      cwd: CWD,
      installed: !args.skipInstall,
      preview,
    },
    `init complete: cloudbase + ${template} + vite scaffolded in cwd${args.start ? ` (preview: ${preview?.internalUrl || "?"})` : ""}`,
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function checkBlacklist(cwd) {
  const home = homedir();
  let real = cwd;
  try { real = realpathSync(cwd); } catch {}
  const candidates = [cwd, real];
  const exact = [
    "/", "/tmp", "/var", "/private/tmp", "/private/var",
    "/Users", "/Volumes", "/System", "/usr", "/etc", "/bin", "/sbin",
    home,
    join(home, "Desktop"), join(home, "Downloads"), join(home, "Documents"),
    join(home, "Library"), join(home, "Movies"), join(home, "Music"),
    join(home, "Pictures"), join(home, "Public"),
  ];
  for (const c of candidates) {
    const cn = c.replace(/\/$/, "") || "/";
    if (exact.includes(cn)) return `cwd '${cn}' is on the danger blacklist`;
  }
  for (const c of candidates) {
    const cn = c.replace(/\/$/, "");
    if (cn.startsWith(home + "/.")) return `cwd '${cn}' looks like a hidden config dir under $HOME`;
  }
  return null;
}

function listMeaningfulFiles(dir) {
  const ignored = new Set([
    ".git", ".gitignore", ".DS_Store", "Thumbs.db", ".cloudbase-sites",
    "LICENSE", "LICENSE.md", "LICENSE.txt",
  ]);
  const ignoredPatterns = [/^README(\.[a-z]+)?$/i];
  return readdirSync(dir).filter((name) => {
    if (ignored.has(name)) return false;
    if (ignoredPatterns.some((re) => re.test(name))) return false;
    return true;
  });
}

function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(withCode(ERR.DOWNLOAD_FAILED, "too many redirects"));
    https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        const loc = res.headers.location;
        if (!loc) return reject(withCode(ERR.DOWNLOAD_FAILED, `redirect ${res.statusCode} without Location`));
        res.resume();
        return downloadFile(loc, dest, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(withCode(ERR.DOWNLOAD_FAILED, `HTTP ${res.statusCode} from ${url}`));
      }
      const out = createWriteStream(dest);
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve()));
      out.on("error", (e) => reject(withCode(ERR.DOWNLOAD_FAILED, `write failed: ${e.message}`)));
    }).on("error", (e) => reject(withCode(ERR.DOWNLOAD_FAILED, `request failed: ${e.message}`)));
  });
}

function runInstall(cwd) {
  const which = (b) => spawnSync(process.platform === "win32" ? "where" : "which", [b], { stdio: "ignore" }).status === 0;
  let cmd, argv;
  if (existsSync(join(cwd, "pnpm-lock.yaml")) && which("pnpm")) { cmd = "pnpm"; argv = ["install"]; }
  else if (which("pnpm")) { cmd = "pnpm"; argv = ["install"]; }
  else if (which("npm"))  { cmd = "npm";  argv = ["install"]; }
  else return false;
  const r = spawnSync(cmd, argv, { cwd, stdio: ["ignore", "inherit", "inherit"], env: process.env });
  return r.status === 0;
}

async function runPreviewSubprocess() {
  // Re-invoke own binary to call the preview verb. We use the binary path
  // via PATH (since the plugin host adds bin/ to PATH); fall back to absolute.
  const sitesBin = which("cloudbase-sites") || join(__dirname, "..", "..", "bin", "cloudbase-sites");
  return new Promise((resolve) => {
    const c = spawn(sitesBin, ["preview"], { stdio: ["ignore", "pipe", "inherit"] });
    let buf = "";
    c.stdout.on("data", (b) => { buf += b.toString(); });
    c.on("exit", () => {
      try {
        const line = buf.split("\n").find((l) => l.trim().startsWith("{"));
        resolve(line ? JSON.parse(line) : null);
      } catch { resolve(null); }
    });
  });
}

function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: ["ignore", "pipe", "ignore"] });
  if (r.status !== 0) return null;
  return r.stdout.toString().split("\n")[0].trim() || null;
}
