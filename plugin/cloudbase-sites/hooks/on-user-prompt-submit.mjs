#!/usr/bin/env node

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(HOOK_DIR);
const SITES_BIN = join(PLUGIN_ROOT, "bin", "cloudbase-sites");
const HOME_DIR = process.env.HOME || "";

function readPayload() {
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function classifyIntent(input) {
  const text = normalize(input);
  const explicitSites = hasAny(text, EXPLICIT_SITES_PATTERNS);
  const createVerb = hasAny(text, CREATE_VERB_PATTERNS);
  const webObject = hasAny(text, WEB_OBJECT_PATTERNS);
  const previewIntent = hasAny(text, PREVIEW_PATTERNS);

  if ((explicitSites && createVerb) || (createVerb && webObject)) {
    return { kind: "create", confidence: explicitSites ? 0.95 : 0.8 };
  }

  if (hasAny(text, NEGATIVE_PATTERNS)) return { kind: "none", confidence: 0 };
  if (hasAny(text, SAVE_DEPLOY_PATTERNS)) return { kind: "none", confidence: 0 };

  if (previewIntent && (explicitSites || webObject)) {
    return { kind: "preview", confidence: explicitSites ? 0.9 : 0.75 };
  }
  return { kind: "none", confidence: 0 };
}

function normalize(input) {
  return input
    .toLowerCase()
    .replace(/[，。！？、；：]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CREATE_VERB_PATTERNS = [
  /帮我(做|写|建|创建|搭建|开发|生成|实现|起|初始化)/,
  /给我(做|写|建|创建|搭建|开发|生成|实现|起|初始化)/,
  /(做|写|建|搭|创建|新建|搭建|开发|生成|实现|起|初始化)(个|一个)?/,
  /(build|create|make|scaffold|generate|bootstrap|spin up|set up|develop|implement|start|init)\b/,
];

const WEB_OBJECT_PATTERNS = [
  /(网站|站点|网页|页面|官网|落地页|h5|web\s*app|webapp|website|site|landing page|homepage)/,
  /(react|vue|vite|前端项目|前端应用|frontend|front-end)/,
  /(应用|app|dashboard|仪表盘|管理后台|admin panel|todo|待办|kanban|看板|chat|聊天|博客|blog|portfolio|作品集)/,
];

const EXPLICIT_SITES_PATTERNS = [
  /cloudbase\s*sites/,
  /cloudbase-sites/,
  /cloudbase sites/,
  /sites\s*插件/,
  /sites\s*项目/,
  /cloudbase\s*站点/,
];

const PREVIEW_PATTERNS = [
  /\b(preview|run|start|open)\b/,
  /(预览|打开预览|启动预览|本地预览|跑起来|启动|运行).*(网站|站点|网页|页面|应用|项目|vite|react|vue|sites)?/,
  /(preview|run|start|open).*(site|website|web app|app|vite|react|vue|dev server|preview)/,
];

const SAVE_DEPLOY_PATTERNS = [
  /(保存|save|部署|deploy|发布|publish|回滚|rollback|上线)/,
];

const NEGATIVE_PATTERNS = [
  /(分析|解释|说明|调研|研究|看看|检查|审查)/,
  /\b(review|explain|analyze|investigate|research|inspect)\b/,
  /(修复|修一下|报错|错误)/,
  /\b(bug|fix|debug|troubleshoot|error)\b/,
  /(提交|commit|push|pull request|合并|merge|rebase|git|\bpr\b)/,
  /(测试|跑测试|单测)/,
  /\b(test|vitest|jest|playwright|ci)\b/,
  /(文档|教程|指南)/,
  /\b(readme|docs|documentation)\b/,
];

main();

function main() {
  const payload = readPayload();
  const cwd = payload.cwd || payload.project_dir || payload.projectDir || process.cwd();
  const prompt = String(
    payload.prompt ||
    payload.user_prompt ||
    payload.userPrompt ||
    payload.message ||
    payload.initialUserMessage ||
    "",
  );

  if (!prompt.trim() || isBlacklisted(cwd)) {
    process.exit(0);
  }

  const state = inspectCwd(cwd);
  const intent = classifyIntent(prompt);

  if (intent.kind === "none") {
    process.exit(0);
  }

  if (intent.kind === "create" && state.kind === "empty") {
    const command = `${SITES_BIN} init --start`;
    log(cwd, `prompt intent=create confidence=${intent.confidence} cwdState=empty action=init`);
    if (process.env.CLOUDBASE_SITES_INTENT_DRY_RUN !== "1") {
      runDetached(cwd, ["init", "--start"]);
    }
    emitContext(`### CloudBase Sites intent hook

- **detected intent:** create a Sites web app from this prompt
- **cwd state:** empty enough
- **action:** ${process.env.CLOUDBASE_SITES_INTENT_DRY_RUN === "1" ? "dry-run, would run" : "started in background"} \`${command}\`
- **next step:** wait a few seconds, then run \`${SITES_BIN} preview --status\` to get the preview URL. If the user asks to see it, offer to open the URL in the host Browser / in-app browser.`);
    process.exit(0);
  }

  if ((intent.kind === "create" || intent.kind === "preview") && state.kind === "vite") {
    const command = `${SITES_BIN} preview`;
    log(cwd, `prompt intent=${intent.kind} confidence=${intent.confidence} cwdState=vite action=preview`);
    if (process.env.CLOUDBASE_SITES_INTENT_DRY_RUN !== "1") {
      runDetached(cwd, ["preview"]);
    }
    emitContext(`### CloudBase Sites intent hook

- **detected intent:** ${intent.kind === "preview" ? "preview/run this Vite app" : "work on an existing Vite Sites app"}
- **cwd state:** Vite React/Vue project
- **action:** ${process.env.CLOUDBASE_SITES_INTENT_DRY_RUN === "1" ? "dry-run, would run" : "started in background"} \`${command}\`
- **next step:** run \`${SITES_BIN} preview --status\` before quoting a URL, then offer to open it in the host Browser / in-app browser.`);
    process.exit(0);
  }

  if (intent.kind === "create" && state.kind === "foreign") {
    emitContext(`### CloudBase Sites intent hook

- **detected intent:** create a Sites web app
- **cwd state:** non-empty and not a Vite React/Vue project
- **action:** no files changed. Do not initialize here automatically.
- **next step:** ask the user whether to create the Sites app in a new empty directory or continue configuring this existing project.`);
  }
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function inspectCwd(cwd) {
  if (isViteProject(cwd)) return { kind: "vite" };
  if (isEmptyEnough(cwd)) return { kind: "empty" };
  return { kind: "foreign" };
}

function isViteProject(cwd) {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    return !!deps.vite && (!!deps.react || !!deps.vue);
  } catch {
    return false;
  }
}

function isEmptyEnough(cwd) {
  let entries = [];
  try {
    entries = readdirCompat(cwd);
  } catch {
    return false;
  }
  const allowed = new Set([
    ".git",
    ".gitignore",
    ".DS_Store",
    ".cloudbase-sites",
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "README",
    "README.md",
    "README.MD",
    "README.txt",
    "readme.md",
  ]);
  return entries.every((entry) => allowed.has(entry));
}

function readdirCompat(cwd) {
  return readdirSync(cwd);
}

function isBlacklisted(cwd) {
  if (!cwd || cwd === "/" || cwd === "/tmp" || cwd === "/private/tmp" || cwd === "/var" || cwd === "/private/var") {
    return true;
  }
  if (!HOME_DIR) return false;
  return [
    HOME_DIR,
    join(HOME_DIR, "Desktop"),
    join(HOME_DIR, "Downloads"),
    join(HOME_DIR, "Documents"),
    join(HOME_DIR, "Library"),
    join(HOME_DIR, "Movies"),
    join(HOME_DIR, "Music"),
    join(HOME_DIR, "Pictures"),
    join(HOME_DIR, "Public"),
  ].includes(cwd) || cwd.startsWith(`${HOME_DIR}/.`);
}

function runDetached(cwd, args) {
  mkdirSync(join(cwd, ".cloudbase-sites", "logs"), { recursive: true });
  const child = spawn(SITES_BIN, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

function emitContext(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  }));
}

function log(cwd, message) {
  try {
    const logDir = join(HOME_DIR || cwd, ".cloudbase-sites", "logs");
    mkdirSync(logDir, { recursive: true });
    appendFileSync(
      join(logDir, "hook-user-prompt-submit.log"),
      `[${new Date().toISOString()}] [cwd=${cwd}] ${message}\n`,
    );
  } catch {
    // Logging is best-effort; never block the prompt.
  }
}
