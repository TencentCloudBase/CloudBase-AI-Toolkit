// hooks/session-start-activation.mjs — CloudBase project activation detection
// Shared between session-start-profiler.mjs and inject-session-context.mjs
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Activation marker files (CloudBase project indicators)
export var ACTIVATION_MARKER_FILES = [
  "cloudbaserc.json",
  "tcb-config.json",
  "cloudbase.json",
  "project.config.json", // WeChat Mini Program
];

// package.json dependencies that signal CloudBase
export var CLOUDBASE_PACKAGES = [
  "@cloudbase/js-sdk",
  "@cloudbase/node-sdk",
  "@cloudbase/wx-cloud-sdk",
  "@cloudbase/cloudbase-mcp",
  "@cloudbase/manager-node",
  "@cloudbase/cloudrun",
  "wx-server-sdk", // Cloud Function runtime
];

function readPackageJson(projectRoot) {
  try {
    return JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8"));
  } catch {
    return null;
  }
}

export function packageJsonSignalsCloudbase(projectRoot) {
  const pkg = readPackageJson(projectRoot);
  if (!pkg) return null;
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const dep of CLOUDBASE_PACKAGES) {
    if (dep in allDeps) return true;
  }
  // Check scripts for tcb/cloudbase commands
  const scripts = pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  for (const value of Object.values(scripts)) {
    if (typeof value === "string" && /\btcb\b/.test(value)) return true;
  }
  // Check for react/vue + vite/webpack combo (potential Web project)
  const hasReact = "react" in allDeps;
  const hasVue = "vue" in allDeps;
  const hasVite = "vite" in allDeps;
  const hasWebpack = "webpack" in allDeps;
  if ((hasReact || hasVue) && (hasVite || hasWebpack)) return true;
  return false;
}

export function hasSessionStartActivationMarkers(projectRoot) {
  // Check marker files
  for (const file of ACTIVATION_MARKER_FILES) {
    if (existsSync(join(projectRoot, file))) return true;
  }
  // Check .cloudbase directory
  if (existsSync(join(projectRoot, ".cloudbase"))) {
    try {
      if (statSync(join(projectRoot, ".cloudbase")).isDirectory()) return true;
    } catch {}
  }
  // Check package.json signals
  if (packageJsonSignalsCloudbase(projectRoot)) return true;
  return false;
}

export function isGreenfieldDirectory(projectRoot) {
  let dirents;
  try {
    dirents = readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    return false;
  }
  // Exclude if has .cloudbase directory (already a CloudBase project)
  if (dirents.some((d) => d.name === ".cloudbase" && d.isDirectory())) return false;
  const hasNonDotDir = dirents.some((d) => !d.name.startsWith("."));
  const hasDotFile = dirents.some((d) => d.name.startsWith(".") && d.isFile());
  return !hasNonDotDir && !hasDotFile;
}

// Backwards-compat aliases
export var hasActivationMarkers = hasSessionStartActivationMarkers;
