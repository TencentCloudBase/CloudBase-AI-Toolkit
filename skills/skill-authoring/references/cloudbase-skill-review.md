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

### 6. Verify published-surface paths instead of inferring them

When a CloudBase skill needs fallback links, marketplace-facing references, or raw-source URLs:

- Treat the local source tree, generated skills repo, all-in-one bundle, and marketplace-consumed layout as separate surfaces until proven otherwise
- Do not assume `config/source/skills/<id>/SKILL.md` maps to the public CNB raw path
- Verify at least one real target URL before repeating the pattern across the collection
- Distinguish raw-source URLs from page-view URLs such as `blob`
- If the public surface uses a container entry plus `references/...`, write fallback rules for that structure, not the local authoring layout

### 7. Put fallback guidance close to the actual reference

When a skill is published standalone and also references sibling skills:

- Keep the top-of-file standalone note short and focused on the main entry plus the current skill
- Add sibling fallback links next to cross-skill references such as `../auth-tool/SKILL.md`
- Keep same-skill `references/...` paths relative unless the target surface is known to drop those files
- If nested reference files may be opened directly, make sure they still have a recoverable path back to the current skill or main entry

### 8. Treat `auth-nodejs` as the quality benchmark

Use `config/source/skills/auth-nodejs/SKILL.md` as a positive reference when reviewing nearby skills. It is a good benchmark for:

- scenario-based structure
- explicit boundaries
- concrete API signatures
- error handling in examples
- cross-skill routing discipline

## CloudBase-specific smell checks

- A code block contains repeated `const` declarations that make the snippet invalid JavaScript or TypeScript
- A platform-specific skill contains examples from a different platform
- The same mcporter config block appears in multiple sibling skills
- A skill claims a rule is required, but none of its examples actually follow it
- Console URL paths disagree between the CloudBase guideline and the platform overview
- A public fallback URL was inferred from the source tree without a live reachability check
- A long fallback section appears only at the top, but the actual sibling-skill reference gives the user no direct path to follow

## Review workflow

1. Check frontmatter and normalize `version`
2. Check scope boundaries and remove cross-platform examples
3. Check whether any public URL or fallback path was verified against the real published surface
4. Check whether duplicated rules should collapse into one canonical source
5. Check whether recommended defaults explain their tradeoffs
6. Compare the result against `auth-nodejs` for structure and example quality

## Evaluation prompts

### Should-trigger

1. Audit `config/source/skills` and tell me which CloudBase skills have overlapping MCP setup rules.
2. Review this CloudBase skill and tell me whether its examples stay inside the declared platform boundary.
3. Help me standardize `version` fields and error-handling examples across the CloudBase source skills.

### Should-not-trigger

1. Help me polish the marketing copy on this README.
2. Build a new CloudBase function for me.
3. Fix a failing SQL migration in the app runtime.
