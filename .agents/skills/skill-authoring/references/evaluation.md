# Evaluation

## Purpose

A skill should not only trigger. It should also produce the right behavior after trigger. Use this reference to design evaluation prompts, run review loops, record findings, and decide whether a skill is ready to ship.

## Core Method

Following the `skill-creator` style, evaluate a skill as a closed loop:

1. Draft the skill
2. Design realistic prompts
3. Run those prompts
4. Review both trigger behavior and output quality
5. Revise `description`, operating rules, routing, or references
6. Test again until boundaries and behavior are stable

## Prompt Sets

Each skill should have at least two prompt sets:

- should-trigger
- should-not-trigger

If a skill only tests should-trigger cases, it will hide many false positives.

## Prompt Design Rules

### Should-Trigger

Cover:

- Core scenarios
- Realistic user phrasing
- Mixed-language or alias phrasing when relevant
- Variations that should still trigger

### Should-Not-Trigger

Cover:

- Neighboring skill scenarios
- Requests with similar words but different tasks
- Requests that contain partial keywords but should not match

## Minimal Evaluation Set

Each skill should ideally include at least:

- 3 should-trigger prompts
- 3 should-not-trigger prompts
- 1 closest-neighbor comparison

Do not stop at writing prompts. Run them.

## Acceptance Dimensions

Review each round along these dimensions:

1. Trigger Precision
   - Does the skill stay quiet when it should not trigger?
2. Trigger Recall
   - Does it trigger in realistic core scenarios?
3. Behavioral Correctness
   - After triggering, does the agent follow the required process?
4. Context Discipline
   - Does it load only the references, assets, or scripts it actually needs?
5. Boundary Clarity
   - Does it remain distinct from the nearest neighboring skills?

## Pass Criteria

A skill is ready to ship only when:

- Core should-trigger prompts consistently activate it
- Obvious should-not-trigger prompts do not activate it
- Post-trigger behavior matches the operating rules in `SKILL.md`
- It does not load extra references without a reason
- The nearest neighboring scenario can be distinguished clearly

## Run and Review

During testing, watch for:

- Whether the skill triggered at all
- Whether it triggered at the right time
- Whether the output reflects the promised capability
- Whether the correct references were loaded
- Whether any required steps were skipped
- Whether nearby scenarios were incorrectly captured

## Diagnosis Guide

If the results are weak, trace the problem back:

- Too many false positives: tighten `description`, remove broad verbs, clarify non-applicable cases
- Weak recall: add aliases, platform terms, and realistic phrasing
- Triggered but behaved incorrectly: rewrite `Operating Rules`, workflow, or examples
- Too much context loaded: tighten routing and reduce default reads
- Main file too heavy: move detail into `references/`, `assets/`, or `scripts/`

## Evaluation Record Template

```markdown
## Prompt

- Type: should-trigger / should-not-trigger
- Text: ...

## Result

- Triggered: yes / no
- Correct timing: yes / no
- Behavior correct: yes / no
- Extra context loaded: yes / no

## Notes

- What went right:
- What went wrong:
- Rewrite action:
```

## Summary Template

```markdown
## Evaluation Summary

- Trigger precision:
- Trigger recall:
- Behavioral correctness:
- Context discipline:
- Boundary clarity:

## Most Confusing Neighbor

- Neighbor skill:
- Why confusion happens:
- How this skill stays distinct:

## Decision

- Ready to ship / Needs rewrite
```

## Iteration Loop

1. Draft `description` and operating rules
2. Design evaluation prompts
3. Run them
4. Review using the acceptance dimensions
5. Revise `description`, operating rules, routing, references, assets, or scripts
6. Repeat until the skill meets the pass criteria
