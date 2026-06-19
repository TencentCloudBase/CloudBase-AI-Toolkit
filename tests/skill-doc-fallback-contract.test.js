import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RAG_SOURCE = path.join(ROOT_DIR, 'mcp', 'src', 'tools', 'rag.ts');

describe('searchKnowledgeBase skill-doc fallback contract', () => {
  const source = fs.readFileSync(RAG_SOURCE, 'utf8');

  test('description mentions disabled-skill fallback guidance', () => {
    expect(source).toContain('skill');
    expect(source).toMatch(/禁用状态|disabled/i);
    expect(source).toMatch(/fallback|回退|降级/i);
  });

  test('description provides concrete skillName examples for fallback', () => {
    expect(source).toMatch(/skillName=auth-tool/);
    expect(source).toMatch(/skillName=auth-web/);
    expect(source).toMatch(/skillName=cloudbase-agent/);
  });

  test('description warns against direct skill file reads', () => {
    expect(source).toMatch(/400/);
    expect(source).toMatch(/直接读取/);
  });
});
