import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, expect, test } from 'vitest';
import { buildCompatConfig } from '../scripts/build-compat-config.mjs';
import { RAW_IDE_FILE_MAPPINGS } from '../mcp/src/tools/setup.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

test('generated compat config satisfies all setup IDE file mappings', () => {
  const compatDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cloudbase-compat-mappings-'),
  );
  tempDirs.push(compatDir);

  buildCompatConfig({ outputDir: compatDir });

  for (const [ide, descriptors] of Object.entries(RAW_IDE_FILE_MAPPINGS)) {
    for (const descriptor of descriptors) {
      const relativePath = descriptor.path.endsWith('/')
        ? descriptor.path.slice(0, -1)
        : descriptor.path;
      const fullPath = path.join(compatDir, relativePath);
      expect(
        fs.existsSync(fullPath),
        `Missing generated path for IDE "${ide}": ${descriptor.path}`,
      ).toBe(true);
    }
  }
});
