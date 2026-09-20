#!/usr/bin/env node
/**
 * Build the `cloudbase-intl` WorkBuddy connector package.
 *
 * Usage:
 *   node scripts/build-connector-cloudbase-intl.mjs
 *
 * What it does, in order:
 *   1. Reuses scripts/build-allinone-skill.ts to aggregate `config/source/**` into one skill
 *      (same packaging as the domestic `cloudbase` connector — single content source).
 *   2. Copies the aggregate into connectors/cloudbase-intl/skills/.
 *   3. Rewrites China-site hosts to their international-site equivalents across the whole
 *      bundled corpus. Only probes-verified, semantically safe substitutions are applied;
 *      lines that document the China-site value as a fact (e.g. the CAM role carrier table)
 *      are skipped and reported. Host rewriting alone is not enough: where a reference
 *      contrasts domestic vs. international regions, the domestic half is dropped rather
 *      than rewritten, otherwise the heading and the URL would contradict each other.
 *   4. Adds connectors/cloudbase-intl/extra/*.md into skills/references/ and injects a
 *      pointer to them at the top of skills/SKILL.md.
 *   5. Validates the package (meta/mcp shape, no secrets, no China-site residue, no
 *      region/host contradictions) and zips the submittable files into
 *      dist/cloudbase-intl-connector.zip.
 *
 * skills/ is generated output — never hand-edit it; change config/source/** or extra/ instead.
 *
 * Release flow (CI): .github/workflows/release-plugin-zips.yml builds this zip on
 * `release: published` (or manually via workflow_dispatch) and attaches it to the release
 * assets, the same way dist/<expert-name>.zip is attached. The asset name is version-free —
 * the connector version lives in connector-meta.json, so the zip URL stays stable across
 * releases.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONNECTOR_DIR = path.join(ROOT, "connectors", "cloudbase-intl");
const SKILLS_DIR = path.join(CONNECTOR_DIR, "skills");
const EXTRA_DIR = path.join(CONNECTOR_DIR, "extra");
const DIST_DIR = path.join(ROOT, "dist");

const META_FILE = path.join(CONNECTOR_DIR, "connector-meta.json");
const MCP_FILE = path.join(CONNECTOR_DIR, "mcp.json");
const ICON_FILE = path.join(CONNECTOR_DIR, "icon.svg");

/** Files that go into the reviewable submission package. */
const PACKAGE_ENTRIES = ["connector-meta.json", "mcp.json", "icon.svg", "skills"];

// Marketplace-side fields. They are NOT part of connector-meta.json (the documented meta
// field list has neither `id` nor `visible_in`), so they cannot ride along in the zip and
// must be registered by the submitter. Kept here so the build can restate them verbatim.
const MARKETPLACE_FIELDS = [
  'id         = "cloudbase-intl"',
  'visible_in = ["internal", "iOA", "cloudhosted", "selfhosted"]',
];

/**
 * China-site host -> international-site host.
 *
 * Every target below was verified reachable before being wired in:
 *   tcb.tencentcloud.com          — MCP auth redirect lands here (verified 2026-09-17)
 *   api.intl.tcloudbasegateway.com — mcp/src/utils/site-map.ts (verified source of truth)
 *   tcb.intl.tencentcloudapi.com  — Tencent Cloud `intl` endpoint resolution (verified 2026-09-17)
 *   scf.intl / tcr.intl           — DNS + HTTPS 200 (verified 2026-09-17)
 * Lookbehinds keep already-correct `intl` hosts from being rewritten twice.
 */
const HOST_REWRITES = [
  {
    name: "console / dev platform",
    from: /tcb\.cloud\.tencent\.com/g,
    to: "tcb.tencentcloud.com",
  },
  {
    name: "control-plane API host",
    from: /(?<!intl\.)tcb\.tencentcloudapi\.com/g,
    to: "tcb.intl.tencentcloudapi.com",
  },
  {
    name: "cloud functions API host",
    from: /(?<!intl\.)scf\.tencentcloudapi\.com/g,
    to: "scf.intl.tencentcloudapi.com",
  },
  {
    name: "container registry API host",
    from: /(?<!intl\.)tcr\.tencentcloudapi\.com/g,
    to: "tcr.intl.tencentcloudapi.com",
  },
  {
    name: "data-plane gateway",
    from: /(?<!intl\.)api\.tcloudbasegateway\.com/g,
    to: "api.intl.tcloudbasegateway.com",
  },
];

/**
 * Lines where the China-site host is stated as a *fact* rather than used as a link.
 * The CAM one-click authorization link encodes the China-site carrier
 * (`{"service":"tcb.cloud.tencent.com"}`) into `principal`, so rewriting only the host
 * would produce a broken link. Leave these untouched and report them for manual follow-up.
 */
const SKIP_REWRITE_LINE = /QcsRole|principal=|eyJzZXJ2aWNlIjoidGNi/;

/** Hosts that must not survive the rewrite (checked over non-skipped lines). */
const DOMESTIC_GUARD = HOST_REWRITES.map((r) => ({
  name: r.name,
  pattern: new RegExp(r.from.source),
}));

/** Known China-site references we deliberately keep; reported so drift stays visible. */
const RESIDUAL_REPORT = [
  {
    name: "CAM / API Explorer / product pages on console.cloud.tencent.com",
    pattern: /console\.cloud\.tencent\.com/g,
  },
  {
    name: "AI Token Credits purchase link on buy.cloud.tencent.com",
    pattern: /buy\.cloud\.tencent\.com/g,
  },
];

const INTl_POINTER_SECTION = `## International site (intl) — read first

This connector is bound to the CloudBase **international** site, whose accounts, environments,
and billing are separate from the China site. Before acting, read
\`references/international-site.md\` for the international console and gateway hosts, the
region to use, OAuth sign-in behaviour, and the capabilities that this site does not have.

`;

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function parseJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${path.relative(ROOT, file)} is not valid JSON: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Aggregate the skill from config/source/** using the existing toolkit builder
// ---------------------------------------------------------------------------
function buildAggregateSkill() {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "cloudbase-intl-skill-"));
  console.log("1/5  Aggregating skill from config/source/** …");
  execFileSync(
    path.join(ROOT, "node_modules", ".bin", "tsx"),
    [path.join(ROOT, "scripts", "build-allinone-skill.ts"), "--dir", staging],
    { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] },
  );
  const produced = path.join(staging, "cloudbase");
  if (!fs.existsSync(path.join(produced, "SKILL.md"))) {
    fail(`build-allinone-skill.ts did not produce ${produced}/SKILL.md`);
  }
  return { staging, produced };
}

// ---------------------------------------------------------------------------
// 2. Rewrite China-site hosts to international-site hosts
// ---------------------------------------------------------------------------
function rewriteHosts() {
  const tally = new Map();
  const skippedLines = [];
  let filesChanged = 0;

  for (const file of walk(SKILLS_DIR)) {
    if (!/\.(md|yaml|yml|json)$/.test(file)) continue;
    const original = fs.readFileSync(file, "utf8");
    const lines = original.split("\n");
    let fileChanged = false;

    const rewritten = lines.map((line, index) => {
      if (SKIP_REWRITE_LINE.test(line)) {
        for (const rule of HOST_REWRITES) {
          const hits = line.match(rule.from);
          if (hits) {
            tally.set(rule.name, tally.get(rule.name) ?? 0);
            skippedLines.push(
              `${path.relative(SKILLS_DIR, file)}:${index + 1} [${rule.name}] ${line.trim().slice(0, 120)}`,
            );
          }
        }
        return line;
      }
      let next = line;
      for (const rule of HOST_REWRITES) {
        next = next.replace(rule.from, () => {
          tally.set(rule.name, (tally.get(rule.name) ?? 0) + 1);
          return rule.to;
        });
      }
      if (next !== line) fileChanged = true;
      return next;
    });

    if (fileChanged) {
      fs.writeFileSync(file, rewritten.join("\n"));
      filesChanged += 1;
    }
  }

  console.log(`2/5  Rewrote China-site hosts in ${filesChanged} file(s):`);
  for (const rule of HOST_REWRITES) {
    console.log(`       ${String(tally.get(rule.name) ?? 0).padStart(4)}  ${rule.name}`);
  }
  if (skippedLines.length > 0) {
    console.log(`     Skipped ${skippedLines.length} line(s) that document the China-site value:`);
    for (const line of skippedLines) console.log(`       · ${line}`);
  }
  return { tally, skippedLines };
}

function assertNoDomesticResidue() {
  const offenders = [];
  for (const file of walk(SKILLS_DIR)) {
    if (!/\.(md|yaml|yml|json)$/.test(file)) continue;
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (SKIP_REWRITE_LINE.test(line)) return;
        for (const guard of DOMESTIC_GUARD) {
          if (guard.pattern.test(line)) {
            offenders.push(
              `${path.relative(SKILLS_DIR, file)}:${index + 1} [${guard.name}] ${line.trim().slice(0, 120)}`,
            );
          }
        }
      });
  }
  if (offenders.length > 0) {
    console.error("\n❌ China-site hosts survived the rewrite:");
    for (const line of offenders) console.error(`   ${line}`);
    fail("add the missing host to HOST_REWRITES, or document the exception in SKIP_REWRITE_LINE");
  }
}

function reportResiduals() {
  const counts = new Map();
  for (const file of walk(SKILLS_DIR)) {
    if (!/\.(md|yaml|yml|json)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const item of RESIDUAL_REPORT) {
      const hits = text.match(item.pattern);
      if (hits) counts.set(item.name, (counts.get(item.name) ?? 0) + hits.length);
    }
  }
  console.log("     Known China-site references kept for manual follow-up:");
  if (counts.size === 0) console.log("       (none)");
  for (const [name, count] of counts) console.log(`       ${String(count).padStart(4)}  ${name}`);
}

/**
 * Section-level fixes for content that a plain host rewrite would make self-contradictory.
 *
 * `http-api-cloudbase` documents the gateway in two region halves. Rewriting the domestic
 * half's host would leave a "Domestic Regions / ap-shanghai" heading above an international
 * URL, which teaches the wrong thing. This connector is pinned to the international site, so
 * the domestic half is dropped instead. Every anchor is asserted — if upstream restructures
 * the file, the build fails loudly rather than shipping a half-converted document.
 */
function applyContentTransforms() {
  const file = path.join(SKILLS_DIR, "references", "http-api-cloudbase", "SKILL.md");
  if (!fs.existsSync(file)) fail("references/http-api-cloudbase/SKILL.md is missing");
  let lines = fs.readFileSync(file, "utf8").split("\n");

  const indexOf = (needle) => {
    const found = lines
      .map((line, index) => (line === needle ? index : -1))
      .filter((index) => index !== -1);
    if (found.length !== 1) {
      fail(
        `expected exactly one "${needle}" line in http-api-cloudbase/SKILL.md, found ${found.length}. ` +
          "The upstream file changed shape — update applyContentTransforms() instead of guessing.",
      );
    }
    return found[0];
  };

  const domestic = indexOf("### Domestic Regions");
  const international = indexOf("### International Regions");
  if (domestic > international) {
    fail("http-api-cloudbase/SKILL.md has the region sections in an unexpected order");
  }
  const removed = international - domestic;
  lines.splice(domestic, removed);
  console.log(`     Dropped the domestic-region half of http-api-cloudbase (${removed} line(s))`);

  let text = lines.join("\n");

  const pinInternational = (from, to) => {
    const hits = text.split(from).length - 1;
    if (hits !== 1) {
      fail(
        `expected exactly one occurrence of ${JSON.stringify(from.slice(0, 60))} in ` +
          `http-api-cloudbase/SKILL.md, found ${hits}. Update applyContentTransforms().`,
      );
    }
    text = text.replace(from, to);
  };

  pinInternational(
    "For environments in **international regions** like Singapore (`ap-singapore`), use:",
    "For environments in the international site region, Singapore (`ap-singapore`), use:",
  );
  pinInternational(
    "   - Use the correct domain based on region (domestic vs. international).\n" +
      "   - Default is domestic Shanghai region.",
    "   - This connector targets the international site only; always use the international gateway domain below.\n" +
      "   - The region is Singapore (`ap-singapore`).",
  );

  fs.writeFileSync(file, text);
}

/**
 * Consistency guard: a line that names a China-site region and a site-specific host at the
 * same time is a contradiction signature — it means a rewrite landed without its context.
 */
function assertNoRegionHostContradictions() {
  const offenders = [];
  for (const file of walk(SKILLS_DIR)) {
    if (!file.endsWith(".md")) continue;
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (/ap-shanghai|ap-guangzhou/.test(line) && /tcloudbasegateway|tcb\.tencentcloud\.com|tencentcloudapi\.com/.test(line)) {
          offenders.push(
            `${path.relative(SKILLS_DIR, file)}:${index + 1} ${line.trim().slice(0, 140)}`,
          );
        }
      });
  }
  if (offenders.length > 0) {
    console.error("\n❌ Region and host contradict each other after rewriting:");
    for (const line of offenders) console.error(`   ${line}`);
    fail("add a content transform for these lines instead of rewriting the host alone");
  }
}

// ---------------------------------------------------------------------------
// 3. Add intl-specific references and point SKILL.md at them
// ---------------------------------------------------------------------------
function addExtraReferences() {
  const referencesDir = path.join(SKILLS_DIR, "references");
  if (!fs.existsSync(referencesDir)) fail("skills/references/ is missing after aggregation");

  const extras = fs.existsSync(EXTRA_DIR)
    ? fs.readdirSync(EXTRA_DIR).filter((name) => name.endsWith(".md"))
    : [];
  if (extras.length === 0) fail(`no markdown files found in ${path.relative(ROOT, EXTRA_DIR)}`);

  for (const name of extras) {
    fs.copyFileSync(path.join(EXTRA_DIR, name), path.join(referencesDir, name));
    console.log(`3/5  Added skills/references/${name}`);
  }

  const skillFile = path.join(SKILLS_DIR, "SKILL.md");
  const content = fs.readFileSync(skillFile, "utf8");
  const anchors = (content.match(/^## Workflow$/gm) ?? []).length;
  if (anchors !== 1) {
    fail(
      `expected exactly one "## Workflow" anchor in the generated SKILL.md, found ${anchors}. ` +
        "The upstream entry file changed shape — update this script instead of guessing.",
    );
  }
  if (content.includes("references/international-site.md")) return;

  fs.writeFileSync(
    skillFile,
    content.replace(/^## Workflow$/m, `${INTl_POINTER_SECTION}## Workflow`),
  );
  console.log("     Injected the international-site pointer into skills/SKILL.md");
}

// ---------------------------------------------------------------------------
// 4. Validate the package
// ---------------------------------------------------------------------------
function validate() {
  console.log("4/5  Validating …");
  const meta = parseJson(META_FILE);
  const mcp = parseJson(MCP_FILE);

  const required = ["name", "name_en", "description", "description_en", "source", "examples_zh", "examples_en"];
  for (const key of required) {
    if (!meta[key] || (Array.isArray(meta[key]) && meta[key].length === 0)) {
      fail(`connector-meta.json is missing required field "${key}"`);
    }
  }
  if (meta.source !== "cloudbase-intl") {
    fail(`connector-meta.json source must be "cloudbase-intl", found "${meta.source}"`);
  }
  if (meta.type && meta.type !== "mcp") {
    fail(`connector-meta.json type must be "mcp" for this connector, found "${meta.type}"`);
  }
  if (meta.auth_mode) {
    fail('connector-meta.json must not set auth_mode — this connector uses the standard MCP OAuth flow');
  }
  if (!meta.minWorkbuddyVersion) {
    fail("connector-meta.json must declare minWorkbuddyVersion (examples_zh/examples_en need 4.24.0)");
  }

  const servers = Object.keys(mcp.mcpServers ?? {});
  if (servers.length !== 1) fail(`mcp.json must configure exactly one server, found ${servers.length}`);
  const server = mcp.mcpServers[servers[0]];
  if (server.type !== "streamableHttp") {
    fail(`mcp.json server type must be "streamableHttp", found "${server.type}"`);
  }
  if (!/^https:\/\//.test(server.url ?? "")) fail("mcp.json url must use HTTPS");
  if (new URL(server.url).host !== "tcb-api.tencentcloud.com") {
    fail(`mcp.json url must point at the international endpoint, found "${server.url}"`);
  }
  if (mcp.preAuth) fail("mcp.json must not set preAuth — there is no CLI in this connector");

  if (!fs.existsSync(path.join(SKILLS_DIR, "SKILL.md"))) fail("skills/SKILL.md is missing");
  if (!fs.existsSync(path.join(SKILLS_DIR, "references", "international-site.md"))) {
    fail("skills/references/international-site.md is missing");
  }
  if (!fs.existsSync(ICON_FILE)) fail("icon.svg is missing");

  const SECRET_PATTERNS = [
    /AKID[A-Za-z0-9]{12,}/,
    /secret(?:id|key)\s*[:=]\s*["'][A-Za-z0-9/+=]{16,}["']/i,
    /X-TencentCloud-SecretId["']?\s*[:=]\s*["']?[A-Za-z0-9]{16,}/i,
  ];
  const secretHits = [];
  for (const file of walk(CONNECTOR_DIR)) {
    if (!/\.(json|md|yaml|yml|svg)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) secretHits.push(path.relative(CONNECTOR_DIR, file));
    }
  }
  if (secretHits.length > 0) {
    fail(`possible hardcoded credentials in: ${[...new Set(secretHits)].join(", ")}`);
  }

  const referenceCount = fs
    .readdirSync(path.join(SKILLS_DIR, "references"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length;
  console.log(`     ✓ source=${meta.source} type=mcp, single HTTPS server, no auth_mode, no secrets`);
  console.log(`     ✓ ${referenceCount} bundled skill references + ${fs.readdirSync(EXTRA_DIR).length} intl reference(s)`);
  return meta;
}

// ---------------------------------------------------------------------------
// 5. Package the submittable files
// ---------------------------------------------------------------------------
function packageConnector(meta) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  // Version-free asset name, matching cloudbase-kimi.zip / cloudbase-qoder.zip /
  // dist/<expert-name>.zip: the version travels inside connector-meta.json, so the
  // download URL stays stable while the package version moves.
  const zipPath = path.join(DIST_DIR, "cloudbase-intl-connector.zip");
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  execFileSync("zip", ["-r", "-X", "-q", zipPath, ...PACKAGE_ENTRIES], { cwd: CONNECTOR_DIR });
  const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
  console.log(`5/5  Packaged ${path.relative(ROOT, zipPath)} (${size} MB)`);
  console.log(`     Contents: ${PACKAGE_ENTRIES.join(", ")} (SUBMISSION.md and extra/ excluded)`);
  console.log(`     Package version: ${meta.version ?? "(not set)"}`);
  // `id` / `visible_in` live in WorkBuddy's marketplace config, not in connector-meta.json
  // (they are absent from the documented meta field list). Echo them on every build so the
  // values to register by hand can never drift out of sight.
  console.log("     Register in the marketplace config at submission time:");
  for (const line of MARKETPLACE_FIELDS) console.log(`       ${line}`);
}

function main() {
  console.log("\n📦 Building the cloudbase-intl connector package\n");
  const { staging, produced } = buildAggregateSkill();

  fs.rmSync(SKILLS_DIR, { recursive: true, force: true });
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.cpSync(produced, SKILLS_DIR, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });

  rewriteHosts();
  applyContentTransforms();
  // The guards below run on the aggregated corpus only, before extra/ is copied in.
  // That ordering is deliberate: extra/international-site.md names the China-site hosts
  // in a "never use" column, which would otherwise trip the residue guard.
  assertNoDomesticResidue();
  assertNoRegionHostContradictions();
  reportResiduals();
  addExtraReferences();
  const meta = validate();
  packageConnector(meta);
  console.log("\n✨ Done.\n");
}

main();
