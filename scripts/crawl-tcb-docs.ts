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
 * Output: config/.claude/skills/cloudbase-api-direct/references/
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
const DEPS_INDEX_URL = 'https://cloud.tencent.com/document/api/876/34808';
const CONCURRENCY = 2; // 降低并发数，避免触发限流
const REQUEST_DELAY_MS = 500; // 请求间隔（毫秒）
const MAX_RETRIES = 3; // 最大重试次数
const RETRY_DELAY_MS = 2000; // 重试等待时间（毫秒）
const DEFAULT_OUTPUT_DIR = 'config/.claude/skills/cloudbase-api-direct/references';
const SKILL_DIR = 'config/.claude/skills/cloudbase-api-direct';
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
  const commitMessage = `docs(cloudbase-api-direct): 🔄 update CloudBase API references\n\nCrawled at ${new Date().toISOString()}`;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMarkdownWithRetry(url: string, retries = MAX_RETRIES): Promise<{ title: string; content: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });

      if (!response.ok) {
        // 如果是 567 或其他 5xx 错误，可以重试
        if (response.status >= 500 && attempt < retries) {
          console.log(`      ⚠️  Attempt ${attempt}/${retries} failed (${response.status}), retrying in ${RETRY_DELAY_MS}ms...`);
          await sleep(RETRY_DELAY_MS * attempt); // 指数退避
          continue;
        }
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }

      const html = await response.text();
      const result = await Defuddle(html, url);

      // 请求成功后等待一下再返回，避免请求太快
      await sleep(REQUEST_DELAY_MS);

      return { title: result.title || 'Untitled', content: createTurndown().turndown(result.content || '') };
    } catch (err) {
      if (attempt < retries) {
        console.log(`      ⚠️  Attempt ${attempt}/${retries} failed, retrying in ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
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

// Extract cross-product API links from the deps index page (product/1003, product/583, api/436, etc.)
function extractDepsLinks(content: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  // Match full URLs: https://cloud.tencent.com/document/(api|product)/{productId}/{docId}
  const re = /https:\/\/cloud\.tencent\.com(\/document\/(api|product)\/(\d+)\/(\d+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const productId = m[3];
    // Skip TCB (876) links — those are handled by the main crawler
    if (productId === '876') continue;
    const url = `${BASE_URL}${m[1]}`;
    if (!seen.has(url)) {
      seen.add(url);
      links.push(url);
    }
  }
  return links;
}

function urlToFilename(url: string, title: string): string {
  // Extract product id + doc id for namespacing, e.g. "1003-71660" or "876-34812"
  const productMatch = url.match(/\/(api|product)\/(\d+)\/(\d+)/);
  const prefix = productMatch ? `${productMatch[2]}-${productMatch[3]}` : url.match(/\/(\d+)$/)?.[1] || 'unknown';
  const cleanTitle = title.replace(/[^\w\u4e00-\u9fa5]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return `${prefix}-${cleanTitle}.md`;
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
  let failedCount = 0; // 跟踪失败数量

  console.log('📄 Fetching common parameters doc...');
  try {
    const common = await fetchMarkdownWithRetry(COMMON_PARAMS_URL);
    results.push({ url: COMMON_PARAMS_URL, title: common.title, content: common.content, filename: urlToFilename(COMMON_PARAMS_URL, common.title) });
    console.log(`   ✅ ${common.title}`);
  } catch (err) {
    console.error(`   ❌ Failed: ${err}`);
    failedCount++;
  }

  console.log('📄 Fetching API overview...');
  let apiLinks: string[] = [];
  try {
    const overview = await fetchMarkdownWithRetry(API_OVERVIEW_URL);
    results.push({ url: API_OVERVIEW_URL, title: overview.title, content: overview.content, filename: urlToFilename(API_OVERVIEW_URL, overview.title) });
    console.log(`   ✅ ${overview.title}`);
    apiLinks = extractApiLinks(overview.content);
    console.log(`   📋 Found ${apiLinks.length} API links`);
  } catch (err) {
    console.error(`   ❌ Failed: ${err}`);
    failedCount++;
    console.error('\n❌ Cannot continue without API overview. Aborting.');
    process.exit(1);
  }

  console.log(`\n📄 Fetching ${apiLinks.length} API docs...`);
  const startTime = Date.now();

  const fetchTasks = apiLinks.map((url) =>
    limit(async () => {
      try {
        const doc = await fetchMarkdownWithRetry(url);
        completed++;
        if (doc.title.includes('API 概览') || doc.title.includes('API概览')) {
          console.log(`   [${completed}/${apiLinks.length}] ⏭️  skipped`);
          return { success: true, result: null };
        }
        console.log(`   [${completed}/${apiLinks.length}] ✅ ${doc.title}`);
        return { success: true, result: { url, title: doc.title, content: doc.content, filename: urlToFilename(url, doc.title) } as CrawlResult };
      } catch (err) {
        completed++;
        console.error(`   [${completed}/${apiLinks.length}] ❌ ${url}: ${err}`);
        return { success: false, result: null };
      }
    })
  );

  const fetchResults = await Promise.all(fetchTasks);
  const validResults = fetchResults.filter((r) => r.success && r.result !== null).map((r) => r.result as CrawlResult);
  const apiFailed = fetchResults.filter((r) => !r.success).length;
  failedCount += apiFailed;

  results.push(...validResults);
  console.log(`   ⏱️  Fetched in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // --- Deps docs ---
  console.log('\n📄 Fetching deps index page...');
  let depsLinks: string[] = [];
  try {
    const depsIndex = await fetchMarkdownWithRetry(DEPS_INDEX_URL);
    console.log(`   ✅ ${depsIndex.title}`);
    depsLinks = extractDepsLinks(depsIndex.content);
    console.log(`   📋 Found ${depsLinks.length} deps API links`);
  } catch (err) {
    console.error(`   ❌ Failed to fetch deps index: ${err}`);
    failedCount++;
  }

  if (depsLinks.length > 0) {
    console.log(`\n📄 Fetching ${depsLinks.length} deps API docs...`);
    const depsStartTime = Date.now();
    let depsCompleted = 0;

    const depsTasks = depsLinks.map((url) =>
      limit(async () => {
        try {
          const doc = await fetchMarkdownWithRetry(url);
          depsCompleted++;
          console.log(`   [${depsCompleted}/${depsLinks.length}] ✅ ${doc.title}`);
          return { success: true, result: { url, title: doc.title, content: doc.content, filename: urlToFilename(url, doc.title) } as CrawlResult };
        } catch (err) {
          depsCompleted++;
          console.error(`   [${depsCompleted}/${depsLinks.length}] ❌ ${url}: ${err}`);
          return { success: false, result: null };
        }
      })
    );

    const depsResults = await Promise.all(depsTasks);
    const validDepsResults = depsResults.filter((r) => r.success && r.result !== null).map((r) => r.result as CrawlResult);
    const depsFailed = depsResults.filter((r) => !r.success).length;
    failedCount += depsFailed;

    results.push(...validDepsResults);
    console.log(`   ⏱️  Fetched in ${((Date.now() - depsStartTime) / 1000).toFixed(1)}s`);
  }

  console.log(`\n💾 Saving ${results.length} documents...`);
  results.forEach((r) => writeFileSync(join(outputDir, r.filename), r.content));

  const indexContent = `# CloudBase API 文档索引\n\n爬取时间: ${new Date().toISOString()}\n\n## 文档列表\n\n${results.map((r) => `- [${r.title}](./${r.filename})`).join('\n')}\n`;
  writeFileSync(join(outputDir, 'README.md'), indexContent);

  console.log(`\n✅ Done! ${results.length} documents saved to ${outputDir}`);

  // 如果有失败，不执行 commit
  if (failedCount > 0) {
    console.log(`\n⚠️  ${failedCount} documents failed to fetch. Skipping commit.`);
    if (shouldCommit) {
      console.log('   Use --commit only when all documents are fetched successfully.');
    }
    process.exit(1);
  }

  // If --commit flag is set, commit and push changes
  if (shouldCommit) {
    await commitAndPush();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
