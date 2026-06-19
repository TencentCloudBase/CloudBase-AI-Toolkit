# Templates

## New Skill Template

This is not just a document template. It is a template for how the agent should act after the skill triggers.

```markdown
---
name: your-skill-name
description: Short domain or capability introduction. This skill should be used when users ask to ...
---

# Skill Title

One short paragraph explaining what this skill changes for the agent.

## What this skill does

- Defines the scope of the skill
- Explains the behavior the agent should adopt
- Points to deeper references only when needed

## When to use this skill

- Keep this section short
- Do not repeat the full trigger vocabulary already carried by `description`
- Use it to clarify boundaries, not replace `description`

## Do NOT use for

- Neighbor scenario 1
- Neighbor scenario 2

## How to use this skill (for a coding agent)

1. Identify whether the request matches the intended task class.
2. Apply the main operating rules from this file first.
3. Load additional references only if the current task requires them.
4. Stop loading more context once you have enough to act.

## Operating Rules

1. First action after trigger:
2. What to inspect before acting:
3. What must never be skipped:
4. When to load references:
5. When to stop and ask for clarification:

## Routing

| Task | Read | Why |
| --- | --- | --- |
| Scenario A | `references/reference-a.md` | Needed for ... |
| Scenario B | `references/reference-b.md` | Needed for ... |

## Quick workflow

1. Trigger recognition
2. Initial action
3. Reference loading if needed
4. Output generation
5. Self-check

## Minimum self-check

- Did the skill actually change agent behavior?
- Did I avoid loading unnecessary references?
- Did I stay within the intended boundary?
```

## Existing Skill Review Template

Use this template to review an existing skill:

```markdown
## Review Summary

- Current goal:
- Current trigger quality:
- Current behavior after trigger:
- Main overlap risks:
- Main structure issues:

## Frontmatter Findings

- Name issue:
- Description issue:
- Keyword gaps:
- Boundary issue:

## Behavior Findings

- What the agent should do but currently does not:
- What the agent does too early:
- What the agent loads unnecessarily:
- What the skill fails to enforce:

## Structure Findings

- What is too long:
- What should move to references:
- What should become a script or asset:
- What needs routing:

## Rewrite Plan

1. Tighten or broaden description
2. Clarify behavior after trigger
3. Split references or add scripts/assets
4. Add evaluation prompts and acceptance checks
```

## Description Draft Template

```text
<Product / domain intro>. This skill should be used when users ask to <task 1>, <task 2>, <task 3>, or when they need <neighbor phrase> in <platform or scenario>.
```

Notes:

- Put the main trigger information into `description`
- Use the body to enforce behavior after trigger
- Do not write the skill as a generic topic overview

## Resource Split Template

If the skill becomes complex, split it into these roles:

- `SKILL.md`: entry point and behavior rules
- `references/`: deeper methodology
- `assets/`: templates and sample materials
- `scripts/`: executable helper capabilities

## Authoring Checklist Template

```markdown
- [ ] Name is short and intentional
- [ ] Description explains both capability and trigger
- [ ] The skill changes agent behavior after trigger
- [ ] The main SKILL.md is concise
- [ ] Routing only loads references when needed
- [ ] Reusable templates live in assets or dedicated files
- [ ] Repeated actions are moved into scripts when appropriate
- [ ] Evaluation prompts and acceptance criteria are present
```
