// hooks/session-start-profiler.mjs — CloudBase project type profiler
// Detects CloudBase projects, identifies scenario (Web/Mini Program/CloudRun/Database),
// sets env vars for downstream hooks. Adapted from Vercel's session-start-profiler.
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { createLogger } from "./logger.mjs";
import { normalizeInput, setSessionEnv, formatOutput } from "./compat.mjs";
import {
  hasActivationMarkers,
  isGreenfieldDirectory,
  CLOUDBASE_PACKAGES,
} from "./session-start-activation.mjs";

var log = createLogger();

// File markers that map to skills
var FILE_MARKERS = [
  { file: "project.config.json", scenario: "miniprogram", skills: ["miniprogram-development", "auth-wechat", "no-sql-wx-mp-sdk", "cloudbase-platform"] },
  { file: "app.json", scenario: "miniprogram", skills: ["miniprogram-development", "auth-wechat", "no-sql-wx-mp-sdk", "cloudbase-platform"] },
  { file: "cloudbaserc.json", scenario: "web", skills: ["web-development", "cloudbase-platform"] },
  { file: "Dockerfile", scenario: "cloudrun", skills: ["cloudrun-development", "cloud-functions", "cloudbase-platform"] },
  { file: "cloudfunctions", scenario: "cloudrun", skills: ["cloud-functions", "cloudbase-platform"] },
  { file: "prisma/schema.prisma", scenario: "database", skills: ["data-model-creation", "relational-database-tool", "cloudbase-platform"] },
  { file: "drizzle.config.ts", scenario: "database", skills: ["data-model-creation", "relational-database-tool", "cloudbase-platform"] },
  { file: "drizzle.config.js", scenario: "database", skills: ["data-model-creation", "relational-database-tool", "cloudbase-platform"] },
];

// package.json dependency markers (for scenario detection)
var PACKAGE_MARKERS = {
  react: { scenario: "web", skills: ["web-development", "auth-web", "no-sql-web-sdk", "cloudbase-platform"] },
  vue: { scenario: "web", skills: ["web-development", "auth-web", "no-sql-web-sdk", "cloudbase-platform"] },
  vite: { scenario: "web", skills: ["web-development", "cloudbase-platform"] },
  next: { scenario: "web", skills: ["web-development", "auth-web", "no-sql-web-sdk", "cloudbase-platform"] },
  "@cloudbase/js-sdk": { scenario: "web", skills: ["web-development", "auth-web", "no-sql-web-sdk", "cloud-storage-web", "cloudbase-platform"] },
  "@cloudbase/node-sdk": { scenario: "cloudrun", skills: ["cloudrun-development", "cloud-functions", "auth-nodejs", "cloudbase-platform"] },
  "wx-server-sdk": { scenario: "miniprogram", skills: ["cloud-functions", "auth-wechat", "no-sql-wx-mp-sdk", "cloudbase-platform"] },
  "@cloudbase/wx-cloud-sdk": { scenario: "miniprogram", skills: ["miniprogram-development", "auth-wechat", "no-sql-wx-mp-sdk", "cloudbase-platform"] },
};

function readPackageJson(projectRoot) {
  try {
    return JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8"));
  } catch {
    return null;
  }
}

function detectScenarioFromPackage(projectRoot) {
  const pkg = readPackageJson(projectRoot);
  if (!pkg) return null;
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const dep of CLOUDBASE_PACKAGES) {
    if (dep in allDeps) {
      const marker = PACKAGE_MARKERS[dep];
      if (marker) return marker;
    }
  }
  // Check for react/vue + vite combo
  const hasReact = "react" in allDeps;
  const hasVue = "vue" in allDeps;
  const hasVite = "vite" in allDeps;
  const hasWebpack = "webpack" in allDeps;
  if ((hasReact || hasVue) && (hasVite || hasWebpack)) {
    return PACKAGE_MARKERS[hasReact ? "react" : "vue"];
  }
  return null;
}

function detectScenario(projectRoot) {
  // Priority 1: File markers (most specific)
  for (const marker of FILE_MARKERS) {
    if (existsSync(join(projectRoot, marker.file))) {
      return { scenario: marker.scenario, skills: marker.skills };
    }
  }
  // Priority 2: Package.json dependency markers
  const pkgMarker = detectScenarioFromPackage(projectRoot);
  if (pkgMarker) {
    return { scenario: pkgMarker.scenario, skills: pkgMarker.skills };
  }
  // No match
  return { scenario: "none", skills: [] };
}

function profileBootstrapSignals(projectRoot) {
  const hints = [];
  if (existsSync(join(projectRoot, ".env.example")) || existsSync(join(projectRoot, ".env.sample")) || existsSync(join(projectRoot, ".env.template"))) {
    hints.push("env-example");
  }
  if (existsSync(join(projectRoot, "README.md")) || existsSync(join(projectRoot, "README.MD")) || existsSync(join(projectRoot, "README"))) {
    hints.push("readme");
  }
  if (existsSync(join(projectRoot, "prisma", "schema.prisma"))) {
    hints.push("prisma-schema");
    hints.push("database");
  }
  if (existsSync(join(projectRoot, "drizzle.config.ts")) || existsSync(join(projectRoot, "drizzle.config.js"))) {
    hints.push("drizzle-config");
    hints.push("database");
  }
  return hints;
}

function main() {
  const input = normalizeInput(JSON.parse(readFileSync(0, "utf-8") || "{}"));
  const platform = input.platform;
  const projectRoot = input.cwd || process.cwd();
  const isGreenfield = isGreenfieldDirectory(projectRoot);
  const shouldActivate = isGreenfield || hasActivationMarkers(projectRoot);

  log.debug("profiler:start", { projectRoot, isGreenfield, shouldActivate });

  if (!shouldActivate) {
    // Non-CloudBase project — emit empty output (no env vars, no context)
    log.debug("profiler:skip-non-cloudbase", { projectRoot });
    process.stdout.write(JSON.stringify(formatOutput(platform, {})));
    return;
  }

  // Detect scenario
  const { scenario, skills } = isGreenfield
    ? { scenario: "greenfield", skills: ["cloudbase-guidelines", "web-development", "cloudbase-platform"] }
    : detectScenario(projectRoot);

  // Profile bootstrap signals
  const bootstrapHints = profileBootstrapSignals(projectRoot);
  const setupMode = bootstrapHints.length >= 3 ? "1" : "0";

  // Set env vars (Claude Code: via CLAUDE_ENV_FILE; Cursor: via output env)
  setSessionEnv(platform, "CLOUDBASE_PLUGIN_SCENARIO", scenario);
  setSessionEnv(platform, "CLOUDBASE_PLUGIN_LIKELY_SKILLS", skills.join(","));
  setSessionEnv(platform, "CLOUDBASE_PLUGIN_GREENFIELD", isGreenfield ? "true" : "false");
  setSessionEnv(platform, "CLOUDBASE_PLUGIN_SETUP_MODE", setupMode);
  if (bootstrapHints.length > 0) {
    setSessionEnv(platform, "CLOUDBASE_PLUGIN_BOOTSTRAP_HINTS", bootstrapHints.join(","));
  }

  log.summary("profiler:complete", {
    scenario,
    likelySkills: skills,
    isGreenfield,
    setupMode,
    bootstrapHints,
  });

  // Emit env-only output (no additionalContext here — inject-session-context.mjs handles that)
  process.stdout.write(JSON.stringify(formatOutput(platform, {})));
}

main();
