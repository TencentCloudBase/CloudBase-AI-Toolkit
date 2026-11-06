import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test } from 'vitest';
import { buildCompatConfig } from '../scripts/build-compat-config.mjs';
import {
  IDE_TYPES,
  RAW_IDE_FILE_MAPPINGS,
  filterFilesByIDE,
  resolveDownloadTemplateIDE,
  validateIDE,
} from '../mcp/src/tools/setup.ts';

const tempDirs = [];

function collectRelativeFiles(rootDir, currentDir = rootDir) {
  const files = [];

  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRelativeFiles(rootDir, fullPath));
      continue;
    }

    files.push(path.relative(rootDir, fullPath));
  }

  return files.sort();
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

test('downloadTemplate exposes the supported IDE enum surface', () => {
  expect(IDE_TYPES).toContain('all');
  expect(IDE_TYPES).toContain('cursor');
  expect(IDE_TYPES).toContain('codebuddy');
  expect(IDE_TYPES).toContain('claude-code');
  expect(IDE_TYPES).toContain('kiro');
  expect(IDE_TYPES).toContain('iflow-cli');

  for (const ide of Object.keys(RAW_IDE_FILE_MAPPINGS)) {
    expect(IDE_TYPES).toContain(ide);
  }
});

test('downloadTemplate resolves and validates IDE input without side effects', () => {
  expect(resolveDownloadTemplateIDE('cursor', undefined)).toEqual({
    ok: true,
    resolvedIDE: 'cursor',
  });

  expect(resolveDownloadTemplateIDE(undefined, 'Cursor')).toEqual({
    ok: true,
    resolvedIDE: 'cursor',
  });

  const missingIde = resolveDownloadTemplateIDE(undefined, undefined);
  expect(missingIde.ok).toBe(false);
  expect(missingIde.reason).toBe('missing_ide');
  expect(missingIde.supportedIDEs).toContain('cursor');

  const invalidIde = validateIDE('not-a-real-ide');
  expect(invalidIde.valid).toBe(false);
  expect(invalidIde.error).toContain('不支持的IDE类型');
  expect(invalidIde.supportedIDEs).toContain('cursor');
});

test('downloadTemplate filtering keeps only Claude Code files from generated compat config', () => {
  const compatDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cloudbase-setup-filtering-'),
  );
  tempDirs.push(compatDir);
  buildCompatConfig({ outputDir: compatDir });

  const files = collectRelativeFiles(compatDir);
  const filtered = filterFilesByIDE(files, 'claude-code');

  expect(filtered).toContain('CLAUDE.md');
  expect(filtered).toContain('.mcp.json');
  expect(filtered).toContain('.claude/commands/spec.md');

  expect(filtered).not.toContain('.cursor/mcp.json');
  expect(filtered).not.toContain('.cursor/rules/auth-web-cloudbase/rule.mdc');
  expect(filtered).not.toContain('.kiro/settings/mcp.json');
});

test('downloadTemplate filtering keeps all generated files when ide=all', () => {
  const compatDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cloudbase-setup-filtering-all-'),
  );
  tempDirs.push(compatDir);
  buildCompatConfig({ outputDir: compatDir });

  const files = collectRelativeFiles(compatDir);
  const filtered = filterFilesByIDE(files, 'all');

  expect(filtered).toEqual(files);
  expect(filtered).toContain('.cursor/rules/cloudbase-rules.mdc');
  expect(filtered).toContain('.trae/rules/cloudbase-rules.md');
  expect(filtered).toContain('CODEBUDDY.md');
});

/**
 * 工具描述里手写了一份 IDE 清单，之前和 IDE_TYPES 各自为政：
 * #1317 从生成器删掉 windsurf / cline / augment 后，描述里还在列它们，
 * 用户按描述传 ide 会被 validateIDE 拒掉。清单要么别手写，要么就有东西盯着。
 */
test('downloadTemplate 描述里的 IDE 清单与 IDE_TYPES 一致', async () => {
  const { t } = await import('../mcp/src/i18n/index.ts');

  for (const lang of ['zh', 'en']) {
    const header = lang === 'zh' ? '支持的IDE类型:' : 'Supported IDE types:';
    const description = t('setup.downloadTemplate.description', undefined, lang);
    const start = description.indexOf(header);
    expect(start, `${lang} 描述里找不到「${header}」`).toBeGreaterThan(-1);

    const listed = [];
    const lines = description.slice(start + header.length).split('\n');
    let cursor = 0;
    while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1;
    for (; cursor < lines.length; cursor += 1) {
      const matched = lines[cursor].match(/^- ([a-z][a-z0-9-]*):/);
      if (!matched) break; // 清单到空行结束
      listed.push(matched[1]);
    }

    expect(listed.length, `${lang} 描述里一条 IDE 都没解析出来`).toBeGreaterThan(0);
    expect(new Set(listed).size, `${lang} 描述里有重复 IDE`).toBe(listed.length);
    expect([...listed].sort(), `${lang} 描述的 IDE 清单与 IDE_TYPES 不一致`).toEqual(
      [...IDE_TYPES].sort(),
    );
  }
});
