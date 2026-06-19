#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeSkillName } from './lib/path-safety.mjs';

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const options = {
    input: '',
    subpath: '',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      options.input = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--subpath') {
      options.subpath = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
    }
  }

  if (!options.input) {
    throw new Error('Missing required --input');
  }

  return options;
}

function walkFiles(rootDir, currentDir = rootDir, result = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.DS_Store') {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, fullPath) || entry.name;
    if (entry.isDirectory()) {
      walkFiles(rootDir, fullPath, result);
    } else if (entry.isFile()) {
      result.push(relativePath.split(path.sep).join('/'));
    }
  }

  return result.sort();
}

function classifyFiles(files) {
  const references = [];
  const scripts = [];
  const assets = [];
  const warnings = [];

  for (const file of files) {
    const lower = file.toLowerCase();
    if (lower.endsWith('/skill.md') || lower === 'skill.md') {
      continue;
    }
    if (lower.endsWith('.mjs') || lower.endsWith('.js') || lower.endsWith('.sh') || lower.endsWith('.py')) {
      scripts.push(file);
      continue;
    }
    if (lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.txt')) {
      references.push(file);
      continue;
    }
    assets.push(file);
  }

  if (references.length === 0 && scripts.length === 0) {
    warnings.push('No obvious reference or script files were detected.');
  }

  return { references, scripts, assets, warnings };
}

export function inspectSource({ input, subpath = '' }) {
  const inputPath = path.resolve(input);
  const rootPath = subpath ? path.join(inputPath, subpath) : inputPath;

  if (!fs.existsSync(rootPath)) {
    throw new Error(`Input path not found: ${rootPath}`);
  }

  const allFiles = walkFiles(rootPath);
  const skillFiles = allFiles.filter((file) => path.basename(file).toLowerCase() === 'skill.md');
  const hasRootSkill = skillFiles.includes('SKILL.md');

  let sourceType = 'nonstandard';
  if (hasRootSkill && skillFiles.length === 1) {
    sourceType = 'standard';
  } else if (skillFiles.length > 0) {
    sourceType = hasRootSkill ? 'mixed' : 'mixed';
  }

  const candidateName = sanitizeSkillName(path.basename(rootPath));
  const grouped = classifyFiles(allFiles);

  return {
    sourceType,
    inputPath,
    rootPath,
    candidateSkillName: candidateName,
    skillEntryPath: hasRootSkill ? path.join(rootPath, 'SKILL.md') : null,
    detectedFiles: allFiles,
    suggestedReferences: grouped.references,
    suggestedScripts: grouped.scripts,
    suggestedAssets: grouped.assets,
    warnings: grouped.warnings,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = inspectSource(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  console.log(`Source type: ${result.sourceType}`);
  console.log(`Candidate skill: ${result.candidateSkillName}`);
  console.log(`Files: ${result.detectedFiles.length}`);
  console.log(`References: ${result.suggestedReferences.length}`);
  console.log(`Scripts: ${result.suggestedScripts.length}`);
  console.log(`Assets: ${result.suggestedAssets.length}`);

  if (result.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
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
