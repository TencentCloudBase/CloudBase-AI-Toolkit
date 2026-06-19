# Value Triage

## Purpose

Use this reference to decide whether a `tool` attribution issue or a skills-related attribution issue is actually valuable, whether it belongs in `mcp/src` or `config/source/skills`, how to map the failure to the right code surface, and whether the agent should continue into a repo repair loop.

## High-value issue criteria

Treat an issue as high-value when most of these are true:

- it affects a core MCP capability
- it reproduces across more than one run, or has a very low score on a critical path
- the failing signal points to missing capability, bad defaults, incomplete return data, or weak operator guidance
- you can map the failure to one or more specific modules in `mcp/src`
- fixing it would improve future agent behavior, not just one isolated run

## Lower-value or non-actionable cases

Be cautious when the issue looks like one of these:

- browser or runtime dependencies missing in the evaluation environment
- temporary CloudBase platform instability
- grader schema mismatch while the MCP output already contains the correct substance
- duplicate attribution already tracked elsewhere
- a flow that fundamentally requires human interaction in a non-interactive evaluation environment

These often end up as `invalid` or remain `todo` until stronger evidence appears.

## Decision ladder

For each issue, decide in this order:

1. Is the failing signal real?
2. Is it caused by MCP code or design?
3. If yes, is there a specific module or tool boundary to change?
4. If no, is it an environment issue, grader issue, or duplicate?
5. Is the issue strong enough to justify a GitHub issue, repo fix, and PR?
6. If a PR already exists, does the next iteration belong on that line of work or does the direction need to change?

When the category is not explicitly `tool`, still include the issue if the title, detail, trace, or evaluation evidence shows that the failure belongs to skill activation, skill content, skill routing, or missing knowledge under `config/source/skills`.

## Common categories

### Real MCP defect

Typical signs:

- missing fields that the underlying tool should reasonably return
- parameters are hard to use, misleading, or silently wrong
- tool output shape prevents downstream extraction
- important next-step guidance is absent in a known failure mode

Typical outcome:

- `in_progress` if work is still ongoing
- `resolved` if there is already an external issue, PR, or landed fix

Default agent action:

- continue into worktree repair unless blocked

### Grader or output-contract mismatch

Typical signs:

- the trace and result contain the required substance
- the checker expects a different field name or nesting pattern
- the MCP behavior is reasonable, but the evaluator wants another schema

Typical outcome:

- often `invalid`
- sometimes `in_progress` if you decide to improve MCP output shape anyway

Default agent action:

- do not open a repair worktree unless you intentionally decide to change MCP output compatibility

### Environment or platform issue

Typical signs:

- missing browsers or system packages
- transient provisioning failures outside MCP control
- human-login flows used in headless automation

Typical outcome:

- usually `invalid`
- or `todo` if you still need stronger evidence

Default agent action:

- explain why this should not turn into a repo fix

## `mcp/src` mapping table

Use this map to move from attribution title to code inspection quickly.

| Failure pattern | Primary code to inspect | Typical questions |
| --- | --- | --- |
| Env info, hosting info, package info missing | `mcp/src/tools/env.ts`, `mcp/src/tools/hosting.ts` | Is the field missing upstream, filtered out, or never requested? |
| NoSQL collection, document, schema, readiness | `mcp/src/tools/databaseNoSQL.ts`, `mcp/src/tools/dataModel.ts` | Is the capability missing, or is the return shape too nested or ambiguous? |
| SQL / MySQL lifecycle or query management | `mcp/src/tools/databaseSQL.ts`, `mcp/src/tools/env.ts` | Is there a lifecycle gap, weak provisioning guidance, or undiscoverable path? |
| Cloud function creation, deployment, HTTP mode | `mcp/src/tools/functions.ts`, `mcp/src/tools/gateway.ts` | Are defaults misleading, schemas unclear, or follow-up steps omitted? |
| Environment creation, destruction, renewal | `mcp/src/tools/env.ts`, `mcp/src/tools/capi.ts`, `mcp/src/tools/setup.ts` | Is there a missing dedicated tool, or only a raw API escape hatch with poor guidance? |
| Auth loops or device-code friction | `mcp/src/tools/interactive.ts`, `mcp/src/tools/env.ts` | Is this a tool defect, or an automation-incompatible flow behaving as designed? |
| Download and IDE setup behavior | `mcp/src/tools/setup.ts`, `mcp/src/tools/download.ts` | Is the file mapping incomplete, or is the issue outside MCP itself? |
| Skill activation, skill content, skill routing, missing knowledge | `config/source/skills/*`, optionally `config/source/guideline/*` | Is the failure caused by missing knowledge, weak trigger wording, bad routing, or inconsistent contracts? |

## Code review checklist for attribution triage

Before concluding a tool issue is actionable, verify:

- the tool is actually registered
- the relevant schema or handler exposes the needed capability
- the returned content matches what the agent would realistically need
- the trace failure is not caused by wrong tool choice by the model
- the problem is not already fixed on the current branch
- for skills-related issues, the true source of truth is under `config/source/skills/`, not the root `skills/` maintenance directory

## Conclusion patterns

Use one of these conclusion shapes in `notes`:

- `real_mcp_gap`: the tool or output is genuinely incomplete
- `guidance_gap`: the tool exists, but the usage contract is too weak
- `grader_mismatch`: MCP output is adequate, evaluator expects another shape
- `environment_noise`: the run failed outside MCP control
- `duplicate_external`: already tracked elsewhere

## Escalation rule

Open or link a GitHub issue only when the problem is both:

- real enough to justify maintenance work
- specific enough that another maintainer could act on your notes without redoing the entire investigation

When those two conditions are met and the problem lives in `mcp/src`, do not stop at issue linkage. Continue into isolated repair and PR creation unless the environment is explicitly blocked.

Apply the same rule when the problem lives in `config/source/skills/`: continue into isolated repair and PR creation unless blocked.
