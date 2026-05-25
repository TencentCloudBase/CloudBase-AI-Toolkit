---
name: skill-authoring
description: Design, improve, and evaluate reusable agent skills with high-quality SKILL.md files, precise trigger descriptions, progressive disclosure, and testable behavior. This skill should be used when users ask to create a new skill, rewrite or review an existing skill, audit a skill collection such as `config/source/skills` for redundancy or overlap, improve skill trigger quality, organize skill references, or evaluate whether a skill should trigger and behave correctly.
alwaysApply: false
---

# Skill Authoring

Create and refine reusable agent skills with better trigger quality, cleaner structure, stronger behavioral guidance, and more reliable evaluation.

## When to use this skill

Use this skill when you need to:

- Create a new `SKILL.md`
- Improve an existing skill's `name` or `description`
- Review whether a skill is too broad, too narrow, or poorly structured
- Audit a local skill collection such as `config/source/skills` for redundancy, trigger overlap, or weak boundaries
- Split a large skill into `SKILL.md` plus `references/`, `assets/`, or `scripts/`
- Design evaluation prompts and review whether a skill triggers and behaves correctly

## Repo-managed CloudBase skill review

When the task targets `config/source/skills`, apply these guardrails in addition to the normal skill-authoring workflow:

This section is the repo-managed CloudBase skill review baseline for this repository.

- Keep frontmatter complete and normalized, including `version`
- Keep examples inside the skill's declared platform and scope
- Keep shared operational rules in one canonical source instead of copying large blocks across neighboring skills
- If the skill claims a rule is mandatory, show that rule in at least one example
- When giving a recommended default, also explain the tradeoff behind it
- Do not infer public CNB / OpenClaw / ClawHub paths from the source tree; verify the actual published structure before writing fallback links or marketplace-facing URLs
- If a skill mentions raw URLs, blob URLs, or marketplace-consumed paths, check live reachability before finalizing the text
- Put standalone-install fallback guidance where the user needs it: keep the top-level note short, and place sibling-skill fallback links next to the actual cross-skill reference

**Do NOT use for:**
- General documentation writing that is not about skills
- README polish or marketing copy
- Prompt tweaks that do not affect skill structure or behavior
- Rule files unrelated to `SKILL.md`

## How to use this skill (for a coding agent)

1. **Identify the task class first**
   - Determine whether the request is about creating a new skill, reviewing an existing skill, or improving trigger quality, structure, or evaluation

2. **Optimize the trigger surface early**
   - Draft `name` and especially `description` before expanding the body
   - Put realistic trigger language into `description`, not only into the body

3. **Design behavior, not just documentation**
   - Make the main `SKILL.md` tell the agent what to do after the skill triggers
   - Use references for deeper guidance, not as a substitute for behavioral rules

4. **Load supporting materials only when needed**
   - Use the routing table to decide which reference file to read
   - Avoid loading every reference file by default

5. **Use collection-level review when the request is about many skills**
   - When reviewing `config/source/skills`, check overlap, duplication, trigger boundaries, and progressive disclosure across neighboring skills
   - Prefer evidence-based findings with concrete file references and rewrite guidance
   - Treat source layout, published skills-repo layout, and marketplace-consumed layout as different surfaces until you verify they are the same

6. **Evaluate before considering the skill complete**
   - Create should-trigger and should-not-trigger prompts
   - Run them, review the results, and iterate on the skill

## Routing

| Task | Read |
| --- | --- |
| Write or improve `name` and `description` | `references/frontmatter-patterns.md` |
| Design skill anatomy and progressive disclosure | `references/structure-patterns.md` |
| Draft a new skill or review an existing one | `references/templates.md` |
| Audit `config/source/skills` for quality, redundancy, and overlap | `references/repo-skill-review.md` |
| Review repo-managed CloudBase source skills | `references/cloudbase-skill-review.md` |
| Build evaluation prompts and review outcomes | `references/evaluation.md` |
| Compare good examples, weak examples, and rewrites | `references/examples.md` |

## Quick workflow

1. Identify the skill's job, boundary, and closest neighboring skills.
2. Draft `name` and `description` with realistic trigger language.
3. If the task targets `config/source/skills`, read `references/repo-skill-review.md`, then load `references/cloudbase-skill-review.md` for CloudBase-specific standards before proposing rewrites.
4. If the skill text will mention published URLs or fallback paths, verify the public structure and at least one real URL before writing.
5. Write the main `SKILL.md` so it changes agent behavior after trigger.
6. Move deep detail into `references/`, `assets/`, or `scripts/` as needed.
7. Run evaluation prompts and revise until trigger quality and behavior are stable.

## Minimum self-check

- Is the `name` short, intentional, and stable?
- Does the `description` explain both capability and trigger conditions?
- Does the main `SKILL.md` change agent behavior after trigger?
- Are non-applicable scenarios explicit?
- Does routing point to the right reference file for each task?
- If the skill references public URLs or standalone-install fallback paths, were those URLs verified against the actual published surface instead of guessed from local directories?
- Are evaluation prompts present for both should-trigger and should-not-trigger cases?
- Can you explain why this skill stays distinct from its nearest neighbors?
- If reviewing a skill collection, can you point to redundancy, overlap, and missing boundaries with concrete evidence?
