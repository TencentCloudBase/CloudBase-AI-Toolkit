#!/usr/bin/env node
/**
 * WorkBuddy template prewarm — download + extract + install CloudBase React zip,
 * then optionally start Sites-aligned preview (port pool 17173..17272).
 *
 * Credential-free (HTTPS to static.cloudbase.net only). Intended to run in the
 * background during SessionStart while the user finishes sre-aihub / connector Trust.
 *
 * Usage:
 *   node prewarm.mjs --cwd <dir> [--template react|vue] [--fg] [--skip-install] [--start-preview|--no-preview]
 *   node prewarm.mjs --status --cwd <dir>
 *   node prewarm.mjs --preview-only --cwd <dir>
 *
 * Exit codes: 0 ok, 9 blacklisted, 10 not empty, 11 download, 12 extract, 13 install, 14 preview
 */

import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import https from "node:https";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, "..");

const TEMPLATE_URLS = {
  react: "https://static.cloudbase.net/cloudbase-examples/web-cloudbase-react-template.zip",
  vue: "https://static.cloudbase.net/cloudbase-examples/web-cloudbase-vue-template.zip",
};

const CACHE_DIR = join(homedir(), ".cloudbase", "cache", "templates");
const STATE_DIR_NAME = ".cloudbase-prewarm";

/**
 * WorkBuddy rejects project rule files over 40 KiB ("Rule file exceeds maximum size").
 * Official React/Vue zips ship AGENTS.md / CLAUDE.md / CODEBUDDY.md ≈ 41KB.
 */
const MAX_RULE_BYTES = 40 * 1024;

const OVERSIZED_RULE_BASENAMES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "CODEBUDDY.md",
  ".augment-guidelines",
  "cloudbase-rules.mdc",
]);

const RULE_STUB = `---
description: CloudBase compact rules (WorkBuddy size-safe stub)
alwaysApply: true
---

# CloudBase (size-safe stub)

The official template rule file exceeded WorkBuddy's 40 KiB limit and was
replaced during \`workbuddy-template-prewarm\` extract.

Follow SessionStart \`additionalContext\` from the prewarm plugin.
For minimal Web + DB demos, fetch skill \`minimal-web-baas-demo\` via
\`searchKnowledgeBase(mode="skill", skillName="minimal-web-baas-demo")\`.
Prefer \`@cloudbase/js-sdk\` browser CRUD; do not scaffold cloud functions for
Todo / Notes / Chat demos unless secrets, cron, or rules-cannot-express.
`;

function parseArgs(argv) {
  const previewEnv = process.env.CLOUDBASE_WORKBUDDY_PREVIEW;
  const out = {
    cwd: process.cwd(),
    template: "react",
    fg: false,
    skipInstall: false,
    status: false,
    previewOnly: false,
    // Default ON unless explicitly disabled (align with Sites preview automation).
    startPreview: previewEnv === undefined ? true : previewEnv !== "0",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") out.cwd = argv[++i];
    else if (a === "--template") out.template = argv[++i];
    else if (a === "--fg") out.fg = true;
    else if (a === "--skip-install") out.skipInstall = true;
    else if (a === "--status") out.status = true;
    else if (a === "--preview-only") out.previewOnly = true;
    else if (a === "--start-preview") out.startPreview = true;
    else if (a === "--no-preview") out.startPreview = false;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function checkBlacklist(cwd) {
  const home = homedir();
  let real = cwd;
  try {
    real = realpathSync(cwd);
  } catch {
    /* use cwd */
  }
  const candidates = [cwd, real];
  const exact = [
    "/",
    "/tmp",
    "/var",
    "/private/tmp",
    "/private/var",
    "/Users",
    "/Volumes",
    "/System",
    "/usr",
    "/etc",
    "/bin",
    "/sbin",
    home,
    join(home, "Desktop"),
    join(home, "Downloads"),
    join(home, "Documents"),
    join(home, "Library"),
    join(home, "Movies"),
    join(home, "Music"),
    join(home, "Pictures"),
    join(home, "Public"),
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
    ".git",
    ".gitignore",
    ".DS_Store",
    "Thumbs.db",
    STATE_DIR_NAME,
    ".cloudbase-sites",
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
  ]);
  const ignoredPatterns = [/^README(\.[a-z]+)?$/i];
  return readdirSync(dir).filter((name) => {
    if (ignored.has(name)) return false;
    if (ignoredPatterns.some((re) => re.test(name))) return false;
    return true;
  });
}

function isViteProject(dir) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    return Boolean(deps.vite);
  } catch {
    return false;
  }
}

function statePath(cwd) {
  return join(cwd, STATE_DIR_NAME, "state.json");
}

function writeState(cwd, patch) {
  const dir = join(cwd, STATE_DIR_NAME);
  mkdirSync(dir, { recursive: true });
  const path = statePath(cwd);
  let prev = {};
  try {
    prev = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    /* empty */
  }
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(next, null, 2));
  return next;
}

function readState(cwd) {
  try {
    return JSON.parse(readFileSync(statePath(cwd), "utf8"));
  } catch {
    return null;
  }
}

function readPreviewJson(cwd) {
  try {
    return JSON.parse(readFileSync(join(cwd, ".cloudbase-sites", "preview.json"), "utf8"));
  } catch {
    return null;
  }
}

function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    https
      .get(url, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
          const loc = res.headers.location;
          if (!loc) return reject(new Error(`redirect ${res.statusCode} without Location`));
          res.resume();
          return downloadFile(loc, dest, redirects + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
        const out = createWriteStream(dest);
        res.pipe(out);
        out.on("finish", () => out.close(() => resolve()));
        out.on("error", (e) => reject(e));
      })
      .on("error", reject);
  });
}

function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0) return null;
  return r.stdout.toString().split("\n")[0].trim() || null;
}

/**
 * Resolve cloudbase-sites CLI for preview port management (Sites-aligned).
 *
 * Order:
 * 1. CLOUDBASE_SITES_BIN
 * 2. Vendored copy inside this plugin (marketplace self-contained)
 * 3. Monorepo / marketplace sibling plugin/cloudbase-sites
 * 4. Host plugin caches / marketplace checkouts under ~/.workbuddy|~/.codebuddy
 * 5. PATH
 */
function resolveSitesBin() {
  if (process.env.CLOUDBASE_SITES_BIN && existsSync(process.env.CLOUDBASE_SITES_BIN)) {
    return process.env.CLOUDBASE_SITES_BIN;
  }

  const candidates = [];

  const pushIf = (p) => {
    if (p && !candidates.includes(p)) candidates.push(p);
  };

  pushIf(join(PLUGIN_ROOT, "vendor", "cloudbase-sites", "bin", "cloudbase-sites"));
  pushIf(join(PLUGIN_ROOT, "..", "cloudbase-sites", "bin", "cloudbase-sites"));

  // Cache layout: .../cache/<marketplace>/workbuddy-template-prewarm/<ver>
  // Sibling dep:  .../cache/<marketplace>/cloudbase-sites/<ver>/bin/...
  const cachePluginRoot = join(PLUGIN_ROOT, "..", "..");
  try {
    const marketRoot = join(PLUGIN_ROOT, "..");
    for (const name of readdirSync(marketRoot)) {
      if (!name.startsWith("cloudbase-sites")) continue;
      const direct = join(marketRoot, name, "bin", "cloudbase-sites");
      pushIf(direct);
      try {
        for (const ver of readdirSync(join(marketRoot, name))) {
          pushIf(join(marketRoot, name, ver, "bin", "cloudbase-sites"));
        }
      } catch {
        /* not a versioned dir */
      }
    }
    void cachePluginRoot;
  } catch {
    /* ignore */
  }

  const home = homedir();
  const homeRoots = [
    join(home, ".workbuddy", "plugins", "marketplaces"),
    join(home, ".codebuddy", "plugins", "marketplaces"),
    join(home, ".workbuddy", "plugins", "cache"),
    join(home, ".codebuddy", "plugins", "cache"),
  ];
  for (const root of homeRoots) {
    if (!existsSync(root)) continue;
    try {
      for (const market of readdirSync(root)) {
        pushIf(join(root, market, "plugin", "cloudbase-sites", "bin", "cloudbase-sites"));
        pushIf(join(root, market, "cloudbase-sites", "bin", "cloudbase-sites"));
        const versioned = join(root, market, "cloudbase-sites");
        if (!existsSync(versioned)) continue;
        try {
          for (const ver of readdirSync(versioned)) {
            pushIf(join(versioned, ver, "bin", "cloudbase-sites"));
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return which("cloudbase-sites");
}

function runInstall(cwd) {
  let cmd;
  let argv;
  // Always isolate from parent monorepos. WorkBuddy empty projects often live
  // under $HOME or org trees that have a pnpm-workspace.yaml (e.g. packages: "*/*").
  // Without --ignore-workspace, pnpm joins that workspace and install fails.
  if (existsSync(join(cwd, "pnpm-lock.yaml")) && which("pnpm")) {
    cmd = "pnpm";
    argv = ["install", "--ignore-workspace"];
  } else if (which("pnpm")) {
    cmd = "pnpm";
    argv = ["install", "--ignore-workspace"];
  } else if (which("npm")) {
    cmd = "npm";
    argv = ["install"];
  } else {
    return false;
  }
  const r = spawnSync(cmd, argv, {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });
  return r.status === 0;
}

/**
 * Start Sites preview daemon (ports 17173..17272). Non-fatal if Sites bin missing.
 * Uses --status first for idempotency (same as Sites SessionStart).
 */
function ensureSitesPreview(cwd) {
  const bin = resolveSitesBin();
  if (!bin) {
    return {
      ok: false,
      skipped: true,
      reason: "cloudbase-sites CLI not found (set CLOUDBASE_SITES_BIN or keep sibling plugin)",
    };
  }

  const status = spawnSync(bin, ["preview", "--status", "--quiet"], {
    cwd,
    stdio: "ignore",
    env: process.env,
  });
  if (status.status === 0) {
    const preview = readPreviewJson(cwd);
    return {
      ok: true,
      alreadyRunning: true,
      sitesBin: bin,
      port: preview?.port ?? null,
      internalUrl: preview?.internalUrl ?? null,
    };
  }

  // Detach like Sites SessionStart — do not block hook/prewarm wall clock.
  const child = spawn(bin, ["preview"], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  return {
    ok: true,
    started: true,
    sitesBin: bin,
    pid: child.pid,
    note: "preview starting; poll .cloudbase-sites/preview.json or cloudbase-sites preview --status",
  };
}

async function ensureCachedZip(template) {
  const url = TEMPLATE_URLS[template];
  if (!url) throw Object.assign(new Error(`unsupported template ${template}`), { code: 1 });
  mkdirSync(CACHE_DIR, { recursive: true });
  const cached = join(CACHE_DIR, `web-cloudbase-${template}-template.zip`);
  const partial = cached + ".partial";
  // Reuse cache if present and non-empty.
  if (existsSync(cached)) {
    try {
      const st = readFileSync(cached);
      if (st.length > 1000) return cached;
    } catch {
      /* redownload */
    }
  }
  await downloadFile(url, partial);
  renameSync(partial, cached);
  return cached;
}

function shouldSkipWalkDir(name) {
  return (
    name === "node_modules" ||
    name === ".git" ||
    name === STATE_DIR_NAME ||
    name === ".cloudbase-sites" ||
    name === "dist" ||
    name === "build" ||
    name === ".next"
  );
}

/**
 * Walk project tree for known WorkBuddy/IDE rule entrypoints.
 * Returns absolute paths only (files + symlinks to files).
 */
function collectRuleEntrypointPaths(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!shouldSkipWalkDir(ent.name)) stack.push(full);
        continue;
      }
      if (!OVERSIZED_RULE_BASENAMES.has(ent.name)) continue;
      // Follow only plain files / symlinks; skip weird types.
      try {
        const st = lstatSync(full);
        if (st.isFile() || st.isSymbolicLink()) out.push(full);
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

/**
 * Replace oversized rule entrypoints with a compact stub so WorkBuddy can load
 * the project after prewarm (official zip AGENTS.md ≈ 41KB > 40 KiB host cap).
 *
 * Opt out: CLOUDBASE_WORKBUDDY_STRIP_RULES=0
 */
function stripOversizedRuleFiles(cwd) {
  if (process.env.CLOUDBASE_WORKBUDDY_STRIP_RULES === "0") {
    return { skipped: true, reason: "CLOUDBASE_WORKBUDDY_STRIP_RULES=0", replaced: [] };
  }

  const stubBytes = Buffer.byteLength(RULE_STUB, "utf8");
  if (stubBytes >= MAX_RULE_BYTES) {
    // Defensive: never write a stub that still fails the host check.
    return { skipped: true, reason: "stub itself exceeds MAX_RULE_BYTES", replaced: [] };
  }

  const replaced = [];
  for (const abs of collectRuleEntrypointPaths(cwd)) {
    let size;
    try {
      // Use target size for symlinks (WorkBuddy reads the content).
      size = statSync(abs).size;
    } catch {
      continue;
    }
    if (size <= MAX_RULE_BYTES) continue;

    const rel = relative(cwd, abs) || basename(abs);
    try {
      // Break hardlinks / symlinks so we do not mutate shared inode content.
      try {
        const lst = lstatSync(abs);
        if (lst.isSymbolicLink() || lst.nlink > 1) unlinkSync(abs);
      } catch {
        /* fall through to overwrite */
      }
      writeFileSync(abs, RULE_STUB, "utf8");
      replaced.push({
        path: rel,
        beforeBytes: size,
        afterBytes: stubBytes,
        action: "replaced-with-stub",
      });
    } catch (e) {
      replaced.push({
        path: rel,
        beforeBytes: size,
        action: "error",
        error: e && e.message ? e.message : String(e),
      });
    }
  }

  return {
    skipped: false,
    maxRuleBytes: MAX_RULE_BYTES,
    replaced,
  };
}

async function prewarmEmpty(cwd, template, skipInstall) {
  writeState(cwd, { status: "downloading", template, phase: "download" });
  const cached = await ensureCachedZip(template);
  const zipPath = join(cwd, STATE_DIR_NAME, "template.zip");
  mkdirSync(dirname(zipPath), { recursive: true });
  // Copy from cache (spawn cp — avoids loading whole zip in memory).
  const cp = spawnSync("cp", [cached, zipPath], { stdio: "inherit" });
  if (cp.status !== 0) throw Object.assign(new Error("cache copy failed"), { code: 11 });

  writeState(cwd, { status: "extracting", phase: "extract" });
  const unzipR = spawnSync("unzip", ["-q", "-o", zipPath, "-d", cwd], { stdio: "inherit" });
  if (unzipR.status !== 0) throw Object.assign(new Error(`unzip exited ${unzipR.status}`), { code: 12 });
  try {
    rmSync(zipPath);
  } catch {
    /* ignore */
  }

  // WorkBuddy host rejects >40 KiB rule files; strip before install/preview.
  writeState(cwd, { status: "extracting", phase: "strip-rules" });
  const strippedRules = stripOversizedRuleFiles(cwd);
  if (strippedRules.replaced?.length) {
    process.stderr.write(
      `[prewarm] stripped ${strippedRules.replaced.length} oversized rule file(s) (>${MAX_RULE_BYTES} bytes)\n`,
    );
  }

  if (!skipInstall) {
    writeState(cwd, { status: "installing", phase: "install", strippedRules });
    const ok = runInstall(cwd);
    if (!ok) throw Object.assign(new Error("dependency install failed"), { code: 13 });
  }

  return writeState(cwd, {
    status: "ready",
    phase: "done",
    template,
    installed: !skipInstall,
    packageJson: existsSync(join(cwd, "package.json")),
    nodeModules: existsSync(join(cwd, "node_modules")),
    strippedRules,
  });
}

async function prewarmInstallOnly(cwd) {
  writeState(cwd, { status: "installing", phase: "install", template: "existing-vite" });
  const ok = runInstall(cwd);
  if (!ok) throw Object.assign(new Error("dependency install failed"), { code: 13 });
  return writeState(cwd, {
    status: "ready",
    phase: "done",
    template: "existing-vite",
    installed: true,
    nodeModules: existsSync(join(cwd, "node_modules")),
  });
}

function decide(cwd) {
  const black = checkBlacklist(cwd);
  if (black) return { action: "skip", reason: black, code: 9 };
  if (isViteProject(cwd)) {
    if (!existsSync(join(cwd, "node_modules"))) {
      return { action: "install-only", reason: "vite project missing node_modules" };
    }
    return { action: "skip", reason: "vite project already installed", code: 0 };
  }
  const occupants = listMeaningfulFiles(cwd);
  if (occupants.length > 0) {
    return {
      action: "skip",
      reason: `cwd not empty (found: ${occupants.slice(0, 5).join(", ")})`,
      code: 10,
    };
  }
  return { action: "init", reason: "empty-enough cwd" };
}

function maybeStartPreview(cwd, startPreview) {
  if (!startPreview) {
    return writeState(cwd, { preview: { skipped: true, reason: "CLOUDBASE_WORKBUDDY_PREVIEW=0 or --no-preview" } });
  }
  writeState(cwd, { phase: "preview", preview: { starting: true } });
  const result = ensureSitesPreview(cwd);
  return writeState(cwd, {
    phase: result.ok ? "done" : "preview-skipped",
    preview: result,
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(
      `Usage: node prewarm.mjs --cwd <dir> [--template react|vue] [--fg] [--skip-install] [--start-preview|--no-preview]\n` +
        `       node prewarm.mjs --status --cwd <dir>\n` +
        `       node prewarm.mjs --preview-only --cwd <dir>\n`,
    );
    process.exit(0);
  }
  if (args.status) {
    const s = readState(args.cwd);
    const preview = readPreviewJson(args.cwd);
    process.stdout.write(
      JSON.stringify(
        {
          ...(s || { status: "none" }),
          sitesPreview: preview
            ? { port: preview.port, internalUrl: preview.internalUrl, pid: preview.pid }
            : null,
          sitesBin: resolveSitesBin(),
        },
        null,
        2,
      ) + "\n",
    );
    process.exit(0);
  }

  if (args.previewOnly) {
    const black = checkBlacklist(args.cwd);
    if (black) {
      process.stderr.write(`[prewarm] skip: ${black}\n`);
      process.exit(9);
    }
    if (!isViteProject(args.cwd) || !existsSync(join(args.cwd, "node_modules"))) {
      process.stderr.write(`[prewarm] preview-only requires Vite project with node_modules\n`);
      process.exit(14);
    }
    const state = maybeStartPreview(args.cwd, true);
    process.stdout.write(JSON.stringify({ ok: true, state }, null, 2) + "\n");
    process.exit(state.preview?.ok || state.preview?.skipped ? 0 : 14);
  }

  const decision = decide(args.cwd);
  if (decision.action === "skip") {
    // Already-installed Vite: still ensure Sites preview (Sites SessionStart parity).
    if (isViteProject(args.cwd) && existsSync(join(args.cwd, "node_modules")) && args.startPreview) {
      const state = maybeStartPreview(args.cwd, true);
      writeState(args.cwd, { status: "ready", reason: decision.reason });
      process.stdout.write(JSON.stringify({ ok: true, skippedInit: true, state }, null, 2) + "\n");
      process.exit(0);
    }
    writeState(args.cwd, { status: "skipped", reason: decision.reason });
    process.stderr.write(`[prewarm] skip: ${decision.reason}\n`);
    process.exit(decision.code || 0);
  }

  try {
    // Install/init writes state to disk; maybeStartPreview merges via writeState.
    if (decision.action === "install-only") {
      await prewarmInstallOnly(args.cwd);
    } else {
      await prewarmEmpty(args.cwd, args.template, args.skipInstall);
    }
    const state = maybeStartPreview(args.cwd, args.startPreview);
    process.stdout.write(JSON.stringify({ ok: true, state }, null, 2) + "\n");
    process.exit(0);
  } catch (e) {
    writeState(args.cwd, { status: "error", error: e.message, phase: "error" });
    process.stderr.write(`[prewarm] error: ${e.message}\n`);
    process.exit(e.code || 1);
  }
}

main();
