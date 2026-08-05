# Hooks packaging decision (XDF / WorkBuddy)

## Verdict

**Do not put SessionStart prewarm in Expert Agent frontmatter `hooks`.**

Use one of:

1. **Preferred for partner ops:** merge `settings.snippet.json` into `~/.workbuddy/settings.json`
2. **Preferred for productization:** enable as a plugin so `hooks/hooks.json` registers without the frontmatter safety gate
3. **Fallback (no hooks):** expert prompt §1b portable `downloadTemplate` + `npm install` during credential wait

## Why frontmatter hooks are the wrong vehicle

| Fact | Implication for XDF |
| --- | --- |
| User/plugin Agent frontmatter hooks are **denied by default** | Requires `allowUntrustedFrontmatterHooks: true` in `~/.workbuddy/settings.json` (or `~/.codebuddy/settings.json`) — extra partner security ask |
| Frontmatter hooks are **scoped to the subagent lifecycle** | They do **not** replace main-session SessionStart during the empty-project credential wait |
| Plugin agents **forbid** frontmatter `hooks` / `mcpServers` / `permissionMode` | Marketplace-distributed `agents/*.md` cannot carry SessionStart even if allowlist is on |
| Plugin `hooks/hooks.json` is **not** subject to `allowUntrustedFrontmatterHooks` | Correct packaging surface for always-on SessionStart |

Official refs:

- https://www.workbuddy.ai/docs/cli/hooks — Agent / Skill Frontmatter Hooks + Safety Gate
- https://www.workbuddy.ai/docs/cli/plugins-reference — plugin agents omit `hooks`; plugin `hooks/hooks.json` vs frontmatter gate

## Allowlist (only if someone insists on local Agent frontmatter)

```json
{
  "allowUntrustedFrontmatterHooks": true
}
```

Even then: frontmatter SessionStart on a custom Agent still only helps **that subagent**, not the main WorkBuddy session where XDF users wait on sre-aihub Trust. Keep prewarm on **settings** or **plugin hooks**.

## Recommended stack for XDF

```text
~/.workbuddy/settings.json  SessionStart  ──►  workbuddy-template-prewarm
        │
        ├── stacks with existing teamai hooks (do not replace)
        └── injects additionalContext → BaaS-first + minimal-web-baas-demo pointer

Expert Agent markdown (prompt only)
        └── no frontmatter hooks; points to skill minimal-web-baas-demo
```
