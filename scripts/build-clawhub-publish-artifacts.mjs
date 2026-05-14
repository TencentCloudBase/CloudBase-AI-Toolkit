#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import {
  resolvePublishTargets,
} from "./clawhub-publish-targets.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  let targets = "";
  let outputDir = path.join(projectRoot, ".clawhub-publish-output");

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--targets") {
      targets = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      outputDir = path.resolve(argv[index + 1] || outputDir);
      index += 1;
      continue;
    }
  }

  return { targets, outputDir };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function copyDirectoryRecursive(srcDir, destDir) {
  ensureDir(destDir);

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function parseFrontmatter(skillContent) {
  const frontmatterMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    throw new Error("SKILL.md 缺少 frontmatter / SKILL.md is missing frontmatter");
  }

  const frontmatter = frontmatterMatch[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!nameMatch || !nameMatch[1].trim()) {
    throw new Error("SKILL.md frontmatter 缺少 name / SKILL.md frontmatter is missing name");
  }

  if (!descriptionMatch || !descriptionMatch[1].trim()) {
    throw new Error("SKILL.md frontmatter 缺少 description / SKILL.md frontmatter is missing description");
  }

  return {
    name: nameMatch[1].trim(),
    description: descriptionMatch[1].trim(),
  };
}

function replaceFrontmatterField(skillContent, fieldName, nextValue) {
  const frontmatterMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    throw new Error("SKILL.md 缺少 frontmatter / SKILL.md is missing frontmatter");
  }

  const frontmatter = frontmatterMatch[1];
  const fieldPattern = new RegExp(`^${fieldName}:\\s*.+$`, "m");

  if (!fieldPattern.test(frontmatter)) {
    throw new Error(
      `SKILL.md frontmatter 缺少 ${fieldName} / SKILL.md frontmatter is missing ${fieldName}`,
    );
  }

  const nextFrontmatter = frontmatter.replace(
    fieldPattern,
    `${fieldName}: ${nextValue}`,
  );

  return skillContent.replace(frontmatterMatch[0], `---\n${nextFrontmatter}\n---`);
}

function validateArtifactDir(targetKey, artifactDir) {
  const skillFile = path.join(artifactDir, "SKILL.md");

  if (!fs.existsSync(skillFile)) {
    throw new Error(`${targetKey}: 在 ${artifactDir} 中缺少 SKILL.md / missing SKILL.md in ${artifactDir}`);
  }

  const metadata = parseFrontmatter(fs.readFileSync(skillFile, "utf8"));

  return {
    skillFile,
    metadata,
  };
}

function buildLocalSkillTarget(target, destinationDir) {
  if (!fs.existsSync(target.sourceDir)) {
    throw new Error(
      `${target.key}: 源目录不存在 / source directory does not exist: ${target.sourceDir}`,
    );
  }

  copyDirectoryRecursive(target.sourceDir, destinationDir);

  if (target.publishName) {
    const skillFile = path.join(destinationDir, "SKILL.md");
    const raw = fs.readFileSync(skillFile, "utf8");
    const rewritten = replaceFrontmatterField(raw, "name", target.publishName);
    fs.writeFileSync(skillFile, rewritten, "utf8");
  }

  return {
    sourceDir: target.sourceDir,
  };
}

function buildAllInOneTarget(target, destinationDir) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawhub-allinone-"));

  try {
    const tsxPath = path.join(projectRoot, "node_modules/.bin/tsx");
    execFileSync(
      tsxPath,
      ["scripts/build-allinone-skill.ts", "--dir", tempRoot],
      {
        cwd: projectRoot,
        stdio: "pipe",
      },
    );

    const generatedDir = path.join(tempRoot, target.registrySlug);
    if (!fs.existsSync(generatedDir)) {
      throw new Error(
        `${target.key}: 未找到预期生成目录 / expected generated directory not found: ${generatedDir}`,
      );
    }

    copyDirectoryRecursive(generatedDir, destinationDir);

    return {
      sourceDir: generatedDir,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function buildTargetArtifact(target, outputDir) {
  const artifactRootDir = path.join(outputDir, target.key);
  const artifactDir = path.join(artifactRootDir, "skills", target.registrySlug);
  ensureDir(artifactDir);

  let buildResult;
  if (target.type === "local-skill") {
    buildResult = buildLocalSkillTarget(target, artifactDir);
  } else if (target.type === "generated-allinone") {
    buildResult = buildAllInOneTarget(target, artifactDir);
  } else {
    throw new Error(`${target.key}: 不支持的发布目标类型 / unsupported target type ${target.type}`);
  }

  const validation = validateArtifactDir(target.key, artifactDir);

  return {
    targetKey: target.key,
    registrySlug: target.registrySlug,
    displayName: target.displayName || validation.metadata.name,
    artifactRootDir,
    artifactDir,
    sourceType: target.type,
    sourceDescription: target.sourceDescription,
    sourceDir: buildResult.sourceDir,
    metadata: validation.metadata,
  };
}

export function buildClawhubPublishArtifacts({ targets, outputDir }) {
  const resolvedTargets = resolvePublishTargets(targets);

  cleanDir(outputDir);

  const manifest = {
    generatedAt: new Date().toISOString(),
    outputDir,
    targets: resolvedTargets.map((target) => buildTargetArtifact(target, outputDir)),
  };

  fs.writeFileSync(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}

function main() {
  const { targets, outputDir } = parseArgs(process.argv.slice(2));
  const manifest = buildClawhubPublishArtifacts({ targets, outputDir });

  console.log(
    `已在 ${manifest.outputDir} 准备 ${manifest.targets.length} 个 ClawHub 发布产物 / Prepared ${manifest.targets.length} ClawHub publish artifact(s) in ${manifest.outputDir}`,
  );

  for (const target of manifest.targets) {
    console.log(
      `- ${target.targetKey} -> ${target.registrySlug} (${target.artifactDir})`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
