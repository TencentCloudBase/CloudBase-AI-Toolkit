import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cloudrunSourcePath = path.resolve(__dirname, '../mcp/src/tools/cloudrun.ts');

describe('CloudRun createAgent README template', () => {
  test('uses the latest CloudBase Web SDK CDN URL', () => {
    const cloudrunSource = fs.readFileSync(cloudrunSourcePath, 'utf8');

    expect(cloudrunSource).toContain(
      'https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js',
    );
    expect(cloudrunSource).not.toContain(
      '//static.cloudbase.net/cloudbase-js-sdk/2.9.0/cloudbase.full.js',
    );
  });
});
