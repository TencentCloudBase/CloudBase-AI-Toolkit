import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WORKFLOW_FILE = path.join(
  ROOT_DIR,
  '.github',
  'workflows',
  'push-allinone-skill.yml',
);

test('push-allinone workflow pushes to cloudbase-skills without suppressing downstream CI', () => {
  const raw = fs.readFileSync(WORKFLOW_FILE, 'utf8');

  expect(raw).toContain('TencentCloudBase/cloudbase-skills.git');
  expect(raw).toContain('git push https://x-access-token:${{ secrets.CLOUDBASE_SKILLS }}@github.com/TencentCloudBase/cloudbase-skills.git HEAD:main');
  expect(raw).not.toContain('[skip ci]');
});
