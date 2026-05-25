import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, "..");
export const GENERATED_CONFIG_DIR = path.join(ROOT_DIR, ".generated", "compat-config");
export const BASELINE_FILE = path.join(
  ROOT_DIR,
  "config",
  "source",
  "editor-config",
  "compat-baseline.json",
);

const STRICT_HASH_EXTENSIONS = new Set([".json", ".toml"]);
const TEXT_SURFACE_EXTENSIONS = new Set([".md", ".mdc", ".mdr"]);

export const COMPAT_SURFACE_GROUPS = {
  machine: {
    description:
      "Machine-consumable configuration files. Missing, extra, or content drift blocks CI.",
    existenceMode: "blocking",
    hashMode: "blocking",
  },
  textSurface: {
    description:
      "Prompt, guideline, and skill text mirrors. Missing or extra files block CI; content drift is advisory only.",
    existenceMode: "blocking",
    hashMode: "report",
  },
};

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function getTopLevelRoot(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const separatorIndex = normalized.indexOf("/");
  return separatorIndex === -1 ? normalized : normalized.slice(0, separatorIndex);
}

export function shouldSkip(name) {
  return name === ".DS_Store";
}

export function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function collectFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files = [];

  const walk = (relativeDir = "") => {
    const fullDir = relativeDir ? path.join(rootDir, relativeDir) : rootDir;
    for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
      if (shouldSkip(entry.name)) {
        continue;
      }

      const relativePath = normalizeRelativePath(
        relativeDir ? path.join(relativeDir, entry.name) : entry.name,
      );
      const fullPath = path.join(rootDir, relativePath);

      if (entry.isDirectory()) {
        walk(relativePath);
        continue;
      }

      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  };

  walk();
  return files.sort();
}

export function classifyGeneratedFile(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const extension = path.extname(normalized);

  if (STRICT_HASH_EXTENSIONS.has(extension)) {
    return "machine";
  }

  if (TEXT_SURFACE_EXTENSIONS.has(extension) || normalized === ".augment-guidelines") {
    return "textSurface";
  }

  throw new Error(`Unsupported compat artifact type: ${normalized}`);
}

export function buildCompatBaselineManifest(rootDir = GENERATED_CONFIG_DIR) {
  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    groups: Object.fromEntries(
      Object.entries(COMPAT_SURFACE_GROUPS).map(([groupName, groupConfig]) => [
        groupName,
        {
          description: groupConfig.description,
          existenceMode: groupConfig.existenceMode,
          hashMode: groupConfig.hashMode,
          roots: [],
          files: {},
        },
      ]),
    ),
  };

  const rootSets = Object.fromEntries(
    Object.keys(COMPAT_SURFACE_GROUPS).map((groupName) => [groupName, new Set()]),
  );

  for (const relativePath of collectFiles(rootDir)) {
    const groupName = classifyGeneratedFile(relativePath);
    manifest.groups[groupName].files[relativePath] = sha256(path.join(rootDir, relativePath));
    rootSets[groupName].add(getTopLevelRoot(relativePath));
  }

  for (const [groupName, rootSet] of Object.entries(rootSets)) {
    manifest.groups[groupName].roots = [...rootSet].sort();
  }

  return manifest;
}

export function loadCompatBaseline(filePath = BASELINE_FILE) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Compat baseline not found: ${filePath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (manifest.version !== 2 || !manifest.groups) {
    throw new Error(
      `Unsupported compat baseline format in ${filePath}. Run "npm run update:compat-baseline" to regenerate it with the current schema.`,
    );
  }

  for (const groupName of Object.keys(COMPAT_SURFACE_GROUPS)) {
    const group = manifest.groups[groupName];
    if (!group || !group.files || Array.isArray(group.files)) {
      throw new Error(
        `Compat baseline group "${groupName}" is missing or invalid in ${filePath}. Run "npm run update:compat-baseline" to regenerate it.`,
      );
    }
  }

  return manifest;
}

export function compareCompatBaseline(manifest, rootDir = GENERATED_CONFIG_DIR) {
  const generatedFiles = collectFiles(rootDir);
  const generatedByGroup = Object.fromEntries(
    Object.keys(COMPAT_SURFACE_GROUPS).map((groupName) => [groupName, []]),
  );
  const generatedHashes = new Map();
  const unclassifiedGenerated = [];

  for (const relativePath of generatedFiles) {
    try {
      const groupName = classifyGeneratedFile(relativePath);
      generatedByGroup[groupName].push(relativePath);
      generatedHashes.set(relativePath, sha256(path.join(rootDir, relativePath)));
    } catch {
      unclassifiedGenerated.push(relativePath);
    }
  }

  const groups = {};
  let hasBlockingDiff = unclassifiedGenerated.length > 0;
  let hasAdvisoryDiff = false;

  for (const [groupName, groupConfig] of Object.entries(COMPAT_SURFACE_GROUPS)) {
    const expectedFiles = Object.keys(manifest.groups[groupName].files).sort();
    const expectedSet = new Set(expectedFiles);
    const generatedGroupFiles = generatedByGroup[groupName].sort();
    const generatedSet = new Set(generatedGroupFiles);

    const missing = expectedFiles.filter((file) => !generatedSet.has(file));
    const extra = generatedGroupFiles.filter((file) => !expectedSet.has(file));
    const changed = expectedFiles.filter((file) => {
      if (!generatedSet.has(file)) {
        return false;
      }
      return manifest.groups[groupName].files[file] !== generatedHashes.get(file);
    });

    const blockingMissing = groupConfig.existenceMode === "blocking" ? missing : [];
    const blockingExtra = groupConfig.existenceMode === "blocking" ? extra : [];
    const blockingChanged = groupConfig.hashMode === "blocking" ? changed : [];

    const advisoryMissing = groupConfig.existenceMode === "report" ? missing : [];
    const advisoryExtra = groupConfig.existenceMode === "report" ? extra : [];
    const advisoryChanged = groupConfig.hashMode === "report" ? changed : [];

    if (
      blockingMissing.length > 0 ||
      blockingExtra.length > 0 ||
      blockingChanged.length > 0
    ) {
      hasBlockingDiff = true;
    }

    if (
      advisoryMissing.length > 0 ||
      advisoryExtra.length > 0 ||
      advisoryChanged.length > 0
    ) {
      hasAdvisoryDiff = true;
    }

    groups[groupName] = {
      ...groupConfig,
      roots: manifest.groups[groupName].roots ?? [],
      expectedCount: expectedFiles.length,
      generatedCount: generatedGroupFiles.length,
      missing,
      extra,
      changed,
      blockingMissing,
      blockingExtra,
      blockingChanged,
      advisoryMissing,
      advisoryExtra,
      advisoryChanged,
    };
  }

  return {
    version: manifest.version,
    groupCount: Object.keys(groups).length,
    generatedCount: generatedFiles.length,
    groups,
    unclassifiedGenerated,
    hasBlockingDiff,
    hasAdvisoryDiff,
  };
}
