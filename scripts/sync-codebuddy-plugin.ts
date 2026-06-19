#!/usr/bin/env npx tsx
/**
 * Sync the generated all-in-one CloudBase skill into config/codebuddy-plugin.
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
const DEFAULT_DEST = path.join(
  ROOT,
  'config',
  'codebuddy-plugin',
  'skills',
  'cloudbase',
);

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

export function syncCodeBuddyPlugin(options: {
  destinationDir?: string;
  tempRootDir?: string;
} = {}): { sourceDir: string; destinationDir: string; fileCount: number } {
  const destinationDir = options.destinationDir || DEFAULT_DEST;
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

    return {
      sourceDir,
      destinationDir,
      fileCount: countFiles(destinationDir),
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
  console.log(`Done: ${result.fileCount} files copied`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
