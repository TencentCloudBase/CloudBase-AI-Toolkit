import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";

/**
 * recipe 的编号是纯手工维护的索引，但有三处副本：文件名（信息性）、文件首行的
 * `# Recipe N — 标题`、以及 README 目录表里的 `| N | 标题 | [文件](./文件) |`。
 *
 * 为什么值得一个测试：出现过两篇都写 `Recipe 7` —— 两份改动各自只看了自己那半张表，
 * 合并后目录表里两个 `7`、编号 11 空缺，而读者按编号互相引用（`[Recipe 7](...)`）时就指错人。
 * 编号本身没有生成器，只能靠这条断言兜住。
 */

const RECIPES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../config/source/skills/cloud-api-operations/references/recipes",
);

const README = "README.md";

/** 首行形如 `# Recipe 11 — 计费口径自查：…` */
const TITLE_RE = /^#\s+Recipe\s+(\d+)\s*[—-]\s*(.+?)\s*$/;
/** 目录表数据行，只取前三列（状态列里允许出现任意文本） */
const ROW_RE = /^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*\[(.+?)\]\(\.\/([^)]+)\)\s*\|/;

function listRecipeFiles() {
  return fs
    .readdirSync(RECIPES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== README)
    .map((entry) => entry.name)
    .sort();
}

function readTitle(file) {
  const text = fs.readFileSync(path.join(RECIPES_DIR, file), "utf-8");
  const firstLine = text.split("\n", 1)[0];
  const match = TITLE_RE.exec(firstLine);
  return { firstLine, number: match ? Number(match[1]) : undefined, name: match ? match[2] : undefined };
}

function readTableRows() {
  const text = fs.readFileSync(path.join(RECIPES_DIR, README), "utf-8");
  const rows = [];
  for (const line of text.split("\n")) {
    const match = ROW_RE.exec(line);
    if (match) {
      rows.push({ number: Number(match[1]), name: match[2], label: match[3], file: match[4] });
    }
  }
  return rows;
}

describe("cloud-api-operations recipes 编号一致性", () => {
  const files = listRecipeFiles();
  const rows = readTableRows();

  test("每个 recipe 首行都是 `# Recipe N — 标题`", () => {
    const offenders = files.filter((file) => readTitle(file).number === undefined);
    expect(offenders, `首行缺少编号：${offenders.join(", ")}`).toEqual([]);
  });

  test("文件标题里的编号互不重复", () => {
    const seen = new Map();
    const duplicates = [];
    for (const file of files) {
      const { number } = readTitle(file);
      if (number === undefined) continue;
      if (seen.has(number)) duplicates.push(`Recipe ${number}: ${seen.get(number)} / ${file}`);
      else seen.set(number, file);
    }
    expect(duplicates, `编号重复：${duplicates.join("; ")}`).toEqual([]);
  });

  test("目录表编号互不重复且升序", () => {
    const numbers = rows.map((row) => row.number);
    expect(new Set(numbers).size, `目录表编号重复：${numbers.join(", ")}`).toBe(numbers.length);
    expect(numbers, `目录表编号未升序：${numbers.join(", ")}`).toEqual([...numbers].sort((a, b) => a - b));
  });

  test("目录表每行都指向存在的文件，且编号与文件标题一致", () => {
    const mismatches = [];
    for (const row of rows) {
      if (!files.includes(row.file)) {
        mismatches.push(`第 ${row.number} 行指向不存在的 ${row.file}`);
        continue;
      }
      const { number } = readTitle(row.file);
      if (number !== row.number) {
        mismatches.push(`${row.file}：目录表写 ${row.number}，标题写 ${number}`);
      }
      // 不比对标题文案：目录表历史上用的是更短的版本，文案一致性由人工判断。
    }
    expect(mismatches, mismatches.join("; ")).toEqual([]);
  });

  test("每个 recipe 文件都在目录表里登记了一次", () => {
    const listed = rows.map((row) => row.file);
    const missing = files.filter((file) => !listed.includes(file));
    const duplicated = listed.filter((file, index) => listed.indexOf(file) !== index);
    expect(missing, `未登记：${missing.join(", ")}`).toEqual([]);
    expect(duplicated, `重复登记：${duplicated.join(", ")}`).toEqual([]);
  });
});
