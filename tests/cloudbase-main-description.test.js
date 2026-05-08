import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';
import { loadYamlModule } from '../scripts/lib/load-yaml-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MAIN_SKILL = path.join(
  ROOT_DIR,
  'config',
  'source',
  'guideline',
  'cloudbase',
  'SKILL.md',
);

/**
 * This file locks in the activation-critical vocabulary for the single
 * outward-facing `cloudbase` skill. The host agent only sees the frontmatter
 * `description` when deciding whether to invoke this skill, so its trigger
 * coverage is the primary lever on activation rate.
 *
 * The matrix below is intentionally conservative — each entry has been
 * observed as a real user phrase or a reasonable canonical form for a
 * scenario CloudBase supports. If you are removing a term, make sure the
 * scenario is either covered by another term in the same row or genuinely
 * out of scope for CloudBase.
 */

describe('cloudbase main skill activation description', async () => {
  const yaml = await loadYamlModule(ROOT_DIR);
  const raw = fs.readFileSync(MAIN_SKILL, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error(`Expected frontmatter in ${MAIN_SKILL}`);
  }
  const frontmatter = yaml.load(match[1]);
  const description = frontmatter.description || '';

  test('frontmatter parses and exposes non-empty description', () => {
    expect(frontmatter.name).toBe('cloudbase');
    expect(description).toBeTruthy();
    expect(typeof description).toBe('string');
  });

  test('description opens with an imperative activation trigger', () => {
    // Host agents weight "Use when / Use this skill when / MUST" style
    // descriptions more strongly than neutral "X is a toolkit for ..."
    // statements. Keep the imperative opener.
    expect(description).toMatch(/^(Use this skill|Use when|You MUST use|Used when)/);
  });

  test('description stays within practical length bounds', () => {
    // Below ~800 chars we almost certainly lack trigger coverage.
    // Above ~3000 chars some host implementations truncate or down-weight
    // the tail — keep room to grow but fail loudly if we overshoot.
    expect(description.length).toBeGreaterThan(800);
    expect(description.length).toBeLessThan(3000);
  });

  // Triggering vocabulary matrix: each group must have at least one hit.
  // Groups mix Chinese and English on purpose — the same scenario surfaces
  // in both languages in real conversations.
  const TRIGGER_GROUPS = [
    {
      name: 'UI / visual design',
      terms: ['UI', '页面', '界面', 'prototype', '原型', '表单', 'form', 'dashboard', '仪表盘'],
      minHits: 4,
    },
    {
      name: 'Auth / login flows',
      terms: ['登录', '注册', 'signin', 'signup', 'OAuth', '短信', '微信登录', 'publishable key'],
      minHits: 4,
    },
    {
      name: 'Database',
      terms: ['NoSQL', 'MySQL', '文档数据库', '关系型数据库', 'CRUD', '查询', 'security rules'],
      minHits: 4,
    },
    {
      name: 'Backend runtimes',
      terms: ['cloud functions', '云函数', 'CloudRun', '云托管', 'scf_bootstrap', 'serverless', 'Dockerfile'],
      minHits: 4,
    },
    {
      name: 'Built-in AI',
      terms: ['AI 对话', 'streaming', '流式输出', 'image generation', 'hunyuan', '内置大模型'],
      minHits: 3,
    },
    {
      name: 'Third-party LLM integration',
      terms: ['大模型', 'LLM', '第三方大模型', '大模型接入', '大模型调用', '接入外部大模型', 'LLM API', 'chatbot', 'AI 助手', 'AI agent'],
      minHits: 5,
    },
    {
      name: 'AI Agent',
      terms: ['智能体', 'AI Agent', 'AG-UI', 'LangGraph', 'LangChain'],
      minHits: 3,
    },
    {
      name: 'Platforms',
      terms: ['微信小程序', '小程序', 'Web', 'uni-app', 'Flutter', 'React Native', 'iOS', 'Android', 'mobile'],
      minHits: 5,
    },
    {
      name: 'Ops / inspection',
      terms: ['巡检', '诊断', 'health check', '日志', 'troubleshooting', '排查'],
      minHits: 3,
    },
    {
      name: 'Spec workflow',
      terms: ['需求文档', '技术方案', '架构设计', 'requirements', 'tasks.md'],
      minHits: 2,
    },
    {
      name: 'Action verbs',
      terms: ['develop', 'design', 'build', 'deploy', 'debug', 'migrate', 'troubleshoot'],
      minHits: 5,
    },
    {
      name: 'CloudBase brand variants',
      terms: ['CloudBase', '腾讯云开发', '云开发', 'TCB', '微信云开发'],
      minHits: 3,
    },
  ];

  test.each(TRIGGER_GROUPS)(
    'covers enough vocabulary for "$name" (≥$minHits terms)',
    ({ terms, minHits }) => {
      const hits = terms.filter((term) => description.includes(term));
      expect(
        hits.length,
        `Expected at least ${minHits} of [${terms.join(', ')}] in description; found ${hits.length}: [${hits.join(', ')}]`,
      ).toBeGreaterThanOrEqual(minHits);
    },
  );
});
