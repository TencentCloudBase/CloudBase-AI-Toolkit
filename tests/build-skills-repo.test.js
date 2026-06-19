import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { afterEach, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, '.skills-repo-output');

afterEach(() => {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
});

test('build-skills-repo publishes skills and guideline from minimal sources', () => {
  execFileSync('node', ['scripts/build-skills-repo.mjs'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
  });

  expect(
    fs.existsSync(path.join(OUTPUT_DIR, 'skills', 'auth-web', 'SKILL.md')),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(OUTPUT_DIR, 'skills', 'cloudbase-guidelines', 'SKILL.md'),
    ),
  ).toBe(true);

  const guideline = fs.readFileSync(
    path.join(OUTPUT_DIR, 'skills', 'cloudbase-guidelines', 'SKILL.md'),
    'utf8',
  );
  expect(guideline).toContain('Serialize the object first, then retry once with the serialized text');
  expect(guideline).toContain('actually passes the serialized string rather than the original object');

  const readme = fs.readFileSync(path.join(OUTPUT_DIR, 'README.md'), 'utf8');
  expect(readme).toContain('cloudbase-guidelines');
  expect(readme).toContain('auth-web');
});
