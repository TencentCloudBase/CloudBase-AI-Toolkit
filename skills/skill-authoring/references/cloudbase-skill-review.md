# CloudBase Skill Review

## Purpose

Use this reference when auditing or rewriting the CloudBase skill collection under `config/source/skills/`. It adds CloudBase-specific review rules on top of the general repo-skill review workflow.

Use it as the checklist for frontmatter completeness, examples stay in scope, shared rules should have a single canonical source, and other CloudBase collection-specific review gates.

## Core standards

### 1. Frontmatter completeness

Every repo-managed CloudBase source skill should declare:

- `name`
- `description`
- `version`
- `alwaysApply`

For `version`, use a normalized SemVer-like value such as `2.15.4`. Do not use `v2.15.4`, and do not let sibling source skills drift to different release styles without a clear reason.

### 2. Examples stay in scope

Examples must match the skill's declared platform and boundary:

- Web-only skills should not contain mini program code
- Mini program skills should not drift into Web SDK auth flows
- Platform-overview skills should not expand into full implementation recipes that belong in a specialized sibling

If a section contradicts `Do NOT use for`, treat it as a priority bug, not a copywriting issue.

### 3. Shared rules should have a single canonical source

When multiple CloudBase skills need the same operational rule:

- Keep the full rule in one canonical source
- Reference that source from neighboring skills instead of copying large blocks
- Only restate the minimum reminder needed for local context

This is especially important for MCP / mcporter setup, schema-inspection rules, and other control-plane workflows that easily drift across files.

### 4. Rules must appear in examples, not only prose

If a skill says something is mandatory, recommended, forbidden, or required, at least one example should demonstrate that behavior directly.

Examples:

- If auth flows require error handling, show `try/catch`
- If a default is recommended to reduce cold starts, show the recommended value in the example payload
- If a platform boundary matters, do not leave a contradictory example elsewhere in the file

### 5. Explain tradeoffs behind recommended defaults

Do not stop at "use X by default." Also explain the operational tradeoff:

- `MinNum: 1` reduces cold start latency but costs more than `0`
- A canonical URL path may still need live console verification if the product UI changes
- An `alwaysApply` setting should only stay enabled if the skill truly needs to win globally

### 6. Never instruct agents to fetch remote skill bodies

Remote raw skill URLs are a marketplace security reject (injection / session hijacking):

- Do **not** put `cnb.cool/.../git/raw/...` (or similar) skill/protocol URLs in `SKILL.md`
- Do **not** add `(standalone fallback: ...)` remote links next to sibling references
- Keep human docs links (`docs.cloudbase.net`) when useful; those are not skill-body fetch instructions
- Treat the local source tree, generated skills repo, all-in-one bundle, and marketplace-consumed layout as separate surfaces for install docs — verify before writing marketplace-facing paths

### 7. Local-only sibling guidance

When a skill is published standalone and also references sibling skills:

- Keep a short top-of-file **Sibling skills (local only)** note: use relative paths; if missing, ask the user to install the full plugin/skills pack; never HTTP-fetch remote skill markdown
- Keep cross-skill references as local relative paths such as `../auth-tool-cloudbase/SKILL.md`
- Keep same-skill `references/...` paths relative unless the target surface is known to drop those files
- If nested reference files may be opened directly, make sure they still have a recoverable local path back to the current skill

### 8. Treat `auth-nodejs-cloudbase` as the quality benchmark

Use `config/source/skills/auth-nodejs-cloudbase/SKILL.md` as a positive reference when reviewing nearby skills. It is a good benchmark for:

- scenario-based structure
- explicit boundaries
- concrete API signatures
- error handling in examples
- cross-skill routing discipline

### 9. Plugin skill-inject metadata must land with the skill

For any skill that appears under `plugin/cloudbase/skills/<dir>/`:

- Also add `plugin/cloudbase/skill-metadata.json` → `skills.<dir>` with non-empty `promptSignals.phrases` and `retrieval`
- Use `plugin/cloudbase/skill-metadata.template.json` as the shape reference
- Run `npm run build:skill-manifest` — CLI fails closed if the entry is missing
- Sync scripts must **not** overwrite `skill-metadata.json` (it lives outside `skills/`)

Skipping this step makes `tests/hooks/build-skill-manifest.test.mjs` fail, and clearing `generated/skill-manifest.json` leaves skill-inject with empty matches.

## CloudBase-specific smell checks

- A code block contains repeated `const` declarations that make the snippet invalid JavaScript or TypeScript
- A platform-specific skill contains examples from a different platform
- The same mcporter config block appears in multiple sibling skills
- A skill claims a rule is required, but none of its examples actually follow it
- Console URL paths disagree between the CloudBase guideline and the platform overview
- A skill tells the agent to HTTP-fetch remote skill or protocol markdown into context
- Cross-skill routing uses remote raw URLs instead of local relative `../skill-id/SKILL.md` paths
- A new `plugin/cloudbase/skills/<dir>` has no matching `skill-metadata.json` entry

## Review workflow

1. Check frontmatter and normalize `version`
2. Check scope boundaries and remove cross-platform examples
3. Check whether any public URL or fallback path was verified against the real published surface
4. Check whether duplicated rules should collapse into one canonical source
5. Check whether recommended defaults explain their tradeoffs
6. Compare the result against `auth-nodejs-cloudbase` for structure and example quality

## Evaluation prompts

### Should-trigger

1. Audit `config/source/skills` and tell me which CloudBase skills have overlapping MCP setup rules.
2. Review this CloudBase skill and tell me whether its examples stay inside the declared platform boundary.
3. Help me standardize `version` fields and error-handling examples across the CloudBase source skills.

### Should-not-trigger

1. Help me polish the marketing copy on this README.
2. Build a new CloudBase function for me.
3. Fix a failing SQL migration in the app runtime.
