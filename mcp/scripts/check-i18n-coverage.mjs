#!/usr/bin/env node
/**
 * i18n 覆盖面棘轮（ratchet）—— 守住 mcp/src 下**参数级 `.describe()` 的中文硬编码只减不增**。
 *
 * ## 为什么需要它
 *
 * MCP 的对外描述面是**分层**的，i18n 词典只覆盖其中一层：
 *
 *   | 层            | 落点                                        | en 实例下 |
 *   | ------------- | ------------------------------------------- | --------- |
 *   | 工具级        | title / description → i18n 词典 locales/**  | 英文 ✅   |
 *   | 运行期消息    | t("...") 调用点                             | 英文 ✅   |
 *   | 参数级        | `.describe("...")` 硬编码在 tools/*.ts      | 中文 ❌   |
 *
 * 前两层有平台级守卫（locales 的 zh/en 键对称由 `defineModule` 的
 * `E extends Record<keyof Z, string>` 在**编译期**保证，漏译直接报错）；
 * 参数级却完全在体系之外 —— 没有任何机制会在你新写一句中文 `.describe()` 时拦一下，
 * 于是英文用户看到的参数说明里混着中文。platform-kit 有 validate-i18n.mjs，
 * mcp 没有对应物，中文硬编码可以一路溜进主干。
 *
 * 这个脚本就是那道闸：把当前存量冻结成基线白名单，之后**只减不增**。
 * 新增中文 `.describe()` → CI 直接红；翻译掉一批 → 基线必须同步收紧（否则棘轮会松动、
 * 被翻译过的字段再改回中文就再也拦不住了）。
 *
 * ## 关于基线的两个数字口径
 *
 * 本脚本是**源码级静态**扫描，不需要构建、不需要跑 MCP，口径是「mcp/src 下所有含中文的
 * `.describe()` 字面量」= 475 条（2026-09-12, head b453f0a5e）：
 *
 *   - 覆盖嵌套：`z.object({ a: z.string().describe("中文") })` 里的内层也算；
 *   - 覆盖未注册工具：intl 站点不注册的 NoSQL 工具照样要守；
 *   - 覆盖未暴露 schema：只要写进源码就算债。
 *
 * 另一个常被引用的数字是「运行期 322 / 383」——那是 `tools/list` 的
 * `inputSchema.properties` 顶层字段口径（见 skills 里的 check-desc-lang.mjs），
 * 只看顶层、且只统计当前站点实际注册的工具，因此是**静态口径的子集**。
 * 两个数不相等是正常的：前者是上界（守 CI），后者是实况（看效果）。
 *
 * ## 用法
 *
 *   node mcp/scripts/check-i18n-coverage.mjs              # 校验（CI / pre-commit 用）
 *   node mcp/scripts/check-i18n-coverage.mjs --update     # 收敛基线（翻译完 / 有意新增后）
 *   node mcp/scripts/check-i18n-coverage.mjs --skip-shrink  # 只拦新增，不拦基线收紧（应急）
 *   node mcp/scripts/check-i18n-coverage.mjs --self-test  # 扫描器自检（守卫的守卫）
 *   node mcp/scripts/check-i18n-coverage.mjs --verbose    # 打印全部条目
 *
 * 退出码：0 = 与基线一致；1 = 棘轮被推动 / 基线缺失 / 自检失败；2 = 参数错误。
 *
 * 零依赖（仅 node: 内置模块），CI 里无需 pnpm install 即可运行。
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(HERE, "..");
const SCAN_ROOT = join(MCP_ROOT, "src");
const BASELINE_FILE = join(MCP_ROOT, "i18n-coverage-baseline.json");

/** 只在 mcp/src 下跳过 i18n 词典目录 —— 那是全仓唯一「中文合法存在」的地方。 */
const SKIP_DIR_PATHS = new Set([join(SCAN_ROOT, "i18n")]);

const CJK = /[\u4e00-\u9fff]/;
const SCHEMA_VERSION = 1;
const TEXT_PREVIEW_LIMIT = 100;
/** baseline 里的相对路径统一带 mcp/ 前缀，让 diff 里一眼看出落在哪个包。 */
const PATH_PREFIX = "mcp/";

// ---------------------------------------------------------------------------
// 扫描器
// ---------------------------------------------------------------------------

function isSpace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v";
}

/**
 * 读取从 start（开引号位置）起的字符串字面量。
 * 支持 ' " `；模板字符串允许裸换行，普通字符串遇换行视为未闭合（跳过，避免跨语句误吞）。
 */
function readStringLiteral(source, start) {
  const quote = source[start];
  let i = start + 1;
  let text = "";
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      text += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (quote !== "`" && (ch === "\n" || ch === "\r")) {
      return { closed: false, end: i, text };
    }
    if (ch === quote) {
      return { closed: true, end: i + 1, text };
    }
    text += ch;
    i += 1;
  }
  return { closed: false, end: source.length, text };
}

/**
 * 判断开引号之前是否正好是 `.describe(` 调用点。
 * 精确到 `.describe(`，因此不会命中 vitest 的裸 `describe("...")`，
 * 也不会命中 `.describeEach(` / `.describedBy(` 之类同前缀方法。
 */
function endsWithDescribeCall(source, quoteStart) {
  let j = quoteStart - 1;
  while (j >= 0 && isSpace(source[j])) j -= 1;
  if (j < 0 || source[j] !== "(") return false;
  j -= 1;
  while (j >= 0 && isSpace(source[j])) j -= 1;
  const name = "describe";
  const nameStart = j - name.length + 1;
  if (nameStart < 0 || source.slice(nameStart, j + 1) !== name) return false;
  j = nameStart - 1;
  while (j >= 0 && isSpace(source[j])) j -= 1;
  return j >= 0 && source[j] === ".";
}

/**
 * 逐字符扫描源码，返回所有「作为 `.describe()` 参数直接传入的字符串字面量」。
 * 注释与其它字符串会被跳过，避免注释里的示例代码被当成真实描述。
 */
export function scanDescribeLiterals(source) {
  const found = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const close = source.indexOf("*/", i + 2);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const literal = readStringLiteral(source, i);
      if (literal.closed && endsWithDescribeCall(source, i)) {
        found.push(literal.text);
      }
      i = literal.end;
      continue;
    }
    i += 1;
  }
  return found;
}

// ---------------------------------------------------------------------------
// 收集
// ---------------------------------------------------------------------------

function listSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_PATHS.has(full)) continue;
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    if (/\.(test|spec)\.ts$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function toRepoPath(file) {
  return PATH_PREFIX + relative(MCP_ROOT, file).split(sep).join("/");
}

function hashText(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function previewText(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TEXT_PREVIEW_LIMIT ? `${flat.slice(0, TEXT_PREVIEW_LIMIT)}…` : flat;
}

/** 扫描 mcp/src，返回 { entries, literalTotal, englishTotal, fileCount }。 */
export function collectCoverage() {
  const files = listSourceFiles(SCAN_ROOT).sort();
  const entries = [];
  const seen = new Map(); // hash -> entry（同一文件内同文案只登记一次，用 count 记出现次数）
  let literalTotal = 0;
  let englishTotal = 0;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const repoPath = toRepoPath(file);
    for (const text of scanDescribeLiterals(source)) {
      literalTotal += 1;
      if (!CJK.test(text)) {
        englishTotal += 1;
        continue;
      }
      const hash = hashText(text);
      const existing = seen.get(hash);
      if (existing) {
        existing.count += 1;
        continue;
      }
      const entry = { file: repoPath, hash, count: 1, text: previewText(text) };
      seen.set(hash, entry);
      entries.push(entry);
    }
  }

  entries.sort((a, b) => a.file.localeCompare(b.file) || a.hash.localeCompare(b.hash));
  return { entries, literalTotal, englishTotal, fileCount: files.length };
}

// ---------------------------------------------------------------------------
// 基线读写
// ---------------------------------------------------------------------------

function entryKey(entry) {
  return `${entry.file}#${entry.hash}`;
}

/** 基线落盘时按文件分组：文件路径只出现一次，diff 时同一文件的增删聚在一起。 */
function flattenBaselineFiles(files) {
  const entries = [];
  for (const file of Object.keys(files ?? {})) {
    for (const item of files[file] ?? []) {
      entries.push({
        file,
        hash: item.hash,
        count: typeof item.count === "number" ? item.count : 1,
        text: item.text,
      });
    }
  }
  return entries;
}

function loadBaseline() {
  if (!existsSync(BASELINE_FILE)) return null;
  const raw = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  return { schemaVersion: raw.schemaVersion, entries: flattenBaselineFiles(raw.files) };
}

function writeBaseline(entries) {
  const files = {};
  for (const entry of entries) {
    if (!files[entry.file]) files[entry.file] = [];
    files[entry.file].push({ hash: entry.hash, count: entry.count, text: entry.text });
  }
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    description:
      "mcp/src 中参数级 .describe() 的中文硬编码存量清单（棘轮基线，按文件分组）。" +
      "由 mcp/scripts/check-i18n-coverage.mjs --update 生成，请勿手工编辑。",
    files,
  };
  writeFileSync(BASELINE_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

function printEntryList(prefix, list, limit) {
  let currentFile = "";
  let printed = 0;
  for (const entry of list) {
    if (limit && printed >= limit) {
      console.log(`   … 其余 ${list.length - printed} 条略（--verbose 看全）`);
      break;
    }
    if (entry.file !== currentFile) {
      currentFile = entry.file;
      console.log(`   ${currentFile}`);
    }
    const suffix = entry.count > 1 ? ` (×${entry.count})` : "";
    console.log(`     ${prefix} ${entry.hash}  "${entry.text}"${suffix}`);
    printed += 1;
  }
}

function reportBaselineMissing() {
  console.error("i18n coverage: 基线文件不存在");
  console.error(`  期望路径: ${relative(MCP_ROOT, BASELINE_FILE)}`);
  console.error("  修复: node mcp/scripts/check-i18n-coverage.mjs --update");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 版本
// ---------------------------------------------------------------------------

function runSelfTest() {
  // 期望值统一为「会被棘轮捕获的中文条目」——即 scanDescribeLiterals 之后再按 CJK 过滤，
  // 与 collectCoverage 的判定口径一致（这样也顺带覆盖了「英文不进棘轮」这条规则）。
  const cases = [
    { name: "双引号中文命中", src: 'z.string().describe("环境 ID")', expect: ["环境 ID"] },
    { name: "单引号中文命中", src: "z.string().describe('环境 ID')", expect: ["环境 ID"] },
    { name: "英文不命中", src: 'z.string().describe("Environment ID")', expect: [] },
    { name: "中英混排命中", src: 'z.string().describe("环境 ID (EnvId)")', expect: ["环境 ID (EnvId)"] },
    { name: "注释里的中文不命中", src: '// z.string().describe("环境 ID")', expect: [] },
    { name: "块注释里的中文不命中", src: '/* .describe("环境 ID") */', expect: [] },
    { name: "多行模板串命中", src: "z.string().describe(\n  `环境 ID\n  多行说明`\n)", expect: ["环境 ID\n  多行说明"] },
    { name: "跨行调用命中", src: 'z.string()\n  .describe(\n    "环境 ID",\n  )', expect: ["环境 ID"] },
    { name: "词典调用不命中", src: 'z.string().describe(t("env.id"))', expect: [] },
    { name: "裸 describe 函数不命中", src: 'describe("环境 ID", () => {})', expect: [] },
    { name: "同前缀方法不命中", src: 'z.string().describeEach("环境 ID")', expect: [] },
    { name: "字符串里的注释符不吞后续", src: 'const a = "http://x"; z.string().describe("环境 ID")', expect: ["环境 ID"] },
    { name: "转义引号不提前闭合", src: 'z.string().describe("说 \\"环境\\" ID")', expect: ['说 \\"环境\\" ID'] },
    { name: "未闭合行不吞后续", src: 'const a = "x\nz.string().describe("环境 ID")', expect: ["环境 ID"] },
    { name: "两处同文案都命中", src: 'a.describe("环境 ID"); b.describe("环境 ID")', expect: ["环境 ID", "环境 ID"] },
  ];

  const failures = [];
  for (const testCase of cases) {
    const actual = scanDescribeLiterals(testCase.src).filter((text) => CJK.test(text));
    const ok =
      actual.length === testCase.expect.length &&
      actual.every((value, index) => value === testCase.expect[index]);
    if (!ok) {
      failures.push({ ...testCase, actual });
    }
  }

  if (failures.length) {
    console.error(`i18n coverage 自检失败 ${failures.length}/${cases.length}:`);
    for (const failure of failures) {
      console.error(`  ✗ ${failure.name}`);
      console.error(`      期望 ${JSON.stringify(failure.expect)}`);
      console.error(`      实际 ${JSON.stringify(failure.actual)}`);
    }
    process.exit(1);
  }
  console.log(`i18n coverage 自检 OK: ${cases.length} 个扫描器用例通过`);
}

function printHelp() {
  console.log(`用法: node mcp/scripts/check-i18n-coverage.mjs [选项]

  (无选项)        校验 mcp/src 的参数级中文 .describe() 是否与基线一致
  --update        以当前扫描结果重写基线（翻译完 / 有意新增后收敛棘轮）
  --skip-shrink   只拦「新增」，放宽「基线里有而现状没有」的收紧要求
  --self-test     跑扫描器自检用例
  --verbose       打印全部条目而非仅前 20 条
  -h, --help      显示本帮助`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter((arg) => !["--update", "--skip-shrink", "--self-test", "--verbose", "-h", "--help"].includes(arg));
  if (unknown.length) {
    console.error(`i18n coverage: 未知参数 ${unknown.join(" ")}`);
    printHelp();
    process.exit(2);
  }
  if (argv.includes("-h") || argv.includes("--help")) {
    printHelp();
    process.exit(0);
  }
  if (argv.includes("--self-test")) {
    runSelfTest();
    process.exit(0);
  }

  const updateMode = argv.includes("--update");
  const skipShrink = argv.includes("--skip-shrink");
  const verbose = argv.includes("--verbose");

  const coverage = collectCoverage();
  console.log(
    `i18n coverage: 扫描 mcp/src ${coverage.fileCount} 个文件 → ` +
      `${coverage.literalTotal} 个 .describe() 字面量，含中文 ${coverage.entries.length} 条` +
      `（英文 ${coverage.englishTotal} 条不进棘轮）`,
  );

  if (updateMode) {
    const previous = loadBaseline();
    if (previous) {
      const before = new Set(previous.entries.map(entryKey));
      const after = new Set(coverage.entries.map(entryKey));
      const added = coverage.entries.filter((entry) => !before.has(entryKey(entry)));
      const removed = previous.entries.filter((entry) => !after.has(entryKey(entry)));
      if (added.length) {
        console.log(`\n本次登记新增 ${added.length} 条中文参数描述:`);
        printEntryList("+", added, verbose ? 0 : 20);
      }
      if (removed.length) {
        console.log(`\n本次清理已消失 ${removed.length} 条（已翻译 / 文案变更 / 删除）:`);
        printEntryList("-", removed, verbose ? 0 : 20);
      }
      if (!added.length && !removed.length) {
        console.log("基线无变化。");
        process.exit(0);
      }
    }
    writeBaseline(coverage.entries);
    console.log(`\n已写入基线: ${relative(MCP_ROOT, BASELINE_FILE)}（${coverage.entries.length} 条）`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  if (!baseline) reportBaselineMissing();

  const baselineKeys = new Set(baseline.entries.map(entryKey));
  const currentKeys = new Set(coverage.entries.map(entryKey));
  const added = coverage.entries.filter((entry) => !baselineKeys.has(entryKey(entry)));
  const removed = baseline.entries.filter((entry) => !currentKeys.has(entryKey(entry)));

  if (!added.length && (!removed.length || skipShrink)) {
    console.log(`✅ i18n coverage OK: ${coverage.entries.length} 条中文参数描述与基线一致，棘轮未松动。`);
    if (removed.length) {
      console.log(`   （有 ${removed.length} 条基线条目已消失，--skip-shrink 下暂不拦截；建议跑 --update 收紧基线。）`);
    }
    process.exit(0);
  }

  if (added.length) {
    console.error(`\n❌ 新增了 ${added.length} 条中文参数描述 —— 参数级 .describe() 不走 i18n，en 实例下会以中文暴露给用户:`);
    printEntryList("+", added, verbose ? 0 : 20);
  }

  if (removed.length) {
    console.error(`\n❌ 基线中有 ${removed.length} 条已不存在（多半是翻译掉了，也可能是文案变更或删除）:`);
    printEntryList("-", removed, verbose ? 0 : 20);
    if (added.length) {
      console.error("   注意：若上面「新增」与「清理」是同一处文案的小改，按下面一条命令一起收敛即可。");
    }
  }

  console.error("\n怎么修:");
  if (added.length) {
    console.error("  · 若这是无意的硬编码 —— 改用词典：把文案加进 src/i18n/locales/modules/<module>.ts");
    console.error('    的 zh/en 两棵树，再写 .describe(t("<module>.<key>"))；en 树漏译会被编译期约束拦下。');
    console.error("  · 若确实要保留中文（如 searchKnowledgeBase 的中文关键词别名）—— 登记进基线。");
  }
  console.error("  · 收敛基线: node mcp/scripts/check-i18n-coverage.mjs --update");
  console.error("    （该命令会重写 mcp/i18n-coverage-baseline.json，把改动一起提交）");
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
