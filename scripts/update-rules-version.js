#!/usr/bin/env node
// 自动将 mcp/package.json 的 version 字段写入 cloudbase-rules.mdc 文件
const fs = require('fs');
const path = require('path');

const PKG_PATH = path.resolve(__dirname, '../mcp/package.json');
const MDC_PATH = path.resolve(__dirname, '../config/.cursor/rules/cloudbase-rules.mdc');

function getVersion() {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  return pkg.version;
}

function updateMdcVersion(version) {
  if (!fs.existsSync(MDC_PATH)) {
    console.error('cloudbase-rules.mdc 文件不存在:', MDC_PATH);
    process.exit(1);
  }
  const content = fs.readFileSync(MDC_PATH, 'utf8');
  const versionLine = `cloudbaseAIVersion：${version}`;
  const lines = content.split(/\r?\n/);
  // 移除所有 cloudbaseAIVersion 行
  const filteredLines = lines.filter(line => !/^cloudbaseAIVersion：/.test(line));
  // 插入到第二行（假设第一行是 --- 或 yaml 标题）
  if (filteredLines.length > 1) {
    filteredLines.splice(1, 0, versionLine);
  } else {
    filteredLines.push(versionLine);
  }
  fs.writeFileSync(MDC_PATH, filteredLines.join('\n'), 'utf8');
  console.log(`cloudbase-rules.mdc 已更新版本号：${version}`);
}

function main() {
  const version = getVersion();
  updateMdcVersion(version);
}

main(); 