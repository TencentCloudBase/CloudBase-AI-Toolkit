import path from 'path';

export function sanitizeSkillName(name) {
  const trimmed = String(name || '').trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

  if (!normalized || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(normalized)) {
    throw new Error(`Invalid skill name: ${name}`);
  }

  return normalized;
}

export function isPathSafe(basePath, targetPath) {
  const normalizedBase = path.normalize(path.resolve(basePath));
  const normalizedTarget = path.normalize(path.resolve(targetPath));
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}${path.sep}`);
}

export function assertPathSafe(basePath, targetPath, label = 'path') {
  if (!isPathSafe(basePath, targetPath)) {
    throw new Error(`Unsafe ${label}: ${targetPath}`);
  }
}

export function expandHomePath(input, homeDir) {
  if (!input) {
    return input;
  }

  if (input === '~') {
    return homeDir;
  }

  if (input.startsWith('~/')) {
    return path.join(homeDir, input.slice(2));
  }

  return input;
}
