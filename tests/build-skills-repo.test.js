import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { afterEach, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(
  ROOT_DIR,
  `.skills-repo-output-test-${process.pid}-${Date.now()}`,
);

afterEach(() => {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
});

test('build-skills-repo publishes skills and guideline from minimal sources', () => {
  execFileSync('node', ['scripts/build-skills-repo.mjs'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    env: {
      ...process.env,
      SKILLS_REPO_OUTPUT_DIR: path.relative(ROOT_DIR, OUTPUT_DIR),
    },
  });

  expect(
    fs.existsSync(path.join(OUTPUT_DIR, 'skills', 'auth-web-cloudbase', 'SKILL.md')),
  ).toBe(true);
  expect(
    fs.existsSync(
      path.join(OUTPUT_DIR, 'skills', 'cloudbase', 'SKILL.md'),
    ),
  ).toBe(true);

  const guideline = fs.readFileSync(
    path.join(OUTPUT_DIR, 'skills', 'cloudbase', 'SKILL.md'),
    'utf8',
  );
  expect(guideline).toContain('Serialize the object first, then retry once with the serialized text');
  expect(guideline).toContain('actually passes the serialized string rather than the original object');

  const readme = fs.readFileSync(path.join(OUTPUT_DIR, 'README.md'), 'utf8');
  expect(readme).toContain('cloudbase');
  expect(readme).toContain('auth-web-cloudbase');
  expect(readme).toContain('MIT — see [LICENSE](./LICENSE)');

  // The target repository's root is wiped by the publishing workflow before the
  // rsync, so the license has to come from this build output.
  const license = fs.readFileSync(path.join(OUTPUT_DIR, 'LICENSE'), 'utf8');
  const rootLicense = fs.readFileSync(path.join(ROOT_DIR, 'LICENSE'), 'utf8');
  expect(license).toBe(rootLicense);
  expect(license).toContain('MIT License');
});
