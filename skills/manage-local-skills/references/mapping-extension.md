# Mapping Extension

Use this reference when adding or updating supported agent or IDE targets.

## Mapping rule

Keep agent path rules in code, not in prose examples.

Each mapping should define:

- the stable agent key
- the project-scope skill directory
- the global-scope skill directory when supported
- whether the target reuses the canonical `.agents/skills` directory

## Minimum mapping shape

```js
{
  key: {
    skillsDir: '.agents/skills',
    globalSkillsDir: '~/.example/skills'
  }
}
```

Treat a mapping as universal when `skillsDir === '.agents/skills'`.

Examples:

- Universal: `cursor`, `codex`
- Agent-specific: `claude`, `claude-code`, `codebuddy`

## How to add a new mapping

1. Confirm the agent's project-level skill path.
2. Confirm whether it supports a global user-level skill path.
3. Add the mapping entry in `scripts/lib/agent-mappings.mjs`.
4. Update tests to cover the new path resolution behavior.
5. Update any reference material if the new target introduces a different install expectation.

## When to reject a mapping

Do not add a mapping when:

- the agent does not have a stable local skill directory model
- the requested path is only speculative
- the path cannot be expressed safely with the current install model

State the limitation clearly instead of guessing.
