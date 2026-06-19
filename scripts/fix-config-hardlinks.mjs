#!/usr/bin/env node

const message = `
[Deprecated] scripts/fix-config-hardlinks.mjs

The repository no longer maintains editor compatibility files as hard-linked
sources inside config/.

Normal day-to-day editing no longer requires a replacement command.
Edit the source directories directly and commit your changes:

  - config/source/skills/
  - config/source/guideline/
  - config/source/editor-config/

Generation and publication are now enforced by CI/workflows.

Only run the generated compatibility pipeline manually when you need local
verification or an explicit external sync:

  1. node scripts/sync-claude-skills-mirror.mjs
  2. node scripts/build-compat-config.mjs
  3. node scripts/sync-config.mjs
`.trim();

console.error(message);
process.exit(1);
