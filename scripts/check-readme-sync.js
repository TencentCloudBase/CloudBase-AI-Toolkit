#!/usr/bin/env node

/**
 * README sync check: English default (README.md) vs Chinese (README.zh-CN.md)
 */

const fs = require('fs');
const path = require('path');

const README_EN = path.join(__dirname, '../README.md');
const README_ZH = path.join(__dirname, '../README.zh-CN.md');

const KEY_SECTIONS_EN = [
  '## Recent updates',
  '## What it is',
  '## Quick start',
  '## Capabilities',
  '## Community',
];

const KEY_SECTIONS_ZH = [
  '## 最近更新',
  '## 它是什么',
  '## 快速开始',
  '## 能力',
  '## 社区',
];

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Cannot read: ${filePath}`);
    return null;
  }
}

function main() {
  console.log('CloudBase AI Toolkit README sync check\n');

  const enExists = fs.existsSync(README_EN);
  const zhExists = fs.existsSync(README_ZH);
  console.log(`README.md (EN default): ${enExists ? 'ok' : 'missing'}`);
  console.log(`README.zh-CN.md: ${zhExists ? 'ok' : 'missing'}`);
  if (!enExists || !zhExists) process.exit(1);

  const en = readFile(README_EN);
  const zh = readFile(README_ZH);
  if (!en || !zh) process.exit(1);

  let ok = true;

  console.log('\nEnglish sections:');
  for (const s of KEY_SECTIONS_EN) {
    const has = en.includes(s);
    console.log(`  ${s}: ${has ? 'ok' : 'missing'}`);
    if (!has) ok = false;
  }

  console.log('\nChinese sections:');
  for (const s of KEY_SECTIONS_ZH) {
    const has = zh.includes(s);
    console.log(`  ${s}: ${has ? 'ok' : 'missing'}`);
    if (!has) ok = false;
  }

  const enNav = en.includes('README.zh-CN.md') && en.includes('**English**');
  const zhNav = zh.includes('./README.md') && zh.includes('**简体中文**');
  console.log(`\nLanguage nav EN→ZH: ${enNav ? 'ok' : 'missing'}`);
  console.log(`Language nav ZH→EN: ${zhNav ? 'ok' : 'missing'}`);
  if (!enNav || !zhNav) ok = false;

  const enLogo = en.includes('mcp/icon.png');
  const zhLogo = zh.includes('mcp/icon.png');
  console.log(`Logo EN: ${enLogo ? 'ok' : 'missing'}`);
  console.log(`Logo ZH: ${zhLogo ? 'ok' : 'missing'}`);
  if (!enLogo || !zhLogo) ok = false;

  if (ok) {
    console.log('\nSync check passed.');
    process.exit(0);
  }
  console.log('\nSync check failed.');
  process.exit(1);
}

if (require.main === module) {
  main();
}
