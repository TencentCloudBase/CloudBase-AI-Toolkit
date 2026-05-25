import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';
import { loadYamlModule } from '../scripts/lib/load-yaml-module.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

/**
 * Codex compatibility guardrails for SKILL.md frontmatter.
 *
 * Codex (OpenAI) hard-rejects skills when:
 *   - description exceeds 1024 characters
 *   - YAML frontmatter fails to parse (e.g. unquoted `: ` in values)
 *
 * This test suite enforces those limits on ALL source SKILL.md files
 * so regressions are caught before they reach users.
 */

const CODEX_DESCRIPTION_MAX = 1024;
const DESCRIPTION_MIN = 100; // catch accidental gutting

function collectSkillFiles() {
  const files = [];

  // Guideline entry
  const guidelinePath = path.join(
    ROOT_DIR,
    'config',
    'source',
    'guideline',
    'cloudbase',
    'SKILL.md',
  );
  if (fs.existsSync(guidelinePath)) {
    files.push({ name: 'guideline/cloudbase', path: guidelinePath });
  }

  // All skills under config/source/skills/
  const skillsDir = path.join(ROOT_DIR, 'config', 'source', 'skills');
  if (fs.existsSync(skillsDir)) {
    // Root SKILL.md
    const rootSkill = path.join(skillsDir, 'SKILL.md');
    if (fs.existsSync(rootSkill)) {
      files.push({ name: 'skills/SKILL.md (root)', path: rootSkill });
    }

    // Sub-directory skills
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          files.push({ name: `skills/${entry.name}`, path: skillPath });
        }
      }
    }
  }

  return files;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

function getDescriptionLine(frontmatterBlock) {
  for (const line of frontmatterBlock.split('\n')) {
    if (line.startsWith('description:')) {
      return line;
    }
  }
  return null;
}

describe('SKILL.md Codex compatibility (all source skills)', async () => {
  const yaml = await loadYamlModule(ROOT_DIR);
  const skillFiles = collectSkillFiles();

  test('at least 5 source skills are found', () => {
    expect(skillFiles.length).toBeGreaterThanOrEqual(5);
  });

  describe.each(skillFiles)('$name', ({ name, path: filePath }) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const fmBlock = extractFrontmatter(content);

    test('has valid YAML frontmatter', () => {
      expect(fmBlock, `${name}: missing --- frontmatter delimiters`).toBeTruthy();

      let parsed;
      try {
        parsed = yaml.load(fmBlock);
      } catch (e) {
        expect.fail(
          `${name}: YAML parse error — ${e.message}. ` +
            'Likely cause: unquoted value containing ": " (colon-space). ' +
            'Fix: wrap the description value in double quotes.',
        );
      }

      expect(parsed, `${name}: frontmatter parsed to null`).toBeTruthy();
      expect(typeof parsed).toBe('object');
    });

    test('has required fields: name, description', () => {
      const parsed = yaml.load(fmBlock);
      expect(parsed.name, `${name}: missing 'name' field`).toBeTruthy();
      expect(
        parsed.description,
        `${name}: missing 'description' field`,
      ).toBeTruthy();
      expect(typeof parsed.description).toBe('string');
    });

    test(`description ≤ ${CODEX_DESCRIPTION_MAX} chars (Codex hard limit)`, () => {
      const parsed = yaml.load(fmBlock);
      const desc = parsed.description || '';
      expect(
        desc.length,
        `${name}: description is ${desc.length} chars, exceeds Codex limit of ${CODEX_DESCRIPTION_MAX}`,
      ).toBeLessThanOrEqual(CODEX_DESCRIPTION_MAX);
    });

    test(`description ≥ ${DESCRIPTION_MIN} chars (not accidentally gutted)`, () => {
      const parsed = yaml.load(fmBlock);
      const desc = parsed.description || '';
      expect(
        desc.length,
        `${name}: description is only ${desc.length} chars — likely over-simplified`,
      ).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    });

    test('description with colon-space must be double-quoted', () => {
      const descLine = getDescriptionLine(fmBlock);
      expect(descLine, `${name}: no description: line found`).toBeTruthy();

      const valueAfterKey = descLine.replace(/^description:\s*/, '');
      const isQuoted = valueAfterKey.startsWith('"') || valueAfterKey.startsWith("'");

      if (!isQuoted) {
        // Unquoted descriptions must not contain ": " which breaks YAML parsers
        // (the colon-space after the initial "description: " key is already stripped)
        const colonSpaceCount = (valueAfterKey.match(/: /g) || []).length;
        expect(
          colonSpaceCount,
          `${name}: unquoted description contains ${colonSpaceCount} bare ": " sequence(s) ` +
            'which will break strict YAML parsers (like Codex). ' +
            'Fix: wrap the entire description value in double quotes.',
        ).toBe(0);
      }
    });

    test('version field matches semver format (no "v" prefix)', () => {
      const parsed = yaml.load(fmBlock);
      if (parsed.version !== undefined) {
        expect(String(parsed.version)).toMatch(
          /^\d+\.\d+\.\d+(?:-[^\s]+)?$/,
        );
        expect(String(parsed.version)).not.toMatch(/^v/);
      }
    });
  });
});
