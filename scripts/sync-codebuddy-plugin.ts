#!/usr/bin/env npx tsx
/**
 * Sync the generated all-in-one CloudBase skill into config/codebuddy-plugin,
 * plus any top-level skills that must be Skill()-addressable by id
 * (e.g. minimal-web-baas-demo for WorkBuddy expert Step0 before Trust).
 *
 * Usage:
 *   npx tsx scripts/sync-codebuddy-plugin.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildAllInOneSkill } from './build-allinone-skill.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SKILLS_ROOT = path.join(ROOT, 'config', 'codebuddy-plugin', 'skills');
const DEFAULT_DEST = path.join(DEFAULT_SKILLS_ROOT, 'cloudbase');
const SOURCE_SKILLS_DIR = path.join(ROOT, 'config', 'source', 'skills');

/**
 * Skills that must also be published as top-level plugin skills so hosts
 * that resolve Skill("<name>") (WorkBuddy / CodeBuddy) can load them without
 * digging into cloudbase/references/. Keep in sync with plugin.json "skills".
 */
export const TOP_LEVEL_SKILL_IDS = ['minimal-web-baas-demo'] as const;

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function countFiles(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    count += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return count;
}

function syncTopLevelSkills(skillsRoot: string): string[] {
  const synced: string[] = [];
  for (const skillId of TOP_LEVEL_SKILL_IDS) {
    const src = path.join(SOURCE_SKILLS_DIR, skillId);
    const entry = path.join(src, 'SKILL.md');
    if (!fs.existsSync(entry)) {
      throw new Error(`Missing top-level skill source: ${entry}`);
    }
    const dest = path.join(skillsRoot, skillId);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    copyDir(src, dest);
    synced.push(skillId);
  }
  return synced;
}

export function syncCodeBuddyPlugin(options: {
  destinationDir?: string;
  skillsRootDir?: string;
  tempRootDir?: string;
} = {}): {
  sourceDir: string;
  destinationDir: string;
  fileCount: number;
  topLevelSkills: string[];
} {
  const destinationDir = options.destinationDir || DEFAULT_DEST;
  const skillsRootDir =
    options.skillsRootDir || path.dirname(destinationDir);
  const tempRootDir = options.tempRootDir || fs.mkdtempSync(
    path.join(os.tmpdir(), 'cloudbase-codebuddy-plugin-'),
  );
  const shouldCleanupTemp = !options.tempRootDir;

  try {
    const buildResult = buildAllInOneSkill(tempRootDir);
    const sourceDir = buildResult.outputDir;

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Generated all-in-one skill not found: ${sourceDir}`);
    }

    if (fs.existsSync(destinationDir)) {
      fs.rmSync(destinationDir, { recursive: true, force: true });
    }

    copyDir(sourceDir, destinationDir);

    const topLevelSkills = syncTopLevelSkills(skillsRootDir);

    let fileCount = countFiles(destinationDir);
    for (const skillId of topLevelSkills) {
      fileCount += countFiles(path.join(skillsRootDir, skillId));
    }

    return {
      sourceDir,
      destinationDir,
      fileCount,
      topLevelSkills,
    };
  } finally {
    if (shouldCleanupTemp) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
  }
}

function main(): void {
  const result = syncCodeBuddyPlugin();
  console.log(`SRC : ${result.sourceDir}`);
  console.log(`DEST: ${result.destinationDir}`);
  console.log(`TOP : ${result.topLevelSkills.join(', ') || '(none)'}`);
  console.log(`Done: ${result.fileCount} files copied`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
