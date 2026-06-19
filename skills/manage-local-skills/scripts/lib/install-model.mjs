import fs from 'fs';
import path from 'path';
import { homedir, platform } from 'os';
import { assertPathSafe, sanitizeSkillName } from './path-safety.mjs';
import { getAgentMapping, isUniversalAgent, resolveAgentBaseDir } from './agent-mappings.mjs';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function shouldSkip(name) {
  return name === '.git' || name === 'node_modules' || name === '.DS_Store';
}

export function copyDirectory(sourceDir, targetDir) {
  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      ensureDir(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function symlinkDirectory(sourceDir, targetPath) {
  ensureDir(path.dirname(targetPath));
  const relativeTarget = path.relative(path.dirname(targetPath), sourceDir);
  fs.symlinkSync(relativeTarget, targetPath, platform() === 'win32' ? 'junction' : undefined);
}

export function getCanonicalBaseDir(scope, cwd) {
  return scope === 'global' ? path.join(homedir(), '.agents', 'skills') : path.join(cwd, '.agents', 'skills');
}

export function getCanonicalSkillPath(skillName, scope, cwd) {
  const sanitized = sanitizeSkillName(skillName);
  const baseDir = getCanonicalBaseDir(scope, cwd);
  const canonicalPath = path.join(baseDir, sanitized);
  assertPathSafe(baseDir, canonicalPath, 'canonical path');
  return canonicalPath;
}

export function getAgentSkillPath(agentKey, skillName, scope, cwd) {
  const sanitized = sanitizeSkillName(skillName);
  const agentBase = resolveAgentBaseDir(agentKey, scope, cwd);
  const targetPath = path.join(agentBase, sanitized);
  assertPathSafe(agentBase, targetPath, 'agent skill path');
  return targetPath;
}

export function detectConflict(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return 'none';
  }

  const stats = fs.lstatSync(targetPath);
  if (stats.isSymbolicLink()) {
    return 'replace';
  }

  if (stats.isDirectory()) {
    return 'overwrite';
  }

  return 'replace';
}

export function installLocalSkill(options) {
  const {
    sourceDir,
    skillName,
    agentKey,
    scope = 'project',
    mode = 'symlink',
    dryRun = false,
    cwd = process.cwd(),
  } = options;

  const mapping = getAgentMapping(agentKey);
  const canonicalPath = getCanonicalSkillPath(skillName, scope, cwd);
  const targetPath = isUniversalAgent(agentKey)
    ? canonicalPath
    : getAgentSkillPath(agentKey, skillName, scope, cwd);
  const canonicalConflict = detectConflict(canonicalPath);
  const targetConflict = targetPath === canonicalPath ? canonicalConflict : detectConflict(targetPath);
  const canonicalPointsToSource = mode === 'symlink';
  let canonicalSymlinkFailed = false;
  let canonicalSymlinkError = null;

  const plan = {
    sourceDir,
    skillName: sanitizeSkillName(skillName),
    agentKey,
    scope,
    requestedMode: mode,
    canonicalPath,
    targetPath,
    canonicalConflict,
    targetConflict,
    targetIsUniversal: isUniversalAgent(agentKey),
    canonicalPointsToSource,
  };

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      mode,
      ...plan,
    };
  }

  removePath(canonicalPath);
  ensureDir(path.dirname(canonicalPath));

  if (mode === 'symlink') {
    try {
      symlinkDirectory(sourceDir, canonicalPath);
    } catch (error) {
      canonicalSymlinkFailed = true;
      canonicalSymlinkError = error instanceof Error ? error.message : String(error);
      copyDirectory(sourceDir, canonicalPath);

      if (targetPath === canonicalPath) {
        return {
          success: true,
          dryRun: false,
          mode: 'copy',
          symlinkFailed: true,
          error: canonicalSymlinkError,
          ...plan,
        };
      }
    }
  } else {
    copyDirectory(sourceDir, canonicalPath);
  }

  if (targetPath === canonicalPath) {
    if (targetPath !== canonicalPath) {
      removePath(targetPath);
      copyDirectory(canonicalPath, targetPath);
    }

    return {
      success: true,
      dryRun: false,
      mode,
      ...plan,
    };
  }

  if (mode === 'copy') {
    removePath(targetPath);
    copyDirectory(canonicalPath, targetPath);

    return {
      success: true,
      dryRun: false,
      mode: 'copy',
      ...plan,
    };
  }

  removePath(targetPath);
  ensureDir(path.dirname(targetPath));

  try {
    const relativeTarget = path.relative(path.dirname(targetPath), canonicalPath);
    fs.symlinkSync(relativeTarget, targetPath, platform() === 'win32' ? 'junction' : undefined);

    return {
      success: true,
      dryRun: false,
      mode: canonicalSymlinkFailed ? 'copy' : 'symlink',
      ...(canonicalSymlinkFailed
        ? {
            symlinkFailed: true,
            error: canonicalSymlinkError,
          }
        : {}),
      ...plan,
    };
  } catch (error) {
    copyDirectory(canonicalPath, targetPath);
    return {
      success: true,
      dryRun: false,
      mode: 'copy',
      symlinkFailed: true,
      error: error instanceof Error ? error.message : String(error),
      ...plan,
    };
  }
}
