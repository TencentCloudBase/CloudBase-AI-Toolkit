/**
 * 生成 CloudBase 开放 API 清单页（doc/api-reference.md）
 *
 * 每日由 .github/workflows/sync-api-reference.yml 在 main 上自动运行：
 * 1. 拉取腾讯云官方文档两页：API 概览(876/34809) + 依赖产品接口指引(876/34808)
 * 2. 提取正文，turndown(+gfm) 转 Markdown
 * 3. 组合写入 doc/api-reference.md，随 cloudbase-docs 同步链路发布到 docs.cloudbase.net
 *
 * 依赖：turndown + turndown-plugin-gfm（不在 package.json 中，CI 通过
 *   npm install --prefix .api-ref-deps turndown turndown-plugin-gfm 安装，
 *   并以环境变量 API_REF_DEPS_DIR=.api-ref-deps 传入；本地未设置时按常规解析）。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(repoRoot, 'doc', 'api-reference.md');

const SOURCES = [
  {
    key: 'overview',
    title: 'API 概览',
    url: 'https://cloud.tencent.com/document/api/876/34809',
  },
  {
    key: 'dependencies',
    title: '依赖产品接口指引',
    url: 'https://cloud.tencent.com/document/api/876/34808',
  },
];

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 页面分享组件 / 收藏等噪音（仅在标题区出现，正文表格不会包含这些词）
const JUNK_LINE =
  /微信扫一扫|新浪微博|复制链接|链接复制成功|我的收藏|^最近更新时间[:：]|^\*?\s*QQ\s*$/;

function loadTurndown() {
  const depsDir = process.env.API_REF_DEPS_DIR;
  if (depsDir) {
    return {
      TurndownService: require(path.join(depsDir, 'node_modules', 'turndown')),
      gfm: require(path.join(depsDir, 'node_modules', 'turndown-plugin-gfm')).gfm,
    };
  }
  return {
    TurndownService: require('turndown'),
    gfm: require('turndown-plugin-gfm').gfm,
  };
}

async function fetchPage(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      console.warn(`fetch ${url} attempt ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  throw lastErr;
}

/** 提取正文区域：首个 <h1> 到 codeTemplate script 之前，并去掉"本页目录"导航块 */
function extractContent(html) {
  const start = html.indexOf('<h1');
  const end = html.indexOf('<script type="text/template" id="codeTemplate"');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('cannot locate content boundaries (page structure changed?)');
  }
  let content = html.slice(start, end);
  const toc = content.match(/<h2[^>]*>本页目录[:：]?<\/h2>/);
  if (toc) {
    const nextH2 = content.indexOf('<h2', toc.index + toc[0].length);
    content = content.slice(0, toc.index) + content.slice(nextH2);
  }
  return content;
}

function toMarkdown(turndown, html) {
  let md = turndown.turndown(html);
  // 官方站内相对链接转绝对链接，保证本页独立可读
  md = md.replace(/\]\(\/document\//g, '](https://cloud.tencent.com/document/');
  // 过滤分享组件等噪音行，并收敛多余空行
  md = md
    .split('\n')
    .filter((line) => !JUNK_LINE.test(line.trim()))
    // 去掉源页面自带的 h1（与我们组合时的 `## {title}` 重复）
    .filter((line, idx) => !(idx === 0 && line.startsWith('# ')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

async function main() {
  const { TurndownService, gfm } = loadTurndown();
  const turndown = new TurndownService({
    bullet: '-',
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });
  turndown.use(gfm);

  const sections = [];
  for (const src of SOURCES) {
    console.log(`fetching ${src.url} ...`);
    const html = extractContent(await fetchPage(src.url));
    const md = toMarkdown(turndown, html);
    if (md.length < 2000) {
      throw new Error(`${src.url} converted output too small (${md.length} chars), aborting`);
    }
    sections.push(`## ${src.title}\n\n${md}\n`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const output = `# CloudBase 开放 API 清单

> 本页面由定时任务每日自动从腾讯云官方文档同步生成（脚本：\`scripts/generate-api-reference.mjs\`），请勿手工编辑。
>
> - 数据源：[API 概览](https://cloud.tencent.com/document/api/876/34809) · [依赖产品接口指引](https://cloud.tencent.com/document/api/876/34808)
> - 所有接口均可通过 API 3.0 调用（如 CloudBase MCP 的 \`callCloudApi\` 工具、[API Explorer](https://console.cloud.tencent.com/api/explorer)）
> - 最近同步：${today}

${sections.join('\n')}
`;

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, output);
  console.log(`written ${OUT_FILE} (${output.length} chars)`);
}

main().catch((err) => {
  console.error('generate-api-reference failed:', err.message);
  process.exit(1);
});
