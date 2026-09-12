#!/usr/bin/env node
/**
 * i18n 覆盖面守卫 —— 两层，各守一个面：
 *
 *   1. **工具级文案必须是词典 key**（`registerTool` 的 title / description）
 *   2. **参数级 `.describe()` 的中文硬编码只减不增**（棘轮 + 基线）
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
 * **第 1 层**（本脚本前半）是「工具级国际化」这个交付物的正面守卫：注册点写
 * `description: "storage.queryDescription"` 会按实例语言解析，而写成
 * `description: "查询云存储"` 会**原样透出**给 en 用户 —— 之前没有任何机制
 * 会在这种回退发生时拦一下，CI 照样全绿。因此这里不接受任何基线：写成硬编码
 * 字面量（或把字面量挪进同文件常量再引用）就是失败。
 *
 * **第 2 层**（本脚本后半）是参数级：`.describe()` 完全在 i18n 体系之外，
 * 没有任何机制会在你新写一句中文时拦一下，于是英文用户看到的参数说明里混着
 * 中文。platform-kit 有 validate-i18n.mjs，mcp 没有对应物，中文硬编码可以
 * 一路溜进主干。这一层用棘轮（存量冻结成基线，只减不增）。
 *
 * ## 关于第 2 层基线的两个数字口径
 *
 * 棘轮是**源码级静态**扫描，不需要构建、不需要跑 MCP，口径是「mcp/src 下所有含中文的
 * `.describe()` 字面量」= 464 条（2026-09-12, head 82ddc75dd）：
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
 * ## 实现要点（为什么不是几行正则）
 *
 * 两层都要在源码里做结构判定，而源码里同时存在：注释里的示例代码、模板字符串里的
 * 花括号、正则字面量里的引号（`/["']/g`）。所以先造一份「同长度结构掩码」——
 * 行注释、块注释、字符串、正则的**内容**置空、定界符与换行保留 —— 括号配对与属性名
 * 识别都在掩码上做，取值时按起始下标回原文取。正则与除号靠「前一个有效字符」区分，
 * 且只认同行内能闭合的正则，宁可少认也不错认。
 *
 * ## 用法
 *
 *   node mcp/scripts/check-i18n-coverage.mjs              # 校验（CI / pre-commit 用）
 *   node mcp/scripts/check-i18n-coverage.mjs --update     # 收敛第 2 层基线（翻译完 / 有意新增后）
 *   node mcp/scripts/check-i18n-coverage.mjs --skip-shrink  # 只拦新增，不拦基线收紧（应急）
 *   node mcp/scripts/check-i18n-coverage.mjs --self-test  # 扫描器自检（守卫的守卫）
 *   node mcp/scripts/check-i18n-coverage.mjs --verbose    # 打印全部条目
 *
 * 退出码：0 = 通过；1 = 工具级文案非词典 key / 棘轮被推动 / 基线缺失 / 自检失败；2 = 参数错误。
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
const LOCALES_MODULES_DIR = join(SCAN_ROOT, "i18n", "locales", "modules");

/** 工具注册点所在的目录（registerTool 调用只应出现在这里）。 */
const TOOLS_DIR = join(SCAN_ROOT, "tools");

/** 正则字面量判定用：这些关键字后面跟的 `/` 是正则开始而非除号。 */
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete",
  "void", "case", "do", "else", "yield", "await", "throw",
]);

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
// 结构掩码：把「字符串内容 / 注释 / 正则字面量内容」置空
//
// 工具注册点的 meta 是**对象字面量**，要判断它的 title/description 是词典 key
// 还是硬编码文案，必须做结构遍历。直接对源码做结构遍历会被字符串里的花括号、
// 注释里的示例代码、正则里的引号带偏，所以先造一份「同长度、结构可见」的掩码：
// 定界符（引号、`//`、`/* */`、`/ /`）保留，内容换成空格，换行保留。
// 之后的括号配对、属性名识别都在掩码上做，需要取值时再按起始下标回原文取。
// ---------------------------------------------------------------------------

/** 正则字面量判定：看前一个有效字符（掩码里字符串/注释已是空格，因此天然跳过）。 */
function isRegexStart(chars, index) {
  let j = index - 1;
  while (j >= 0 && isSpace(chars[j])) j -= 1;
  if (j < 0) return true;
  const prev = chars[j];
  if (/[A-Za-z0-9_$]/.test(prev)) {
    // `return /re/` 之类的关键字后才是正则，`a / b` 是除法
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(chars[k])) k -= 1;
    return REGEX_PRECEDING_KEYWORDS.has(chars.slice(k + 1, j + 1).join(""));
  }
  if (prev === ")" || prev === "]" || prev === "}") return false;
  return true;
}

export function maskCode(source) {
  const chars = source.split("");
  const literals = [];
  const blank = (from, to) => {
    for (let k = Math.max(0, from); k < Math.min(to, chars.length); k += 1) {
      if (chars[k] !== "\n" && chars[k] !== "\r") chars[k] = " ";
    }
  };
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      let nl = source.indexOf("\n", i);
      if (nl === -1) nl = source.length;
      blank(i, nl);
      i = nl;
      continue;
    }
    if (ch === "/" && next === "*") {
      let close = source.indexOf("*/", i + 2);
      close = close === -1 ? source.length : close + 2;
      blank(i, close);
      i = close;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const literal = readStringLiteral(source, i);
      literals.push({ start: i, end: literal.end, closed: literal.closed, text: literal.text });
      blank(i + 1, literal.closed ? literal.end - 1 : literal.end);
      i = literal.end;
      continue;
    }
    if (ch === "/" && isRegexStart(chars, i)) {
      // 只在同一行内找闭合 `/`（正则字面量不跨行）；找不到就当除号，宁可少认也不错认。
      let j = i + 1;
      let inClass = false;
      let close = -1;
      while (j < source.length) {
        const c = source[j];
        if (c === "\n" || c === "\r") break;
        if (c === "\\") { j += 2; continue; }
        if (c === "[") { inClass = true; j += 1; continue; }
        if (c === "]") { inClass = false; j += 1; continue; }
        if (c === "/" && !inClass) { close = j; break; }
        j += 1;
      }
      if (close !== -1) {
        blank(i + 1, close);
        i = close + 1;
        while (i < source.length && /[a-z]/.test(source[i])) i += 1;
        continue;
      }
    }
    i += 1;
  }
  return { mask: chars.join(""), literals };
}

// ---------------------------------------------------------------------------
// 对象字面量遍历（在掩码上做结构，回原文取字面量值）
// ---------------------------------------------------------------------------

/**
 * 读对象字面量的**直接子级**属性。
 * 返回 [{ name, literal }]，literal 为字符串字面量原文；非字面量值（表达式/变量/
 * 模板拼接）为 null —— 这类值不在静态检查范围内（它们本来就不该是硬编码 key）。
 */
export function readObjectEntries(mask, literalByStart, braceStart) {
  const entries = [];
  let i = braceStart + 1;
  let nested = 0;
  let expectProp = true;
  while (i < mask.length) {
    const c = mask[i];
    if (isSpace(c)) { i += 1; continue; }

    if (!expectProp) {
      // 值区域：跳到本属性的结尾（顶层 , 或对象结束）
      if (c === "(" || c === "[" || c === "{") { nested += 1; i += 1; continue; }
      if (c === ")" || c === "]" || c === "}") {
        if (nested === 0) break;
        nested -= 1;
        i += 1;
        continue;
      }
      if (c === "," && nested === 0) { expectProp = true; i += 1; continue; }
      i += 1;
      continue;
    }

    if (c === "}") break;
    if (c === ",") { i += 1; continue; }
    if (c === "." && mask[i + 1] === "." && mask[i + 2] === ".") {
      // 展开（...base）：值继承自别处，本层不再有该属性名
      expectProp = false;
      i += 3;
      continue;
    }
    let name = null;
    if (c === '"' || c === "'") {
      const literal = literalByStart.get(i);
      if (!literal) { i += 1; continue; }
      name = literal.text;
      i = literal.end;
    } else if (/[A-Za-z_$]/.test(c)) {
      let k = i;
      while (k < mask.length && /[A-Za-z0-9_$]/.test(mask[k])) k += 1;
      name = mask.slice(i, k);
      i = k;
    } else {
      i += 1;
      continue;
    }
    while (i < mask.length && isSpace(mask[i])) i += 1;

    let literal = null;
    let refIdent = null;
    if (mask[i] === ":") {
      i += 1;
      while (i < mask.length && isSpace(mask[i])) i += 1;
      if (mask[i] === '"' || mask[i] === "'" || mask[i] === "`") {
        const found = literalByStart.get(i);
        if (found && found.closed) {
          literal = found.text;
          i = found.end;
        } else {
          // 未闭合（多半是把正则/注释误当字符串），跳到行尾避免误吞
          const nl = mask.indexOf("\n", i);
          i = nl === -1 ? mask.length : nl;
        }
      } else if (mask[i] !== undefined && /[A-Za-z_$]/.test(mask[i])) {
        // 裸引用（`description: someConst`）：值不在本对象里，但可以直接指向一个
        // 变量再塞硬编码文案。记下标识符交给调用方在同文件内再解析一层。
        let k = i;
        while (k < mask.length && /[A-Za-z0-9_$]/.test(mask[k])) k += 1;
        let n = k;
        while (n < mask.length && isSpace(mask[n])) n += 1;
        if (mask[n] === "," || mask[n] === "}" || mask[n] === ")") {
          refIdent = mask.slice(i, k);
        }
      }
    }
    entries.push({ name, literal, refIdent });
    expectProp = false;
  }
  return entries;
}

/** 定位 registerTool 调用的第二个实参（meta）。 */
function findMetaArgument(mask, openParen) {
  let i = openParen + 1;
  let depth = 1;
  let brackets = 0;
  while (i < mask.length) {
    const c = mask[i];
    if (c === "(") { depth += 1; i += 1; continue; }
    if (c === ")") {
      depth -= 1;
      if (depth === 0) return null;
      i += 1;
      continue;
    }
    if (c === "[" || c === "{") { brackets += 1; i += 1; continue; }
    if (c === "]" || c === "}") { brackets -= 1; i += 1; continue; }
    if (c === "," && depth === 1 && brackets === 0) {
      let j = i + 1;
      while (j < mask.length && isSpace(mask[j])) j += 1;
      if (mask[j] === "{") return { kind: "object", braceStart: j };
      const ident = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(mask.slice(j, j + 80));
      if (ident) return { kind: "identifier", name: ident[0] };
      return { kind: "unknown" };
    }
    i += 1;
  }
  return null;
}

/**
 * 扫描一个源文件里所有 registerTool 调用，返回每个调用的 meta 属性。
 * meta 是变量时（`registerTool(name, metaVar, cb)`）在**同文件内**解析一层
 * `const metaVar = { ... }`，避免把 meta 挪进变量就能绕过检查。
 */
export function scanToolMeta(source) {
  const { mask, literals } = maskCode(source);
  const literalByStart = new Map(literals.map((literal) => [literal.start, literal]));
  const sites = [];
  const re = /registerTool(?:\s*\?\.)?\s*\(/g;
  let match;
  while ((match = re.exec(mask)) !== null) {
    const openParen = match.index + match[0].length - 1;
    let i = openParen + 1;
    while (i < mask.length && isSpace(mask[i])) i += 1;
    let toolName = null;
    if (mask[i] === '"' || mask[i] === "'" || mask[i] === "`") {
      const literal = literalByStart.get(i);
      if (literal && literal.closed) {
        toolName = literal.text;
        i = literal.end;
      }
    }
    const argument = findMetaArgument(mask, i - 1 >= openParen ? openParen : openParen);
    if (!argument) continue;

    let props = [];
    let resolved = true;
    if (argument.kind === "object") {
      props = readObjectEntries(mask, literalByStart, argument.braceStart);
    } else if (argument.kind === "identifier") {
      const decl = new RegExp(
        `(?:^|[^A-Za-z0-9_$])const\\s+${argument.name}\\s*(?::[^=\\n]*)?=\\s*\\{`,
      ).exec(mask);
      if (decl) {
        const braceStart = mask.indexOf("{", decl.index + decl[0].length - 1);
        props = readObjectEntries(mask, literalByStart, braceStart);
      } else {
        resolved = false;
      }
    } else {
      resolved = false;
    }

    // 属性值是裸引用时再解析一层同文件常量：防止把硬编码文案挪进变量就绕过检查
    props = props.map((prop) => {
      if (prop.literal !== null || !prop.refIdent) return prop;
      const declaration = new RegExp(
        `(?:^|[^A-Za-z0-9_$])const\\s+${prop.refIdent}\\s*(?::[^=\\n]*)?=\\s*['"\`]`,
      ).exec(mask);
      if (!declaration) return { ...prop, unresolvedRef: true };
      const quoteIndex = declaration.index + declaration[0].length - 1;
      const found = literalByStart.get(quoteIndex);
      return found && found.closed ? { ...prop, literal: found.text } : { ...prop, unresolvedRef: true };
    });

    sites.push({ toolName, props, resolved });
  }
  return sites;
}

// ---------------------------------------------------------------------------
// 词典 key 全集
// ---------------------------------------------------------------------------

/**
 * 从 locales/modules/*.ts 的 zh 树收集 key 全集（`<module>.<key>`）。
 * zh 是真源，en 的 key 完整性由 defineModule 的泛型约束在编译期保证，
 * 因此只扫 zh 就够；命名空间取模块文件的导出名（已核对与文件名一致）。
 */
export function collectDictionaryKeys() {
  const keys = new Set();
  const modules = [];
  let files = [];
  try {
    files = readdirSync(LOCALES_MODULES_DIR)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"))
      .sort();
  } catch {
    return { keys, modules };
  }
  for (const name of files) {
    const source = readFileSync(join(LOCALES_MODULES_DIR, name), "utf8");
    const declaration = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*defineModule\s*\(/.exec(source);
    const stem = name.replace(/\.ts$/, "");
    const namespace = declaration ? declaration[1] : stem;
    if (namespace !== stem) {
      modules.push({ name, namespace, keys: 0, mismatch: true });
    }
    const { mask, literals } = maskCode(source);
    const braceStart = mask.indexOf("{", declaration ? declaration.index + declaration[0].length : 0);
    if (braceStart === -1) continue;
    const literalByStart = new Map(literals.map((literal) => [literal.start, literal]));
    const entries = readObjectEntries(mask, literalByStart, braceStart);
    let count = 0;
    for (const entry of entries) {
      if (entry.literal === null) continue;
      keys.add(`${namespace}.${entry.name}`);
      count += 1;
    }
    modules.push({ name, namespace, keys: count, mismatch: false });
  }
  return { keys, modules };
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

/**
 * 扫描工具注册面的文案（registerTool 的 title / description）。
 *
 * 判定：字面量值必须是词典 key。表达式值（`t("x") + t("y")`、变量、模板拼接）
 * 不算违规 —— 它们本来就无法是硬编码 key，也不是本次要守的东西。
 */
export function collectToolMetaCoverage() {
  const dictionary = collectDictionaryKeys();
  const files = listSourceFiles(TOOLS_DIR).sort();
  const sites = [];
  const violations = [];
  const unresolved = [];
  const unresolvedRefs = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const repoPath = toRepoPath(file);
    for (const site of scanToolMeta(source)) {
      const tool = site.toolName ? `"${site.toolName}"` : "(工具名非字面量)";
      if (!site.resolved) {
        unresolved.push({ file: repoPath, tool });
        continue;
      }
      for (const prop of site.props) {
        if (prop.name !== "title" && prop.name !== "description") continue;
        if (prop.unresolvedRef) {
          unresolvedRefs.push({ file: repoPath, tool, prop: prop.name, ident: prop.refIdent });
          continue;
        }
        if (prop.literal === null) continue;
        if (!dictionary.keys.has(prop.literal)) {
          violations.push({ file: repoPath, tool, prop: prop.name, literal: prop.literal });
        }
      }
      sites.push({ file: repoPath, tool });
    }
  }

  return { dictionary, sites, violations, unresolved, unresolvedRefs, fileCount: files.length };
}

/**
 * 安全网：registerTool 调用只应出现在 mcp/src/tools 下。
 * 若这项检查的覆盖面之外又出现注册点（比如新目录里注册工具），至少要让 CI 日志里看得见。
 */
export function findRegisterToolOutsideTools() {
  const found = [];
  for (const file of listSourceFiles(SCAN_ROOT).sort()) {
    if (file.startsWith(TOOLS_DIR + sep)) continue;
    const basename = file.slice(file.lastIndexOf(sep) + 1);
    // server.ts 里是 registerTool 的**类型声明与方法包装**，不是注册点
    if (basename === "server.ts") continue;
    const { mask } = maskCode(readFileSync(file, "utf8"));
    const count = (mask.match(/registerTool(?:\s*\?\.)?\s*\(/g) ?? []).length;
    if (count > 0) found.push({ file: toRepoPath(file), count });
  }
  return found;
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
  runToolMetaSelfTest();
}

function runToolMetaSelfTest() {
  const cases = [
    {
      name: "对象字面量里取到 title/description",
      src: 'server.registerTool("t", { title: "storage.queryTitle", description: "storage.queryDescription" }, h);',
      expect: ["title=storage.queryTitle", "description=storage.queryDescription"],
    },
    {
      name: "?. 可选调用形式同样命中",
      src: 'server.registerTool?.(\n  "t",\n  { description: "env.queryDescription" },\n  h,\n);',
      expect: ["description=env.queryDescription"],
    },
    {
      name: "注释里的 registerTool 不命中",
      src: '// server.registerTool("t", { description: "x" })\nconst a = 1;',
      expect: [],
    },
    {
      name: "字符串里的 registerTool 不命中",
      src: 'const s = \'server.registerTool("t", { description: "x" })\';',
      expect: [],
    },
    {
      name: "正则里的 registerTool 不命中",
      src: "const re = /registerTool\\(/g;",
      expect: [],
    },
    {
      name: "正则里的引号不破坏后续解析",
      src: 'const re = /["\']/g;\nserver.registerTool("t", { description: "storage.queryTitle" }, h);',
      expect: ["description=storage.queryTitle"],
    },
    {
      name: "字符类里的 / 不提前闭合正则",
      src: 'const re = /[/"]/g;\nserver.registerTool("t", { description: "d" }, h);',
      expect: ["description=d"],
    },
    {
      name: "除号不被误当正则",
      src: 'const r = a / b;\nserver.registerTool("t", { description: "d" }, h);',
      expect: ["description=d"],
    },
    {
      name: "meta 是变量时解析同文件 const",
      src: 'const meta = { description: "storage.queryTitle" };\nserver.registerTool("t", meta, h);',
      expect: ["description=storage.queryTitle"],
    },
    {
      name: "meta 是变量但无同文件声明 → 未解析",
      src: "server.registerTool(\"t\", externalMeta, h);",
      expect: [],
      expectUnresolved: 1,
    },
    {
      name: "展开的属性由来源层负责，本层只检查覆盖项",
      src: 'const base = { title: "a" };\nserver.registerTool("t", { ...base, description: "b" }, h);',
      expect: ["description=b"],
    },
    {
      name: "嵌套 inputSchema 里的 description 不算工具级",
      src: 'server.registerTool("t", { description: "d", inputSchema: { a: { description: "inner" } } }, h);',
      expect: ["description=d"],
    },
    {
      name: "表达式值不收集（不是硬编码 key）",
      src: 'server.registerTool("t", { description: t("x") + t("y") }, h);',
      expect: [],
    },
    {
      name: "模板字符串值算字面量",
      src: 'server.registerTool("t", { description: `查询` }, h);',
      expect: ["description=查询"],
    },
    {
      name: "方法简写不吞后续属性",
      src: 'server.registerTool("t", { handler() { return { description: "inner" }; }, description: "d" }, h);',
      expect: ["description=d"],
    },
    {
      name: "未闭合字符串不吞后续语句",
      src: 'const a = "x\nserver.registerTool("t", { description: "d" }, h);',
      expect: ["description=d"],
    },
    {
      name: "工具名为常量时不冒充字面量",
      src: 'server.registerTool(QUERY_PG, { description: "databasePG.queryPgDatabase.description" }, h);',
      expect: ["description=databasePG.queryPgDatabase.description"],
    },
    {
      name: "属性值是裸引用时解析同文件 const",
      src: 'const META_KEY = "storage.queryTitle";\nserver.registerTool("t", { description: META_KEY }, h);',
      expect: ["description=storage.queryTitle"],
    },
    {
      name: "属性值裸引用但同文件无 const → 未解析（只告警）",
      src: 'server.registerTool("t", { description: IMPORTED_KEY }, h);',
      expect: [],
      expectUnresolvedRef: 1,
    },
    {
      name: "属性值是函数调用时不误判为裸引用",
      src: 'server.registerTool("t", { description: buildDescription() }, h);',
      expect: [],
    },
  ];

  const failures = [];
  for (const testCase of cases) {
    const sites = scanToolMeta(testCase.src);
    const actual = sites
      .flatMap((site) => site.props)
      .filter((prop) => (prop.name === "title" || prop.name === "description") && prop.literal !== null)
      .map((prop) => `${prop.name}=${prop.literal}`);
    const unresolvedActual = sites.filter((site) => !site.resolved).length;
    const unresolvedRefActual = sites
      .flatMap((site) => site.props)
      .filter((prop) => prop.unresolvedRef).length;
    const expectUnresolved = testCase.expectUnresolved ?? 0;
    const expectUnresolvedRef = testCase.expectUnresolvedRef ?? 0;
    const ok =
      actual.length === testCase.expect.length &&
      actual.every((value, index) => value === testCase.expect[index]) &&
      unresolvedActual === expectUnresolved &&
      unresolvedRefActual === expectUnresolvedRef;
    if (!ok) {
      failures.push({ ...testCase, actual, unresolvedActual, unresolvedRefActual });
    }
  }

  // 词典模块是「引号属性名 + 未加引号属性名」混排，单独验一次 key 读取
  const dictSource = 'defineModule(\n  { "query.title": "查询", plain: "x", nested: { skip: "y" } },\n  {},\n);';
  const dictMask = maskCode(dictSource);
  const dictLiteralByStart = new Map(dictMask.literals.map((literal) => [literal.start, literal]));
  const dictKeys = readObjectEntries(
    dictMask.mask,
    dictLiteralByStart,
    dictMask.mask.indexOf("{", dictMask.mask.indexOf("(")),
  ).map((entry) => entry.name);
  if (dictKeys.join(",") !== "query.title,plain,nested") {
    failures.push({ name: "词典模块的 key 读取", expect: ["query.title", "plain", "nested"], actual: dictKeys });
  }

  if (failures.length) {
    console.error(`i18n tool meta 自检失败 ${failures.length}/${cases.length}:`);
    for (const failure of failures) {
      console.error(`  ✗ ${failure.name}`);
      console.error(`      期望 ${JSON.stringify(failure.expect)}${failure.expectUnresolved ? ` + ${failure.expectUnresolved} 未解析` : ""}${failure.expectUnresolvedRef ? ` + ${failure.expectUnresolvedRef} 裸引用未解析` : ""}`);
      console.error(`      实际 ${JSON.stringify(failure.actual)} + ${failure.unresolvedActual} 未解析 + ${failure.unresolvedRefActual} 裸引用未解析`);
    }
    process.exit(1);
  }
  console.log(`i18n tool meta 自检 OK: ${cases.length} 个扫描器用例通过（含正则/模板串/变量 meta 边角）`);
}

/**
 * 工具级文案检查：registerTool 的 title/description 写成字符串字面量时必须是词典 key。
 * 返回 true 表示通过；失败信息直接打印（CI 日志即修复指引）。
 */
function checkToolMeta() {
  const report = collectToolMetaCoverage();
  console.log(
    `i18n tool meta: 扫描 mcp/src/tools ${report.fileCount} 个文件 → ` +
      `${report.sites.length} 个 registerTool 注册点，词典 key ${report.dictionary.keys.size} 个`,
  );

  const outside = findRegisterToolOutsideTools();
  if (outside.length) {
    console.error("⚠️  mcp/src/tools 之外还有 registerTool 调用，本检查覆盖不到（请把它们挪回 tools/ 或扩检查范围）:");
    for (const item of outside) {
      console.error(`   ⚠️  ${item.file}  ×${item.count}`);
    }
  }

  const fixHint = () => {
    console.error("\n怎么修:");
    console.error("  · 把文案加进 src/i18n/locales/modules/<module>.ts 的 zh / en 两棵树，");
    console.error('    再把 title/description 写成词典 key 字符串（如 "storage.queryTitle"）：');
    console.error("    注册包装层会按实例语言解析成实际文案，en 树漏译由编译期约束拦下。");
    console.error("  · 若是动态拼出来的文案，直接写成表达式（如 t(\"x\") + t(\"y\")）—— 本检查只拦字面量。");
  };

  if (report.unresolved.length) {
    console.error(
      `\n❌ ${report.unresolved.length} 个注册点的 meta 无法静态判定 —— 多半是把 meta 挪进了导入的变量。` +
        "本检查只解析同文件内的 const 声明，请就近声明或改用字面量：",
    );
    for (const item of report.unresolved) {
      console.error(`   ❌ ${item.file}  ${item.tool}`);
    }
    process.exit(1);
  }

  if (report.unresolvedRefs.length) {
    console.error(
      `⚠️  ${report.unresolvedRefs.length} 处工具级文案是裸引用且无法在同文件内解析 —— ` +
        "若该变量里藏了硬编码文案则会漏检，请就近声明或改成词典 key：",
    );
    for (const item of report.unresolvedRefs) {
      console.error(`   ⚠️  ${item.file}  ${item.tool}  ${item.prop}: ${item.ident}`);
    }
  }

  if (report.violations.length) {
    console.error(
      `\n❌ ${report.violations.length} 处工具级文案是硬编码字面量而非词典 key —— ` +
        "en 实例下会原样透出，工具级国际化被静默回退:",
    );
    for (const item of report.violations) {
      const preview = previewText(item.literal);
      console.error(`   ❌ ${item.file}  ${item.tool}  ${item.prop}: "${preview}"`);
    }
    fixHint();
    process.exit(1);
  }

  console.log(`✅ i18n tool meta OK: ${report.sites.length} 个注册点的 title/description 全部走词典 key。`);
  return true;
}

function printHelp() {
  console.log(`用法: node mcp/scripts/check-i18n-coverage.mjs [选项]

  本脚本是两层守卫：
    1. 工具级 —— registerTool 的 title/description 必须是词典 key（无基线，写成硬编码即失败）
    2. 参数级 —— mcp/src 的含中文 .describe() 只减不增（棘轮 + 基线）

  (无选项)        跑上述两层校验
  --update        以当前扫描结果重写第 2 层基线（翻译完 / 有意新增后收敛棘轮）
  --skip-shrink   只拦「新增」，放宽「基线里有而现状没有」的收紧要求
  --self-test     跑两层扫描器的自检用例
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

  // 工具级文案（registerTool 的 title/description）必须是词典 key。
  // 这一层没有基线：写成硬编码就是回归，没有「存量豁免」一说。
  if (!checkToolMeta()) {
    process.exit(1);
  }

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
