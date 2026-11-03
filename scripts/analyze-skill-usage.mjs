#!/usr/bin/env node
// scripts/analyze-skill-usage.mjs
// Reads the plugin audit log and reports whether injected skills were actually loaded.
//
// The interesting number is the split between:
//   - hits   : a skill was injected, then the model called it
//   - misses : a skill was injected and never called
//   - unprompted : the model called a skill nobody injected — proof it could have found
//     it on its own, which is exactly what decides whether the per-prompt injection can be
//     softened without losing coverage.
//
// Usage:
//   npm run analyze:skill-usage
//   npm run analyze:skill-usage -- --file /path/to/skill-injections.jsonl
//   npm run analyze:skill-usage -- --json
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const INJECTION_EVENTS = new Set(["user-prompt-submit", "pretooluse-skill-inject"]);
const USAGE_EVENT = "skill-usage";

function defaultAuditPath() {
  const configured = process.env.CLOUDBASE_PLUGIN_AUDIT_LOG_FILE;
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  if (typeof configured === "string" && configured.trim() !== "" && configured !== "off") {
    return resolve(projectRoot, configured);
  }
  const slug = projectRoot.replace(/[\\/]/g, "-");
  return join(homedir(), ".claude", "projects", slug, "cloudbase-plugin", "skill-injections.jsonl");
}

function parseArgs(argv) {
  const options = { file: defaultAuditPath(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--file" && argv[i + 1]) options.file = resolve(argv[++i]);
    else if (arg.startsWith("--file=")) options.file = resolve(arg.slice("--file=".length));
  }
  return options;
}

function pairKey(sessionId, skill) {
  return `${sessionId || "(no-session)"}\u0000${skill}`;
}

function readEvents(file) {
  const events = [];
  const lines = readFileSync(file, "utf-8").split("\n");
  let skipped = 0;
  for (const line of lines) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      skipped += 1;
    }
  }
  return { events, skipped };
}

function summarize(events) {
  // First injection wins for attribution: a skill injected by the prompt path and later
  // re-injected by the tool path keeps the channel that introduced it.
  const injections = new Map();
  let usageCalls = 0;
  const usages = [];
  const channelCounts = new Map();

  for (const event of events) {
    if (INJECTION_EVENTS.has(event.event)) {
      const channel = event.channel || event.event;
      channelCounts.set(channel, (channelCounts.get(channel) || 0) + (event.injectedSkills?.length || 0));
      for (const skill of event.injectedSkills || []) {
        const key = pairKey(event.sessionId, skill);
        if (!injections.has(key)) {
          injections.set(key, { skill, sessionId: event.sessionId || "", channel, timestamp: event.timestamp });
        }
      }
      continue;
    }
    if (event.event === USAGE_EVENT) {
      usageCalls += 1;
      usages.push(event);
    }
  }

  const usagePairs = new Set();
  const unprompted = [];
  for (const usage of usages) {
    const injectedAs = usage.injectedAs || (usage.injected ? usage.skill : "");
    const key = pairKey(usage.sessionId, injectedAs || usage.skill);
    if (injectedAs && injections.has(key)) usagePairs.add(key);
    else unprompted.push(usage);
  }

  const hitKeys = [...injections.keys()].filter((key) => usagePairs.has(key));
  const missKeys = [...injections.keys()].filter((key) => !usagePairs.has(key));

  const perSkill = new Map();
  for (const [key, entry] of injections) {
    const row = perSkill.get(entry.skill) || { skill: entry.skill, injected: 0, hit: 0 };
    row.injected += 1;
    if (usagePairs.has(key)) row.hit += 1;
    perSkill.set(entry.skill, row);
  }

  const sessions = new Set([
    ...[...injections.values()].map((entry) => entry.sessionId || "(none)"),
    ...usages.map((usage) => usage.sessionId || "(none)"),
  ]);
  const perChannel = new Map();
  for (const entry of injections.values()) {
    const row = perChannel.get(entry.channel) || { channel: entry.channel, injected: 0, hit: 0 };
    row.injected += 1;
    if (usagePairs.has(pairKey(entry.sessionId, entry.skill))) row.hit += 1;
    perChannel.set(entry.channel, row);
  }

  return {
    sessions: sessions.size,
    injections: injections.size,
    hits: hitKeys.length,
    misses: missKeys.length,
    usageCalls,
    unpromptedCalls: unprompted.length,
    injectionsByChannelRaw: Object.fromEntries(channelCounts),
    perChannel: [...perChannel.values()].sort((a, b) => b.injected - a.injected),
    perSkill: [...perSkill.values()].sort((a, b) => b.injected - a.injected || a.skill.localeCompare(b.skill)),
    neverCalled: missKeys
      .map((key) => injections.get(key).skill)
      .reduce((acc, skill) => acc.set(skill, (acc.get(skill) || 0) + 1), new Map()),
  };
}

function pct(part, total) {
  if (total === 0) return "n/a";
  return `${Math.round((part / total) * 100)}%`;
}

function formatReport(summary, file) {
  const lines = [];
  lines.push(`Audit log: ${file}`);
  lines.push(
    `Sessions: ${summary.sessions}   Injections: ${summary.injections}   Skill calls: ${summary.usageCalls}`,
  );
  lines.push("");
  lines.push(
    `Hit rate: ${summary.hits}/${summary.injections} (${pct(summary.hits, summary.injections)}) — an injected skill that was then loaded`,
  );
  lines.push(
    `Unprompted calls: ${summary.unpromptedCalls} — the model loaded a skill nobody injected`,
  );

  if (summary.perChannel.length > 0) {
    lines.push("");
    lines.push("By channel");
    for (const row of summary.perChannel) {
      lines.push(
        `  ${row.channel.padEnd(18)} injected ${String(row.injected).padStart(4)}   hit ${String(row.hit).padStart(4)}   ${pct(row.hit, row.injected)}`,
      );
    }
  }

  const top = summary.perSkill.slice(0, 10);
  if (top.length > 0) {
    lines.push("");
    lines.push("Top injected skills");
    for (const row of top) {
      lines.push(
        `  ${row.skill.padEnd(42)} injected ${String(row.injected).padStart(4)}   hit ${String(row.hit).padStart(4)}   ${pct(row.hit, row.injected)}`,
      );
    }
  }

  const never = [...summary.neverCalled.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (never.length > 0) {
    lines.push("");
    lines.push("Injected but never loaded (candidates for tighter matching)");
    for (const [skill, count] of never) lines.push(`  ${skill.padEnd(42)} ${count}`);
  }

  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.file)) {
    console.error(`No audit log at ${options.file}`);
    console.error("Set CLOUDBASE_PLUGIN_AUDIT_LOG_FILE to a path (the hooks write there), then retry.");
    process.exit(1);
  }

  const { events, skipped } = readEvents(options.file);
  const summary = summarize(events);

  if (options.json) {
    console.log(JSON.stringify({ file: options.file, skippedLines: skipped, ...summary }, null, 2));
    return;
  }

  console.log(formatReport(summary, options.file));
  if (skipped > 0) console.log(`\nSkipped ${skipped} unparsable line(s).`);
  if (summary.injections === 0) {
    console.log("\nNo injection events yet — run the plugin in a real session first.");
  }
}

main();
