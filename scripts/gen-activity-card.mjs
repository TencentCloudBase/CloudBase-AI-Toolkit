#!/usr/bin/env node

/**
 * Generate the README repository-activity card (light + dark SVG).
 *
 * Data sources (all public):
 *   - GitHub REST: repo facts, 52-week commit participation, releases,
 *     issues, contributors
 *   - npm registry: daily download counts for the shipped package
 *
 * Output:
 *   scripts/assets/activity-card-light.svg
 *   scripts/assets/activity-card-dark.svg
 *
 * Usage:
 *   GITHUB_TOKEN=$(gh auth token) node scripts/gen-activity-card.mjs
 *
 * GITHUB_TOKEN is optional locally (60 req/h unauthenticated) and provided
 * automatically by Actions. The npm endpoint needs no auth.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'TencentCloudBase/CloudBase-AI-Toolkit';
const NPM_PACKAGE = '@cloudbase/cloudbase-mcp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, 'assets');

const API = 'https://api.github.com';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(pathname) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cloudbase-activity-card',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  // The stats endpoints answer 202 while the backend computes the numbers.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(`${API}${pathname}`, { headers });
    if (res.status === 202) {
      await sleep(4000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`GitHub GET ${pathname} -> ${res.status}`);
    }
    return res;
  }
  throw new Error(`GitHub GET ${pathname} -> still 202 after retries`);
}

async function ghJson(pathname) {
  return (await gh(pathname)).json();
}

function lastPage(res, fallback) {
  const link = res.headers.get('link') || '';
  const m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : fallback;
}

function fmtNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('en-US');
}

const isoDate = (d) => d.toISOString().slice(0, 10);

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`;
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = i > 0 ? pts[i - 1] : pts[0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : pts[pts.length - 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)}`
      + ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function barPath(x, y, w, h, r = 3) {
  if (h <= 0) return '';
  const rr = Math.min(r, h / 2, w / 2);
  return `M ${x.toFixed(1)} ${(y + h).toFixed(1)} L ${x.toFixed(1)} ${(y + rr).toFixed(1)}`
    + ` Q ${x.toFixed(1)} ${y.toFixed(1)} ${(x + rr).toFixed(1)} ${y.toFixed(1)}`
    + ` L ${(x + w - rr).toFixed(1)} ${y.toFixed(1)}`
    + ` Q ${(x + w).toFixed(1)} ${y.toFixed(1)} ${(x + w).toFixed(1)} ${(y + rr).toFixed(1)}`
    + ` L ${(x + w).toFixed(1)} ${(y + h).toFixed(1)} Z`;
}

// ------------------------------------------------------------ data fetch

async function fetchData() {
  const now = new Date();
  // npm's per-day counts lag by up to a day, and the newest day often comes
  // back as 0 while it is still being aggregated. Stop two days back so a
  // zero-filled day never drags the 30-day total down.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, 1));

  const [repo, participation, releasesRes, openRes, closedRes, contributorsRes] =
    await Promise.all([
      ghJson(`/repos/${REPO}`),
      ghJson(`/repos/${REPO}/stats/participation`),
      gh(`/repos/${REPO}/releases?per_page=100`),
      gh(`/repos/${REPO}/issues?state=open&per_page=100`),
      gh(`/repos/${REPO}/issues?state=closed&per_page=100&sort=updated`),
      gh(`/repos/${REPO}/contributors?per_page=1`),
    ]);

  const weekly = (participation.all || []).slice(-52);
  if (weekly.length !== 52) {
    throw new Error(`expected 52 weeks of participation data, got ${weekly.length}`);
  }

  const releases = await releasesRes.json();
  const openIssues = (await openRes.json()).filter((i) => !i.pull_request).length;
  const closed = (await closedRes.json()).filter((i) => !i.pull_request && i.closed_at);

  const durations = closed
    .map((i) => (new Date(i.closed_at) - new Date(i.created_at)) / 3_600_000)
    .sort((a, b) => a - b);
  const medianCloseHours = durations.length
    ? durations[Math.floor(durations.length / 2)]
    : null;

  const releasesWithin = (days) => releases.filter((r) => {
    const age = (now - new Date(r.published_at)) / 86_400_000;
    return age >= 0 && age <= days;
  }).length;

  const latest = releases[0];
  const latestDaysAgo = latest
    ? Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      - Date.UTC(
        new Date(latest.published_at).getUTCFullYear(),
        new Date(latest.published_at).getUTCMonth(),
        new Date(latest.published_at).getUTCDate(),
      )) / 86_400_000)
    : null;

  const npmRes = await fetch(
    `https://api.npmjs.org/downloads/range/${isoDate(start)}:${isoDate(end)}/${encodeURIComponent(NPM_PACKAGE)}`,
  );
  if (!npmRes.ok) throw new Error(`npm downloads -> ${npmRes.status}`);
  const npmDays = (await npmRes.json()).downloads || [];

  const months = [];
  for (const day of npmDays) {
    const key = day.day.slice(0, 7);
    if (months.length && months[months.length - 1].key === key) {
      months[months.length - 1].value += day.downloads;
    } else {
      months.push({ key, value: day.downloads });
    }
  }

  return {
    repo: REPO,
    generatedAt: isoDate(now),
    weekly,
    months: months.slice(-13),
    downloads30d: npmDays.slice(-30).reduce((sum, d) => sum + d.downloads, 0),
    latestRelease: latest
      ? { tag: latest.tag_name, daysAgo: latestDaysAgo }
      : { tag: 'n/a', daysAgo: null },
    releasesTotal: lastPage(releasesRes, releases.length),
    releasesLast30d: releasesWithin(30),
    openIssues,
    contributors: lastPage(contributorsRes, 1),
    forks: repo.forks_count,
    medianCloseHours,
  };
}

// ---------------------------------------------------------- svg rendering

const W = 860;
const H = 564;
const PAD = 28;
const CW = W - 2 * PAD;
const KPI_W = CW / 4;
const P1_Y = 208;
const P1_H = 92;
const P2_Y = 372;
const P2_H = 78;
const SEP1_Y = 168;
const SEP2_Y = 492;
const BADGE_Y = 506;
const BADGE_H = 38;
const BADGE_GAP = 12;
const BADGE_W = (CW - 3 * BADGE_GAP) / 4;

const PALETTE = {
  light: {
    bg: '#ffffff', bg2: '#f7fafd', border: '#e3e8ef', grid: '#eef2f7',
    fg: '#0f172a', muted: '#5b6675', sub: '#8a94a3',
    blue: '#3B82F6', cyan: '#0891b2', accent: '#2563eb',
    chip: '#f4f7fb', chipborder: '#e8eef6',
  },
  dark: {
    bg: '#0d1117', bg2: '#111a24', border: '#1f2a37', grid: '#1c2733',
    fg: '#e6edf3', muted: '#8b949e', sub: '#6e7681',
    blue: '#3B82F6', cyan: '#22d3ee', accent: '#58a6ff',
    chip: '#161f2b', chipborder: '#22303f',
  },
};

function buildSvg(data, dark) {
  const c = dark ? PALETTE.dark : PALETTE.light;
  const { weekly, months, latestRelease } = data;

  // -- weekly commits: smooth line over a gradient area --
  const vmax1 = Math.max(...weekly) * 1.18;
  const step1 = CW / (weekly.length - 1);
  const pts = weekly.map((v, i) => [PAD + i * step1, P1_Y + P1_H - (v / vmax1) * P1_H]);
  const line = smoothPath(pts);
  const base1 = P1_Y + P1_H;
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${base1.toFixed(1)}`
    + ` L ${pts[0][0].toFixed(1)} ${base1.toFixed(1)} Z`;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = (P1_Y + P1_H * f).toFixed(1);
    return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}"`
      + ` stroke="${c.grid}" stroke-width="1"/>`;
  }).join('');

  const peakIdx = weekly.indexOf(Math.max(...weekly));
  const [px, py] = pts[peakIdx];
  const [lx, ly] = pts[pts.length - 1];

  const axis1 = [
    [PAD, '52w ago', 'start'],
    [PAD + CW * 0.25, '39w', 'middle'],
    [PAD + CW * 0.5, '26w', 'middle'],
    [PAD + CW * 0.75, '13w', 'middle'],
    [W - PAD, 'now', 'end'],
  ].map(([x, t, a]) => `<text x="${Number(x).toFixed(0)}" y="${(base1 + 20).toFixed(0)}"`
    + ` fill="${c.sub}" font-size="10.5" font-family="${FONT}"`
    + ` text-anchor="${a}">${t}</text>`).join('');

  // -- monthly npm downloads: rounded-top bars, older months lighter --
  const vals = months.map((m) => m.value);
  const keys = months.map((m) => m.key);
  const n = vals.length;
  const vmax2 = Math.max(...vals) * 1.12;
  const step2 = CW / n;
  const barW = Math.min(38, step2 - 16);
  const base2 = P2_Y + P2_H;

  const bars = vals.map((v, i) => {
    const bh = (v / vmax2) * P2_H;
    const bx = PAD + i * step2 + (step2 - barW) / 2;
    const opacity = (0.34 + 0.66 * (i / (n - 1))).toFixed(2);
    return `<path d="${barPath(bx, base2 - bh, barW, bh)}" fill="url(#bar)"`
      + ` fill-opacity="${opacity}"/>`;
  }).join('');

  const lastCx = PAD + (n - 1) * step2 + step2 / 2;
  const lastTop = base2 - (vals[n - 1] / vmax2) * P2_H;

  const axis2 = [0, 1, 2, 3].map((k) => {
    const i = Math.round((k * (n - 1)) / 3);
    const x = (PAD + i * step2 + step2 / 2).toFixed(0);
    return `<text x="${x}" y="${(base2 + 20).toFixed(0)}" fill="${c.sub}" font-size="10.5"`
      + ` font-family="${FONT}" text-anchor="middle">${monthLabel(keys[i])}</text>`;
  }).join('');

  // -- KPI row --
  const kpis = [
    ['Commits', data.weekly.reduce((a, b) => a + b, 0).toLocaleString('en-US'), 'last 52 weeks'],
    ['npm downloads', fmtNum(data.downloads30d), 'last 30 days'],
    ['Releases', String(data.releasesLast30d), 'shipped in 30 days'],
    ['Issue close', data.medianCloseHours ? `${Math.round(data.medianCloseHours)}h` : 'n/a', 'median response'],
  ].map(([label, val, note], i) => {
    const x = (PAD + i * KPI_W).toFixed(0);
    return `<text x="${x}" y="108" fill="${c.fg}" font-size="28" font-weight="700"`
      + ` font-family="${FONT}" letter-spacing="-.6">${val}</text>`
      + `<text x="${x}" y="130" fill="${c.muted}" font-size="12.5" font-weight="600"`
      + ` font-family="${FONT}">${label}</text>`
      + `<text x="${x}" y="147" fill="${c.sub}" font-size="11" font-family="${FONT}">${note}</text>`;
  }).join('');

  // -- health badges --
  const badges = [
    ['Latest release', latestRelease.daysAgo === null
      ? latestRelease.tag
      : `${latestRelease.tag}  ·  ${latestRelease.daysAgo}d ago`],
    ['Open issues', String(data.openIssues)],
    ['Contributors', String(data.contributors)],
    ['Forks', String(data.forks)],
  ].map(([label, val], i) => {
    const x = PAD + i * (BADGE_W + BADGE_GAP);
    return `<rect x="${x.toFixed(1)}" y="${BADGE_Y}" width="${BADGE_W.toFixed(1)}"`
      + ` height="${BADGE_H}" rx="9" fill="${c.chip}" stroke="${c.chipborder}" stroke-width="1"/>`
      + `<text x="${(x + 13).toFixed(1)}" y="${BADGE_Y + 15}" fill="${c.sub}" font-size="10.5"`
      + ` font-family="${FONT}">${label}</text>`
      + `<text x="${(x + 13).toFixed(1)}" y="${BADGE_Y + 30}" fill="${c.fg}" font-size="12.5"`
      + ` font-weight="600" font-family="${FONT}">${val}</text>`;
  }).join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Repository activity and health for ${data.repo}">
  <defs>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.bg2}"/>
    </linearGradient>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.blue}" stop-opacity=".34"/>
      <stop offset="1" stop-color="${c.blue}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${c.blue}"/><stop offset="1" stop-color="${c.cyan}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.cyan}"/><stop offset="1" stop-color="${c.blue}"/>
    </linearGradient>
    <filter id="soft" x="-40%" y="-70%" width="180%" height="280%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="url(#card)" stroke="${c.border}"/>

  <text x="${PAD}" y="48" fill="${c.fg}" font-size="17" font-weight="700" font-family="${FONT}">Repository Activity</text>
  <text x="${PAD}" y="68" fill="${c.muted}" font-size="12" font-family="${FONT}">${data.repo}</text>

  <rect x="${W - PAD - 142}" y="32" width="142" height="24" rx="12" fill="${c.blue}" fill-opacity=".10" stroke="${c.blue}" stroke-opacity=".30"/>
  <circle cx="${W - PAD - 126}" cy="44" r="3.5" fill="${c.cyan}"/>
  <text x="${W - PAD - 116}" y="48" fill="${c.accent}" font-size="11" font-weight="600" font-family="${FONT}">updated ${data.generatedAt}</text>

  ${kpis}
  <line x1="${PAD}" y1="${SEP1_Y}" x2="${W - PAD}" y2="${SEP1_Y}" stroke="${c.border}" stroke-width="1"/>

  <text x="${PAD}" y="192" fill="${c.fg}" font-size="13" font-weight="600" font-family="${FONT}">Commits per week</text>
  <text x="${W - PAD}" y="192" fill="${c.sub}" font-size="11" font-family="${FONT}" text-anchor="end">52 weeks  ·  peak ${Math.max(...weekly)}</text>

  ${grid}
  <path d="${area}" fill="url(#area)"/>
  <path d="${line}" stroke="url(#stroke)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${c.blue}" fill-opacity=".40"/>
  <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="9" fill="${c.cyan}" fill-opacity=".16"/>
  <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="${c.cyan}" filter="url(#soft)"/>
  ${axis1}

  <text x="${PAD}" y="356" fill="${c.fg}" font-size="13" font-weight="600" font-family="${FONT}">npm downloads per month</text>
  <text x="${W - PAD}" y="356" fill="${c.sub}" font-size="11" font-family="${FONT}" text-anchor="end">${n} months  ·  latest month to date</text>

  <line x1="${PAD}" y1="${base2.toFixed(1)}" x2="${W - PAD}" y2="${base2.toFixed(1)}" stroke="${c.grid}" stroke-width="1"/>
  ${bars}
  <text x="${lastCx.toFixed(1)}" y="${(lastTop - 8).toFixed(1)}" fill="${c.fg}" font-size="11.5" font-weight="600" font-family="${FONT}" text-anchor="middle">${vals[n - 1].toLocaleString('en-US')}</text>
  ${axis2}

  <line x1="${PAD}" y1="${SEP2_Y}" x2="${W - PAD}" y2="${SEP2_Y}" stroke="${c.border}" stroke-width="1"/>
  ${badges}
</svg>`;
}

// ------------------------------------------------------------------ main

const data = await fetchData();
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'activity-card-light.svg'), buildSvg(data, false));
fs.writeFileSync(path.join(OUT_DIR, 'activity-card-dark.svg'), buildSvg(data, true));

console.log(`activity card updated for ${data.repo}`);
console.log(`  commits 52w   : ${data.weekly.reduce((a, b) => a + b, 0).toLocaleString('en-US')}`);
console.log(`  downloads 30d : ${data.downloads30d.toLocaleString('en-US')}`);
console.log(`  latest month  : ${data.months[data.months.length - 1].value.toLocaleString('en-US')}`);
console.log(`  releases 30d  : ${data.releasesLast30d} (total ${data.releasesTotal})`);
console.log(`  issue median  : ${data.medianCloseHours ? `${data.medianCloseHours.toFixed(1)}h` : 'n/a'}`);
