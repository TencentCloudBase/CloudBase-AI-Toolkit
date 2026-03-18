import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('cloudrun createAgent README uses current CloudBase Web SDK CDN URL', () => {
  const cloudrunSource = fs.readFileSync(
    path.join(ROOT_DIR, 'mcp', 'src', 'tools', 'cloudrun.ts'),
    'utf8',
  );

  expect(cloudrunSource).toContain('https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js');
  expect(cloudrunSource).not.toContain('//static.cloudbase.net/cloudbase-js-sdk/2.9.0/cloudbase.full.js');
});
