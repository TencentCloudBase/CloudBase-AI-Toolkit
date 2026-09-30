/**
 * Build evals/site/tasks.json from benchmark PROMPT.md files.
 * Scored tasks come from the tree. Unscored and absent notes are fixed
 * catalog text, not a second hand-written task list.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const benchmarkDir = path.resolve(siteDir, '../evals/benchmark');

const UNSCORED_REASON = {
  'build-dataapi-001-relational-report': {
    zh: 'orders 的行级安全没有打开。',
    en: 'orders row security was left off.',
  },
  'resolve-database-001-migration-history-mismatch': {
    zh: '现网没有 public.profiles。',
    en: 'The live database has no public.profiles.',
  },
  'deploy-functions-001-edge-function-secrets': {
    zh: '函数落在 app_private.edge_secret，评分器认的是 public.edge_secret。',
    en: 'The function landed as app_private.edge_secret; the scorer looks for public.edge_secret.',
  },
};

const DRAFTS = {
  'build-auth-001-username-signin': {
    zh: '没有 app/ 夹具，还不能打分。',
    en: 'No app/ fixture, so it cannot be scored yet.',
  },
  'resolve-database-001-security-rules-repair': {
    zh: '没有可评分的初始状态。',
    en: 'No initial state the scorer can check.',
  },
};

const ABSENT = [
  {
    group: 'later',
    zh: '后置',
    en: 'Later',
    items: [
      { id: 'build-cli-003-pg-cron-queue-workflow' },
      { id: 'investigate-reliability-003-edge-function-5xx-correlation' },
      { id: 'resolve-performance-001-slow-query-cpu-spike' },
    ],
  },
  {
    group: 'out',
    zh: '不做',
    en: 'Out of scope',
    items: [
      { id: 'deploy-database-001-prometheus-metrics' },
      { id: 'deploy-self-hosting-001-docker-compose' },
    ],
  },
  {
    group: 'gap',
    zh: '产品面还没有题',
    en: 'No task yet',
    items: [{ id: 'hosting' }, { id: 'cloudrun' }],
  },
];

function parseFrontmatter(markdown) {
  const text = markdown.replace(/^\uFEFF/, '');
  if (!text.startsWith('---\n')) {
    throw new Error('PROMPT.md must start with frontmatter');
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('PROMPT.md frontmatter is missing the closing ---');
  const raw = text.slice(4, end);
  const body = text.slice(end + 5).replace(/^\n/, '');
  const doc = {};
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!match) throw new Error(`Unsupported frontmatter line: ${line}`);
    const key = match[1];
    const rest = match[2];
    if (rest === '') {
      const items = [];
      i += 1;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s+-\s+/, '').trim());
        i += 1;
      }
      doc[key] = items;
      continue;
    }
    if (rest === '>' || rest === '>-' || rest === '|' || rest === '|-') {
      const chunk = [];
      i += 1;
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim() !== '') chunk.push(lines[i].trim());
        i += 1;
      }
      doc[key] = chunk.join(rest.startsWith('>') ? ' ' : '\n');
      continue;
    }
    doc[key] = rest.replace(/^["']|["']$/g, '');
    i += 1;
  }
  return { doc, body };
}

function summaryOf(body) {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .find(Boolean);
  if (!paragraph) return '';
  return paragraph.length > 220 ? `${paragraph.slice(0, 217)}...` : paragraph;
}

function taskFrom(id, doc, body) {
  const product = doc.product;
  return {
    id,
    stage: typeof doc.stage === 'string' ? doc.stage : '',
    interface: typeof doc.interface === 'string' ? doc.interface : '',
    product: Array.isArray(product) ? product : product ? [String(product)] : [],
    summary: summaryOf(body),
  };
}

const dirs = (await readdir(benchmarkDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const scored = [];
const unscored = [];
const drafts = [];

for (const id of dirs) {
  const markdown = await readFile(path.join(benchmarkDir, id, 'PROMPT.md'), 'utf8');
  const { doc, body } = parseFrontmatter(markdown);
  const task = taskFrom(id, doc, body);
  if (doc.board === 'unscored' || UNSCORED_REASON[id]) {
    if (!UNSCORED_REASON[id]) {
      throw new Error(`${id} is board:unscored but has no public reason`);
    }
    unscored.push({ ...task, reason: UNSCORED_REASON[id] });
    continue;
  }
  if (DRAFTS[id]) {
    drafts.push({ ...task, note: DRAFTS[id] });
    continue;
  }
  scored.push(task);
}

const payload = {
  scored,
  unscored,
  absent: [
    {
      group: 'draft',
      zh: '草案还不能打分',
      en: 'Draft, not scorable',
      items: drafts.map((task) => ({ id: task.id, note: task.note })),
    },
    ...ABSENT,
  ],
};

await writeFile(path.join(siteDir, 'tasks.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`scored ${scored.length}, unscored ${unscored.length}, drafts ${drafts.length}`);
