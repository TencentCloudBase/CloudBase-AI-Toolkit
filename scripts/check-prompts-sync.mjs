#!/usr/bin/env node
/**
 * Guard: CloudBase Skill 文档必须与 skills 源保持同步。
 *
 * 两项检查：
 *
 * 1) 覆盖率（静默漏配检测）
 *    `config/source/skills/<name>/SKILL.md` 必须登记进 `doc/prompts/config.yaml`
 *    （通过 `rules[].id` 或 `rules[].ruleDir` 指向），否则该 skill 不会生成文档页、
 *    也不会出现在侧边栏 —— 这正是历史上 8 个 skill 长期没有文档页的原因。
 *    确实不该有文档页的 skill 必须显式写进下面的 EXCLUDED_SKILLS 并给出理由，
 *    让"新增 skill 不配文档"必须经过一次显式决策，而不是静默漏掉。
 *
 * 2) 新鲜度（产物漂移检测）
 *    跑一遍生成器后，产物必须与仓库中已提交的内容一致：
 *      doc/prompts/*.mdx、doc/components/prompts.json、doc/sidebar.json
 *    不一致说明有人改了 skills 源但没有重新生成。生成器会把产物刷成最新，
 *    所以本检查失败时工作区里已经是修好的版本，直接提交即可。
 *
 * 3) 链接目标（离线、确定性）
 *    文档页里指向 CNB 源仓库的链接，其路径必须能在本地 skills 源里找到。
 *    生成器把 SKILL.md 内的相对链接改写成 CNB 绝对地址，一旦源文件改名/移动而没重生成，
 *    或者生成器改写规则出错，都会在这里被拦下 —— 不需要联网。
 *
 * 用法：
 *   npm run check:prompts-sync                    # 覆盖率 + 产物新鲜度 + 链接目标
 *   node scripts/check-prompts-sync.mjs --coverage-only   # 只查覆盖率（供 vitest 复用）
 *   node scripts/check-prompts-sync.mjs --check-links     # 额外联网验证 CNB 链接可访问
 *
 * 退出码：0 = 通过；1 = 需要处理（输出中带 [prompts-sync] 标记与修复命令）。
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadYamlModule } from './lib/load-yaml-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const SKILLS_DIR = path.join(ROOT_DIR, 'config', 'source', 'skills');
const PROMPTS_DIR = path.join(ROOT_DIR, 'doc', 'prompts');
const CONFIG_FILE = path.join(PROMPTS_DIR, 'config.yaml');
const GENERATORS = [
  'scripts/generate-prompts-data.mjs',
  'scripts/generate-prompts.mjs',
];

/**
 * 有意不生成文档页的 skill（skill 目录名 -> 理由）。
 * 新增例外必须写理由，这是唯一的"允许漏掉"入口。
 */
const EXCLUDED_SKILLS = new Map([
  // ['some-internal-skill', '仅内部使用，不面向文档站读者'],
]);

/** 生成器产物（会被本检查比对的文件/目录） */
const ARTIFACT_PATHS = [
  path.join(ROOT_DIR, 'doc', 'prompts'),
  path.join(ROOT_DIR, 'doc', 'components', 'prompts.json'),
  path.join(ROOT_DIR, 'doc', 'sidebar.json'),
];

const FIX_COMMAND = 'npm run build:prompts-data';

/** 生成器把 SKILL.md 内的相对链接改写成该 CNB 镜像的绝对地址 */
const CNB_REPO_URL = 'https://cnb.cool/tencent/cloud/cloudbase/CloudBase-AI-Toolkit';
/** 取回 CNB 链接对应的仓库内路径（raw 与 blob 两种形式都要认） */
const CNB_LINK_RE = new RegExp(
  `${CNB_REPO_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/-/(?:git/raw|blob)/[^/]+/([^)\\s#]+)`,
  'g',
);
/** 页面里改写后的 CNB raw 链接（用于核对改写覆盖面） */
const CNB_RAW_LINK_RE = /\/-\/git\/raw\/main\/config\/source\/skills\//g;
/** 联网存活检查的并发度与节奏（CNB 对突发并发会返回 429，必须慢发） */
const LINK_CHECK_CONCURRENCY = 3;
const LINK_CHECK_DELAY_MS = 200;
const LINK_CHECK_ATTEMPTS = 3;

function fail(lines) {
  console.error('');
  lines.forEach((line) => console.error(line));
  console.error('');
  process.exit(1);
}

function listSourceSkills() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fail([`[prompts-sync] 找不到 skills 源目录：${SKILLS_DIR}`]);
  }

  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')))
    .sort();
}

function loadRules() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fail([`[prompts-sync] 找不到配置：${CONFIG_FILE}`]);
  }

  return { configPath: CONFIG_FILE };
}

async function readConfig() {
  const yaml = await loadYamlModule(ROOT_DIR);
  const config = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!config || !Array.isArray(config.rules)) {
    fail([`[prompts-sync] 配置非法（缺少 rules 数组）：${CONFIG_FILE}`]);
  }
  return config;
}

/** 检查 1：源 skill 与 config.yaml 的双向覆盖 */
function checkCoverage(config) {
  const sourceSkills = listSourceSkills();
  const registeredDirs = new Set();
  config.rules.forEach((rule) => registeredDirs.add(rule.ruleDir || rule.id));

  const unregistered = sourceSkills.filter(
    (name) => !registeredDirs.has(name) && !EXCLUDED_SKILLS.has(name),
  );

  const dangling = config.rules
    .map((rule) => ({ id: rule.id, dir: rule.ruleDir || rule.id }))
    .filter((rule) => !fs.existsSync(path.join(SKILLS_DIR, rule.dir, 'SKILL.md')));

  if (unregistered.length === 0 && dangling.length === 0) {
    console.log(
      `[prompts-sync] 覆盖率 OK：${sourceSkills.length} 个 skill 源，` +
        `${registeredDirs.size} 个目录已登记，${EXCLUDED_SKILLS.size} 个显式排除`,
    );
    return;
  }

  const lines = ['[prompts-sync][COVERAGE_FAILED] Skill 文档覆盖不完整。', ''];

  if (unregistered.length > 0) {
    lines.push(
      `以下 ${unregistered.length} 个 skill 有源目录但未登记进 doc/prompts/config.yaml，`,
      '因此不会生成文档页、也不会出现在侧边栏：',
      '',
      ...unregistered.map((name) => `  - ${name}`),
      '',
      '处理方式（二选一）：',
      `  1. 在 doc/prompts/config.yaml 的 rules 中登记（id 或 ruleDir 指向该目录），然后跑 ${FIX_COMMAND}`,
      '  2. 如果确实不该有文档页，在 scripts/check-prompts-sync.mjs 的 EXCLUDED_SKILLS 中显式登记并写明理由',
      '',
    );
  }

  if (dangling.length > 0) {
    lines.push(
      `以下 ${dangling.length} 条规则指向了不存在的 skill 目录（改目录名后忘了同步配置）：`,
      '',
      ...dangling.map((rule) => `  - rule id=${rule.id} -> config/source/skills/${rule.dir}`),
      '',
    );
  }

  fail(lines);
}

/** 收集产物文件的内容摘要 */
function hashArtifacts() {
  const map = new Map();

  const walk = (target) => {
    if (!fs.existsSync(target)) return;
    const stat = fs.statSync(target);
    if (stat.isFile()) {
      const rel = path.relative(ROOT_DIR, target);
      map.set(rel, crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'));
      return;
    }
    for (const entry of fs.readdirSync(target)) {
      walk(path.join(target, entry));
    }
  };

  ARTIFACT_PATHS.forEach(walk);
  return map;
}

function runGenerators() {
  for (const script of GENERATORS) {
    try {
      execFileSync('node', [script], { cwd: ROOT_DIR, stdio: 'pipe' });
    } catch (error) {
      fail([
        `[prompts-sync][GENERATE_FAILED] 生成器执行失败：${script}`,
        '',
        (error.stdout || '').toString().trim(),
        (error.stderr || error.message || '').toString().trim(),
      ]);
    }
  }
}

/** 检查 2：产物是否与提交内容一致 */
function checkFreshness() {
  const before = hashArtifacts();
  runGenerators();
  const after = hashArtifacts();

  const added = [...after.keys()].filter((key) => !before.has(key)).sort();
  const removed = [...before.keys()].filter((key) => !after.has(key)).sort();
  const changed = [...after.keys()]
    .filter((key) => before.has(key) && before.get(key) !== after.get(key))
    .sort();

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    console.log(`[prompts-sync] 产物新鲜度 OK：${after.size} 个产物文件与源一致`);
    return;
  }

  const lines = [
    '[prompts-sync][STALE_ARTIFACTS] 文档产物与 skills 源不一致（源改了但没重新生成）。',
    '',
  ];
  if (added.length > 0) lines.push('新增产物：', ...added.map((f) => `  + ${f}`), '');
  if (changed.length > 0) lines.push('内容变化：', ...changed.map((f) => `  M ${f}`), '');
  if (removed.length > 0) lines.push('已删除产物：', ...removed.map((f) => `  - ${f}`), '');

  lines.push(
    '生成器已把工作区产物刷新为最新（即上面这些变化已经落盘），确认无误后提交即可。',
    `如需重跑：${FIX_COMMAND}`,
    '',
  );

  fail(lines);
}

/** 列出生成的文档页 */
function listPromptPages() {
  if (!fs.existsSync(PROMPTS_DIR)) return [];
  return fs
    .readdirSync(PROMPTS_DIR)
    .filter((name) => name.endsWith('.mdx'))
    .sort()
    .map((name) => path.join(PROMPTS_DIR, name));
}

/** 收集页面里的 CNB 链接 */
function collectCnbLinks() {
  const links = [];
  for (const page of listPromptPages()) {
    const text = fs.readFileSync(page, 'utf8');
    for (const match of text.matchAll(CNB_LINK_RE)) {
      links.push({ page, repoPath: match[1] });
    }
  }
  return links;
}

/** 检查 3：页面里的 CNB 链接目标必须存在于本地 skills 源 */
function checkLinkTargets() {
  const links = collectCnbLinks();
  const missing = new Map();

  for (const { page, repoPath } of links) {
    if (fs.existsSync(path.join(ROOT_DIR, repoPath))) continue;
    if (!missing.has(repoPath)) missing.set(repoPath, new Set());
    missing.get(repoPath).add(path.relative(ROOT_DIR, page));
  }

  if (missing.size === 0) {
    const unique = new Set(links.map((link) => link.repoPath)).size;
    console.log(
      `[prompts-sync] 链接目标 OK：${links.length} 条 CNB 链接（${unique} 个目标文件）均可解析`,
    );
    return;
  }

  const lines = [
    '[prompts-sync][BROKEN_LINK_TARGETS] 文档页里的 CNB 链接指向了不存在的源文件。',
    '',
  ];
  for (const [repoPath, pages] of [...missing].sort()) {
    lines.push(`  - ${repoPath}`, `      出现在：${[...pages].join(', ')}`);
  }
  lines.push(
    '',
    '常见原因：源文件改名/移动后没重新生成产物，或生成器的链接改写规则有误。',
    `修复：${FIX_COMMAND}；若仍报错，检查 scripts/generate-prompts.mjs 的 rewriteRelativeLinks。`,
    '',
  );
  fail(lines);
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 探测单个链接。
 * 区分两类结果：
 *   broken=true  —— 404，或 200 但不是 text/plain（CNB 对不存在的路径也返回 200 的 SPA HTML，光看状态码会误判）
 *   broken=false —— 限流/超时等外部原因，链接本身未必有问题，退避重试后仍失败则标记为"无法确认"
 */
async function probeCnbRaw(repoPath) {
  const url = `${CNB_REPO_URL}/-/git/raw/main/${repoPath}`;
  let detail = '未知错误';

  for (let attempt = 1; attempt <= LINK_CHECK_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url);
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.startsWith('text/plain')) return { ok: true };

      detail = `HTTP ${res.status}, content-type=${type || '(空)'}`;
      const broken = res.status === 404 || (res.ok && !type.startsWith('text/plain'));
      if (broken) return { ok: false, broken: true, detail };
    } catch (e) {
      detail = e?.message || String(e);
    }

    if (attempt < LINK_CHECK_ATTEMPTS) await sleep(600 * attempt);
  }

  return { ok: false, broken: false, detail };
}

/** 可选检查：联网验证 CNB 链接确实可访问（`--check-links`） */
async function checkLinkLiveness() {
  const unique = [...new Set(collectCnbLinks().map((link) => link.repoPath))].sort();
  const broken = [];
  const inconclusive = [];
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(LINK_CHECK_CONCURRENCY, unique.length) },
    async () => {
      while (cursor < unique.length) {
        const repoPath = unique[cursor++];
        const result = await probeCnbRaw(repoPath);
        if (!result.ok) {
          (result.broken ? broken : inconclusive).push({ repoPath, detail: result.detail });
        }
        await sleep(LINK_CHECK_DELAY_MS);
      }
    },
  );

  await Promise.all(workers);

  if (broken.length > 0) {
    fail([
      '[prompts-sync][LINK_LIVENESS_FAILED] 以下 CNB 链接确认不可用（404 或非文本内容）。',
      '',
      ...broken.map((f) => `  - ${f.repoPath}\n      ${f.detail}`),
      '',
      '可能是 CNB 镜像尚未同步、分支名变化，或生成器的链接改写规则有误。',
      '',
    ]);
  }

  if (inconclusive.length > 0) {
    console.warn(
      `[prompts-sync] CNB 链接存活检查：${unique.length - inconclusive.length}/${unique.length} 可访问，` +
        `${inconclusive.length} 个未能确认（限流/超时等外部原因，非死链，不计为失败）：`,
    );
    inconclusive.slice(0, 10).forEach((f) => console.warn(`  - ${f.repoPath}  ${f.detail}`));
    if (inconclusive.length > 10) console.warn(`  …… 其余 ${inconclusive.length - 10} 个省略`);
    return;
  }

  console.log(`[prompts-sync] CNB 链接存活 OK：${unique.length} 个目标均可访问`);
}

/** 统计栅栏外的相对 markdown 链接（生成器应把这些改写成 CNB 绝对地址；栅栏内不动，避免污染示例代码） */
function countUnfencedRelativeLinks(text) {
  let fencing = false;
  let count = 0;

  for (const line of text.split('\n')) {
    if (line.trim().startsWith('```')) {
      fencing = !fencing;
      continue;
    }
    if (fencing) continue;

    for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || target.startsWith('#')) {
        continue;
      }
      count += 1;
    }
  }

  return count;
}

/** 检查 4：SKILL.md 里的相对链接必须全部被改写成 CNB 绝对地址 */
function checkLinkRewrite(config) {
  const dirToId = new Map();
  config.rules.forEach((rule) => dirToId.set(rule.ruleDir || rule.id, rule.id));

  const problems = [];

  for (const skill of listSourceSkills()) {
    const id = dirToId.get(skill);
    if (!id) continue; // 未登记由覆盖率检查负责
    const page = path.join(PROMPTS_DIR, `${id}.mdx`);
    if (!fs.existsSync(page)) continue;

    const expected = countUnfencedRelativeLinks(
      fs.readFileSync(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8'),
    );
    const actual = (fs.readFileSync(page, 'utf8').match(CNB_RAW_LINK_RE) || []).length;

    if (expected !== actual) problems.push({ skill, expected, actual });
  }

  if (problems.length === 0) {
    console.log('[prompts-sync] 链接改写 OK：源 SKILL.md 的相对链接均已改写为 CNB 绝对地址');
    return;
  }

  fail([
    '[prompts-sync][LINK_REWRITE_FAILED] 源 SKILL.md 里的相对链接没有被完整改写。',
    '',
    '期望值 = SKILL.md 里栅栏外的相对链接数，实际值 = 页面里改写后的 CNB 链接数：',
    ...problems.map((p) => `  - ${p.skill}：期望 ${p.expected}，实际 ${p.actual}`),
    '',
    '两者必须相等。少说明链接漏改（读者/AI 在文档站上取不到），多说明改写规则误伤了不该动的链接。',
    '修复：检查 scripts/generate-prompts.mjs 的 rewriteRelativeLinks 后重跑 ' + FIX_COMMAND,
    '',
  ]);
}

async function main() {
  const args = process.argv.slice(2);
  const coverageOnly = args.includes('--coverage-only');
  const checkLinks = args.includes('--check-links');

  loadRules();
  const config = await readConfig();
  checkCoverage(config);

  if (coverageOnly) {
    console.log('[prompts-sync] 覆盖率检查通过（已跳过产物新鲜度检查）');
    return;
  }

  checkFreshness();
  checkLinkTargets();
  checkLinkRewrite(config);

  if (checkLinks) {
    await checkLinkLiveness();
  }

  console.log('[prompts-sync] 全部通过');
}

main().catch((error) => {
  fail([`[prompts-sync][UNEXPECTED] ${error?.stack || error}`]);
});
