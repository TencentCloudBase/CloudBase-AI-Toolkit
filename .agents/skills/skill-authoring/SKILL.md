---
name: skill-authoring
description: Design, improve, and evaluate reusable agent skills with high-quality SKILL.md files, precise trigger descriptions, progressive disclosure, and testable behavior. This skill should be used when users ask to create a new skill, rewrite or review an existing skill, improve skill trigger quality, organize skill references, or evaluate whether a skill should trigger and behave correctly.
alwaysApply: false
---

# Skill Authoring

Create and refine reusable agent skills with better trigger quality, cleaner structure, stronger behavioral guidance, and more reliable evaluation.

## When to use this skill

Use this skill when you need to:

- Create a new `SKILL.md`
- Improve an existing skill's `name` or `description`
- Review whether a skill is too broad, too narrow, or poorly structured
- Split a large skill into `SKILL.md` plus `references/`, `assets/`, or `scripts/`
- Design evaluation prompts and review whether a skill triggers and behaves correctly

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

5. **Evaluate before considering the skill complete**
   - Create should-trigger and should-not-trigger prompts
   - Run them, review the results, and iterate on the skill

## Routing

| Task | Read |
| --- | --- |
| Write or improve `name` and `description` | `references/frontmatter-patterns.md` |
| Design skill anatomy and progressive disclosure | `references/structure-patterns.md` |
| Draft a new skill or review an existing one | `references/templates.md` |
| Build evaluation prompts and review outcomes | `references/evaluation.md` |
| Compare good examples, weak examples, and rewrites | `references/examples.md` |

## Quick workflow

1. Identify the skill's job, boundary, and closest neighboring skills.
2. Draft `name` and `description` with realistic trigger language.
3. Write the main `SKILL.md` so it changes agent behavior after trigger.
4. Move deep detail into `references/`, `assets/`, or `scripts/` as needed.
5. Run evaluation prompts and revise until trigger quality and behavior are stable.

## Minimum self-check

- Is the `name` short, intentional, and stable?
- Does the `description` explain both capability and trigger conditions?
- Does the main `SKILL.md` change agent behavior after trigger?
- Are non-applicable scenarios explicit?
- Does routing point to the right reference file for each task?
- Are evaluation prompts present for both should-trigger and should-not-trigger cases?
- Can you explain why this skill stays distinct from its nearest neighbors?
