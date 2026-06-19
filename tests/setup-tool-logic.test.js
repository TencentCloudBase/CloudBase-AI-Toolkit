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
  expect(IDE_TYPES).toContain('windsurf');
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
  expect(filtered).not.toContain('.cursor/rules/auth-web/rule.mdc');
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
  expect(filtered).toContain('.kiro/steering/auth-web/rule.md');
  expect(filtered).toContain('CODEBUDDY.md');
});
