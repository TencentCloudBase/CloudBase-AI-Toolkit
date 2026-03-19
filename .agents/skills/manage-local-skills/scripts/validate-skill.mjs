#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const options = {
    skillDir: '',
    installedPath: '',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skill-dir') {
      options.skillDir = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--installed-path') {
      options.installedPath = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
    }
  }

  if (!options.skillDir) {
    throw new Error('Missing required --skill-dir');
  }

  return options;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch ? nameMatch[1].trim() : '',
    description: descriptionMatch ? descriptionMatch[1].trim() : '',
  };
}

function collectMissingReferences(skillDir, content) {
  const missing = [];
  const matches = content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g);
  for (const match of matches) {
    const target = match[1];
    if (/^https?:/.test(target) || target.startsWith('#')) {
      continue;
    }
    const resolved = path.resolve(skillDir, target);
    if (!fs.existsSync(resolved)) {
      missing.push(target);
    }
  }
  return missing;
}

export function validateSkill({ skillDir, installedPath = '' }) {
  const resolvedSkillDir = path.resolve(skillDir);
  const skillFile = path.join(resolvedSkillDir, 'SKILL.md');
  const errors = [];

  if (!fs.existsSync(skillFile)) {
    errors.push('Missing SKILL.md');
    return { valid: false, errors, warnings: [] };
  }

  const content = fs.readFileSync(skillFile, 'utf8');
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter.name) {
    errors.push('Missing frontmatter name');
  }
  if (!frontmatter.description) {
    errors.push('Missing frontmatter description');
  }

  const missingReferences = collectMissingReferences(resolvedSkillDir, content);
  for (const reference of missingReferences) {
    errors.push(`Missing referenced file: ${reference}`);
  }

  if (installedPath) {
    const resolvedInstalledPath = path.resolve(installedPath);
    if (!fs.existsSync(resolvedInstalledPath)) {
      errors.push(`Installed path not found: ${resolvedInstalledPath}`);
    } else if (!fs.existsSync(path.join(resolvedInstalledPath, 'SKILL.md'))) {
      errors.push(`Installed path missing SKILL.md: ${resolvedInstalledPath}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
    frontmatter,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = validateSkill(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) {
      process.exit(1);
    }
    return;
  }

  if (!result.valid) {
    console.error('Skill validation failed');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Skill validation passed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
