#!/usr/bin/env node
/**
 * 校验 recipe 文件的两类结构性问题：
 *
 *   1. 表格结构 —— 转义管道符、表头/分隔行/数据行列数、表格后空行、反引号配对
 *   2. 编号交叉引用 —— 表格「步」列定义的编号 vs 正文「步骤 N」引用的编号
 *
 * 第 2 项是删节 / 重排编号后最容易漏的：编号散落在两个互不相关的位置（表格单元格
 * 与正文句子），改了一处不会让另一处报错，只会让读者按错号找步骤。
 *
 * 用法：
 *   node skills/cloud-api-recipe-authoring/scripts/check-recipes.mjs [目录]
 *   目录默认 config/source/skills/cloud-api-operations/references/recipes
 *
 * 退出码：0 = 全部通过，1 = 发现问题（详情打印在 stdout）
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = 'config/source/skills/cloud-api-operations/references/recipes';
const dir = process.argv[2] ?? DEFAULT_DIR;

if (!fs.existsSync(dir)) {
  console.error(`目录不存在：${dir}（在仓库根目录运行，或把目录作为第一个参数传进来）`);
  process.exit(1);
}

const ESCAPED_PIPE = '\u0000';

/** 切分表格行：先保护转义管道符 \|，再按裸管道符切 */
function splitRow(line) {
  return line
    .replace(/\\\|/g, ESCAPED_PIPE)
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.replace(/\u0000/g, '\\|'));
}

const isSeparator = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);
const isTableRow = (line) => line.trimStart().startsWith('|');

const problems = [];
const report = (file, line, message) => problems.push(`${file}:${line}  ${message}`);

const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith('.md'))
  .sort();

for (const name of files) {
  const lines = fs.readFileSync(path.join(dir, name), 'utf8').split('\n');
  const definedSteps = new Set();
  const referencedSteps = new Map();

  // 引用可能出现在正文，也可能出现在表格单元格里（如「步骤 5 的全部参数」），
  // 所以先对全文独立扫一遍，不与下面的表格遍历耦合
  for (const [i, line] of lines.entries()) {
    for (const pattern of [/步骤\s*(\d+)/g, /第\s*(\d+)\s*步/g]) {
      for (const match of line.matchAll(pattern)) {
        const step = match[1];
        if (!referencedSteps.has(step)) referencedSteps.set(step, []);
        referencedSteps.get(step).push(i + 1);
      }
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;

    // ---- 表格结构 ----
    if (!isTableRow(line) || i + 1 >= lines.length || !isSeparator(lines[i + 1])) continue;

    const header = splitRow(line);
    const separator = splitRow(lines[i + 1]);

    if (separator.length !== header.length) {
      report(name, lineNo + 1, `分隔行 ${separator.length} 列，表头 ${header.length} 列`);
    }

    let j = i + 2;
    while (j < lines.length && isTableRow(lines[j])) {
      const row = splitRow(lines[j]);
      // 表格数据行不会被外层循环单独访问（下面把 i 跳到了表尾），
      // 所以编号列要在扫描表格时一起收集
      const first = row[0]?.trim() ?? '';
      if (/^\d+$/.test(first)) definedSteps.add(first);
      if (row.length !== header.length) {
        report(name, j + 1, `数据行 ${row.length} 列，表头 ${header.length} 列 —— ${lines[j].trim().slice(0, 80)}`);
      }
      j += 1;
    }

    if (j < lines.length && lines[j].trim() !== '') {
      report(name, j + 1, `表格结束后紧跟内容（渲染时会粘成一段）：${lines[j].trim().slice(0, 60)}`);
    }

    // 反引号必须成对，否则会把后续单元格吞进代码片段
    for (let k = i; k < j; k += 1) {
      for (const [idx, cell] of splitRow(lines[k]).entries()) {
        const ticks = (cell.match(/`/g) ?? []).length;
        if (ticks % 2 !== 0) {
          report(name, k + 1, `第 ${idx + 1} 列有 ${ticks} 个反引号（奇数，未配对）：${cell.trim().slice(0, 60)}`);
        }
      }
    }

    i = j - 1;
  }

  // 引用了、但表格里没有定义的编号
  if (definedSteps.size > 0) {
    for (const [step, where] of [...referencedSteps].sort((a, b) => Number(a[0]) - Number(b[0]))) {
      if (!definedSteps.has(step)) {
        report(name, where[0], `正文引用「步骤 ${step}」，但表格的编号列里没有 ${step}（已定义：${[...definedSteps].sort((a, b) => Number(a) - Number(b)).join(', ')}）`);
      }
    }
  }

  const defined = [...definedSteps].sort((a, b) => Number(a) - Number(b));
  console.log(`${name}：编号列 [${defined.join(', ')}]`);
}

console.log('');
if (problems.length === 0) {
  console.log('✔ 表格结构与编号交叉引用均通过');
  process.exit(0);
}

console.log(`✘ 发现 ${problems.length} 个问题：`);
for (const problem of problems) console.log(`   ${problem}`);
process.exit(1);
