# Repo Skill Review

## Purpose

Use this reference when the task is to review a repository-managed skill collection such as `config/source/skills/` for quality, redundancy, trigger overlap, structure issues, or weak behavioral guidance.

This review mode is based on:

- Claude skill best practices: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Datawhale skill write-up: [如何写出好的 Skill](https://github.com/datawhalechina/hello-agents/blob/main/Extra-Chapter/Extra08-%E5%A6%82%E4%BD%95%E5%86%99%E5%87%BA%E5%A5%BD%E7%9A%84Skill.md)
- Trae guide: [如何写好一个 Skill：从创建到迭代的最佳实践](https://docs.trae.cn/ide/best-practice-for-how-to-write-a-good-skill)

## When to use this reference

Use it when the user asks to:

- check the quality of `config/source/skills`
- find redundant or overlapping skills
- review whether skill descriptions are too broad or vague
- inspect whether `SKILL.md` files are too heavy and should be split
- evaluate whether repo-managed skills follow good authoring practice

## Review Scope

Treat the audit as four linked checks:

1. Trigger quality
2. Boundary clarity
3. Structure and progressive disclosure
4. Collection hygiene

Do not stop at "this skill feels weak." The output should identify which dimension failed and what to rewrite.

## Core Principles

### 1. Description is the trigger surface

`description` should explain both:

- what the skill does
- when it should be used

For collection reviews, this means checking whether neighboring skills use distinguishable trigger language.

Smells:

- descriptions like "helps with X"
- missing task or context cues
- broad verbs shared across too many skills
- synonyms stuffed into one skill without a clear boundary

### 2. Write for the agent, not for humans

Review `SKILL.md` for operational behavior, not team-facing prose.

Smells:

- background history
- version history / changelog notes
- README-style onboarding text
- values or principles without actionable behavior

Prefer instructions that change what the agent does after trigger.

### 3. Keep only high-value context in the main file

The main `SKILL.md` should stay concise and behavior-first.

Check for:

- repeated explanations the model likely already knows
- long tutorials in the main file
- deep detail that belongs in `references/`
- repeated manual procedures that should become `scripts/`

### 4. Progressive disclosure should be explicit

`SKILL.md` should route the agent to the right reference file at the right time.

Smells:

- many reference files with no reading order
- nested references that require reading references from references
- no scenario-to-reference routing
- heavy context loading by default

### 5. Neighboring skills must stay distinct

For repo-level audits, always compare the target skill against its nearest neighbors.

Typical overlap patterns in `config/source/skills`:

- platform vs domain skill overlap
- auth entry skill vs platform-specific auth skill overlap
- web vs mini program vs nodejs database skill overlap
- "design/spec/review" skills that all claim broad planning or evaluation verbs

If two skills share the same likely prompts, the review should explain whether to:

- tighten one description
- add non-applicable cases
- move shared detail into a reference
- merge the skills
- split one skill by platform or mode

## Repo Audit Workflow

### Step 1: Build the inventory

1. List all candidate skills under `config/source/skills/`
2. Read the target `SKILL.md` files first
3. Group nearby skills by domain, platform, or user intent

Useful groupings:

- auth
- database
- frontend / UI
- deployment / runtime
- planning / review
- AI model usage

### Step 2: Check frontmatter quality

For each skill, ask:

- Is the `name` short, stable, and specific?
- Does the `description` describe both capability and trigger condition?
- Would the description still be understandable without reading the body?
- Is the wording in third-person / neutral instruction style rather than "I can help..."?
- Does it overclaim scenarios already covered by a neighbor?

### Step 3: Check body quality

Ask:

- Does the main file tell the agent what to do first?
- Are non-applicable scenarios explicit?
- Is the routing table present and useful?
- Is behavior specific enough for fragile tasks?
- Is the file acting like an execution guide rather than a general article?

### Step 4: Check structure quality

Ask:

- Should some sections move into `references/`?
- Are there scripts that would make fragile or repeated operations safer?
- Are references one level deep from `SKILL.md`?
- Do long reference files need a table of contents?

### Step 5: Check overlap and redundancy

Compare neighboring skills for:

- same nouns + same verbs in `description`
- duplicated workflow steps in `SKILL.md`
- repeated examples that could live in one place
- multiple skills routing to the same scenario without differentiation

Mark each overlap as one of:

- acceptable overlap
- mild redundancy
- trigger conflict
- merge candidate
- split candidate

### Step 6: Design evaluation prompts

For any skill that may be too broad or too narrow, create:

- at least 3 should-trigger prompts
- at least 3 should-not-trigger prompts
- 1 closest-neighbor comparison

Collection audits should include cross-skill prompts such as:

- "Should this trigger `auth-tool` or `auth-web`?"
- "Should this trigger `web-development` or `ui-design`?"
- "Should this trigger `http-api` or `cloud-functions`?"

## Findings Format

When reporting the audit, prefer review-style findings ordered by severity.

For each finding, include:

- affected skill file(s)
- issue type: trigger / boundary / structure / redundancy
- why it matters
- the smallest useful rewrite direction

Example labels:

- `[P1] Trigger wording overlaps with sibling skill`
- `[P2] Main SKILL.md contains reference-grade detail`
- `[P2] Missing non-applicable cases causes false positives`
- `[P3] Duplicate examples should move to shared reference`

## Rewrite Guidance

Use these rewrite moves first:

1. Tighten `description`
2. Add "Do NOT use for" cases
3. Make routing scenario-based
4. Move detail from `SKILL.md` to `references/`
5. Replace repeated manual instructions with `scripts/`
6. Split by platform or mode only when boundary tightening is not enough

## Collection Pass Criteria

A repo skill collection is in good shape when:

- each skill has a distinct job and nearest-neighbor boundary
- descriptions are specific enough to drive correct triggering
- `SKILL.md` files are concise and behavior-first
- reference loading is explicit and shallow
- repeated logic is minimized
- audit findings can be explained with concrete file evidence
