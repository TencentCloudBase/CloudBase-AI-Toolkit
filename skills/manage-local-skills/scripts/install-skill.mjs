#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { installLocalSkill } from './lib/install-model.mjs';

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const options = {
    sourceDir: '',
    skill: '',
    agent: '',
    scope: 'project',
    mode: 'symlink',
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source-dir') {
      options.sourceDir = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--skill') {
      options.skill = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--agent') {
      options.agent = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--scope') {
      options.scope = argv[index + 1] || options.scope;
      index += 1;
      continue;
    }
    if (arg === '--mode') {
      options.mode = argv[index + 1] || options.mode;
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
    }
  }

  if (!options.sourceDir || !options.skill || !options.agent) {
    throw new Error('Missing required --source-dir, --skill, or --agent');
  }

  if (!['project', 'global'].includes(options.scope)) {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  if (!['symlink', 'copy'].includes(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }

  return options;
}

export function runInstallSkill(options) {
  const skillDir = path.resolve(options.sourceDir, options.skill);
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    throw new Error(`Missing SKILL.md for skill: ${skillDir}`);
  }

  return installLocalSkill({
    sourceDir: skillDir,
    skillName: options.skill,
    agentKey: options.agent,
    scope: options.scope,
    mode: options.mode,
    dryRun: options.dryRun,
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = runInstallSkill(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  console.log(`Skill: ${result.skillName}`);
  console.log(`Agent: ${result.agentKey}`);
  console.log(`Scope: ${result.scope}`);
  console.log(`Mode: ${result.mode}`);
  console.log(`Canonical: ${result.canonicalPath}`);
  console.log(`Target: ${result.targetPath}`);
  if (result.symlinkFailed) {
    console.log('Symlink failed, copied instead.');
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
