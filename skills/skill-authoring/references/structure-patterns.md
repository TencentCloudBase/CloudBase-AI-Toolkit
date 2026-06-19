# Structure Patterns

## Purpose

Use this reference to design a maintainable, extensible skill structure with progressive disclosure. The goal is not just to make the content tidy, but to ensure the agent knows what to read, in what order, and when to stop loading context.

## Skill Anatomy

A mature skill often looks like this:

```text
skill-name/
├── SKILL.md
├── references/
│   ├── topic-a.md
│   └── topic-b.md
├── scripts/
│   └── helper.sh
└── assets/
    └── template.md
```

Responsibilities:

- `SKILL.md`
  - Entry point for the skill
  - Behavioral rules after trigger
  - Routing and reading order
  - Boundary and non-applicable scenarios
- `references/`
  - Detailed methodology
  - Platform, framework, or mode differences
  - Long explanations, examples, and checklists
- `scripts/`
  - Helper scripts that reduce repeated manual work
  - Good for transformation, checking, or batch generation tasks
- `assets/`
  - Templates, skeleton files, sample inputs, and static support files

## Core Rule

The main `SKILL.md` should not become a complete manual. Its job is to:

- Explain what problem the skill solves
- Tell the agent what to do first after trigger
- Tell the agent when to load which `references/`
- Tell the agent when not to use the skill

In other words, `SKILL.md` should control agent behavior, not merely explain a topic.

## Recommended Main Sections

Recommended sections for the main `SKILL.md`:

1. `What this skill does`
2. `When to use this skill`
3. `Do NOT use for`
4. `How to use this skill (for a coding agent)`
5. `Routing`
6. `Quick workflow`
7. `Minimum self-check`

## Behavior First

The structure should answer behavioral questions before documentation questions:

- What is the first action after trigger?
- Under what conditions should the agent load `references/`?
- When should the agent stop loading more context?
- If a nearby scenario appears, should the agent switch skills or ask for clarification?

If the main file only lists topics but does not enforce behavior, the skill is still immature.

## When to Split Files

Split content into `references/`, `scripts/`, or `assets/` when:

- A topic needs to be read independently
- Different platforms, frameworks, or modes diverge significantly
- A template exceeds roughly 15-20 lines
- Multiple examples are needed to make the point
- Repeated steps could be automated with a script

## Practical Thresholds

Useful default heuristics:

- When `SKILL.md` approaches 200 lines, evaluate whether to split
- When a single topic exceeds roughly 40-60 lines, prefer moving it into `references/`
- When you need more than two long templates, prefer `assets/` or dedicated template files
- When the same action must be repeated, consider `scripts/`

These are not hard protocol rules, but they are good default thresholds for authoring.

## What to Keep in the Main File

Keep in the main file:

- Skill positioning
- Boundary and non-boundary cases
- The action sequence after trigger
- Reading routes
- Minimum self-check

Avoid in the main file:

- Long background explanations
- Full multi-platform detail
- Long template bodies
- Large collections of examples and counterexamples
- Repeated steps that could be scripted

## Routing Pattern

Do not just say "see another file." Say which scenario should read which file and why it should be read now.

Recommended pattern:

| Task | Read | Why |
| --- | --- | --- |
| Write frontmatter | `references/frontmatter-patterns.md` | Improve trigger quality and boundaries |
| Design main structure | `references/structure-patterns.md` | Control information layering |
| Draft templates | `references/templates.md` | Reuse a stable behavioral skeleton |
| Run evaluation | `references/evaluation.md` | Verify trigger quality and behavior |

## Progressive Disclosure

Recommended layering:

- Main `SKILL.md`: entry point, behavior rules, routing
- `references/*.md`: deep knowledge
- `assets/`: reusable templates and sample materials
- `scripts/`: executable helper capabilities

Principles:

- Read `SKILL.md` by default
- Load a reference file only when routing points to it
- Use scripts instead of writing long repeated instructions
- Use templates instead of regenerating structure from scratch

## Smell Checks

These signs usually mean the structure needs to be redesigned:

- The main file reads like a full tutorial
- There are many references but no reading order
- The agent must read everything before it can act
- Rules for different scenarios conflict with one another
- Templates, examples, methodology, and FAQ are mixed together
- Scriptable work is still described as long manual instructions
