#!/usr/bin/env npx tsx
/**
 * Crawl Tencent Cloud CloudBase API documentation
 *
 * Usage:
 *   npx tsx scripts/crawl-tcb-docs.ts
 *   npx tsx scripts/crawl-tcb-docs.ts --commit
 *
 * Options:
 *   --commit    After crawling, commit and push changes to remote branch
 *               Requires: branch must be 'chore/pure_doc_skill' and up-to-date with remote
 *
 * Output: config/.claude/skills/pure-doc/references/
 */

import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pLimit from 'p-limit';
import simpleGit from 'simple-git';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const defuddlePath = resolve(__dirname, '../node_modules/defuddle/dist/node.js');
const { Defuddle } = require(defuddlePath);
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

const BASE_URL = 'https://cloud.tencent.com';
const COMMON_PARAMS_URL = 'https://cloud.tencent.com/document/api/876/34812';
const API_OVERVIEW_URL = 'https://cloud.tencent.com/document/api/876/34809';
const CONCURRENCY = 10;
const DEFAULT_OUTPUT_DIR = 'config/.claude/skills/pure-doc/references';
const SKILL_DIR = 'config/.claude/skills/pure-doc';
const REQUIRED_BRANCH = 'chore/pure_doc_skill';

const git = simpleGit(projectRoot);

async function checkGitPrerequisites(): Promise<void> {
  // 1. Check current branch
  const branchSummary = await git.branch();
  const currentBranch = branchSummary.current;

  if (currentBranch !== REQUIRED_BRANCH) {
    throw new Error(`❌ Current branch is '${currentBranch}', but must be '${REQUIRED_BRANCH}'`);
  }
  console.log(`✅ Branch: ${currentBranch}`);

  // 2. Fetch remote to get latest state
  console.log('📡 Fetching remote...');
  await git.fetch();

  // 3. Check if behind remote (not up-to-date)
  const status = await git.status();
  if (status.behind > 0) {
    throw new Error(`❌ Local branch is ${status.behind} commits behind remote. Please pull first.`);
  }
  console.log('✅ Not behind remote');
}

async function commitAndPush(): Promise<void> {
  // Check if there are changes in the skill directory
  const status = await git.status();
  const skillChanges = status.files.filter(
    (f) => f.path.startsWith(SKILL_DIR) || f.path.startsWith(SKILL_DIR.replace(/\//g, '\\'))
  );

  if (skillChanges.length === 0) {
    console.log('\n📭 No changes in skill directory, nothing to commit.');
    return;
  }

  console.log(`\n📝 Found ${skillChanges.length} changed files in ${SKILL_DIR}`);

  // Stage changes in skill directory
  await git.add(`${SKILL_DIR}/*`);

  // Commit
  const commitMessage = `docs(pure-doc): 🔄 update CloudBase API references\n\nCrawled at ${new Date().toISOString()}`;
  await git.commit(commitMessage);
  console.log('✅ Committed changes');

  // Push to remote
  console.log('📤 Pushing to remote...');
  await git.push('origin', REQUIRED_BRANCH);
  console.log('✅ Pushed to remote');
}

interface CrawlResult {
  url: string;
  title: string;
  content: string;
  filename: string;
}

function createTurndown() {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  turndown.use(gfm);
  turndown.remove(['script', 'style', 'nav', 'footer', 'aside']);
  return turndown;
}

async function fetchMarkdown(url: string): Promise<{ title: string; content: string }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', Accept: 'text/html' },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const html = await response.text();
  const result = await Defuddle(html, url);
  return { title: result.title || 'Untitled', content: createTurndown().turndown(result.content || '') };
}

function extractApiLinks(content: string): string[] {
  const links: string[] = [];
  for (const line of content.split('\n')) {
    if (line.startsWith('| [')) {
      const match = line.match(/\[([^\]]+)\]\(\/document\/api\/876\/(\d+)\)/);
      if (match && !links.includes(`${BASE_URL}/document/api/876/${match[2]}`)) {
        links.push(`${BASE_URL}/document/api/876/${match[2]}`);
      }
    }
  }
  return links;
}

function urlToFilename(url: string, title: string): string {
  const docId = url.match(/\/(\d+)$/)?.[1] || 'unknown';
  const cleanTitle = title.replace(/[^\w\u4e00-\u9fa5]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return `${docId}-${cleanTitle}.md`;
}

async function main() {
  const shouldCommit = process.argv.includes('--commit');
  const outputDir = process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : join(projectRoot, DEFAULT_OUTPUT_DIR);

  // If --commit flag is set, check prerequisites first
  if (shouldCommit) {
    console.log('🔍 Checking git prerequisites...\n');
    await checkGitPrerequisites();
    console.log('');
  }

  if (existsSync(outputDir)) {
    console.log(`🧹 Cleaning existing files in ${outputDir}...`);
    const mdFiles = readdirSync(outputDir).filter((f) => f.endsWith('.md'));
    mdFiles.forEach((f) => rmSync(join(outputDir, f)));
    console.log(`   Removed ${mdFiles.length} existing markdown files\n`);
  } else {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log(`📁 Output directory: ${outputDir}\n🚀 Concurrency: ${CONCURRENCY}\n`);

  const results: CrawlResult[] = [];
  const limit = pLimit(CONCURRENCY);
  let completed = 0;

  console.log('📄 Fetching common parameters doc...');
  try {
    const common = await fetchMarkdown(COMMON_PARAMS_URL);
    results.push({ url: COMMON_PARAMS_URL, title: common.title, content: common.content, filename: urlToFilename(COMMON_PARAMS_URL, common.title) });
    console.log(`   ✅ ${common.title}`);
  } catch (err) {
    console.error(`   ❌ Failed: ${err}`);
  }

  console.log('📄 Fetching API overview...');
  let apiLinks: string[] = [];
  try {
    const overview = await fetchMarkdown(API_OVERVIEW_URL);
    results.push({ url: API_OVERVIEW_URL, title: overview.title, content: overview.content, filename: urlToFilename(API_OVERVIEW_URL, overview.title) });
    console.log(`   ✅ ${overview.title}`);
    apiLinks = extractApiLinks(overview.content);
    console.log(`   📋 Found ${apiLinks.length} API links`);
  } catch (err) {
    console.error(`   ❌ Failed: ${err}`);
    return;
  }

  console.log(`\n📄 Fetching ${apiLinks.length} API docs...`);
  const startTime = Date.now();

  const fetchTasks = apiLinks.map((url) =>
    limit(async () => {
      try {
        const doc = await fetchMarkdown(url);
        completed++;
        if (doc.title.includes('API 概览') || doc.title.includes('API概览')) {
          console.log(`   [${completed}/${apiLinks.length}] ⏭️  skipped`);
          return null;
        }
        console.log(`   [${completed}/${apiLinks.length}] ✅ ${doc.title}`);
        return { url, title: doc.title, content: doc.content, filename: urlToFilename(url, doc.title) } as CrawlResult;
      } catch (err) {
        completed++;
        console.error(`   [${completed}/${apiLinks.length}] ❌ ${url}: ${err}`);
        return null;
      }
    })
  );

  const validResults = (await Promise.all(fetchTasks)).filter((r): r is CrawlResult => r !== null);
  results.push(...validResults);
  console.log(`   ⏱️  Fetched in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  console.log(`\n💾 Saving ${results.length} documents...`);
  results.forEach((r) => writeFileSync(join(outputDir, r.filename), r.content));

  const indexContent = `# CloudBase API 文档索引\n\n爬取时间: ${new Date().toISOString()}\n\n## 文档列表\n\n${results.map((r) => `- [${r.title}](./${r.filename})`).join('\n')}\n`;
  writeFileSync(join(outputDir, 'README.md'), indexContent);

  console.log(`\n✅ Done! ${results.length} documents saved to ${outputDir}`);

  // If --commit flag is set, commit and push changes
  if (shouldCommit) {
    await commitAndPush();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

