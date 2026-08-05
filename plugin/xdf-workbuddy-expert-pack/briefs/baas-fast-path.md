# Minimal Web BaaS — partner brief pointer

This file is the **compact pointer** shipped with the XDF / WorkBuddy expert pack.
The full contract lives in the skill:

| Surface | Path / id |
| --- | --- |
| Source skill | `config/source/skills/minimal-web-baas-demo/SKILL.md` |
| Skill id | `minimal-web-baas-demo` |
| Claude mirror | `config/.claude/skills/minimal-web-baas-demo/SKILL.md` |
| Expert agent | `../agents/cloudbase-baas-expert.md` |

## One-screen contract

Stack order: **Web SDK CRUD > MCP schema > template warmup > cloud functions**.

1. **Connector:** pre-enable CloudBase MCP when the host allows; otherwise shortest Trust path.
2. **Warm template during credential wait:** SessionStart prewarm (settings/plugin) or MCP `downloadTemplate` + install. After ready, prewarm starts Sites `preview` (ports 17173..17272) — never guess 5173.
3. **Capability sniff:** `envQuery(action="info")` → lock **one** DB plane (NoSQL / PG / MySQL).
4. **Schema / admin:** MCP only (NoSQL structure tools or PG manage/migrate).
5. **Reads / writes:** `@cloudbase/js-sdk` in the browser (`app.database()` or `app.rdb()`).
6. **Preview first:** local list + add before hosting / custom domain.
7. **Cloud functions:** forbidden for Todo / Notes / Chat / Kanban / 最小前后端 demo unless secrets, cron, or rules-cannot-express.

Reusable beyond XDF: any WorkBuddy / CodeBuddy / ISV partner can point expert prompts at skill id `minimal-web-baas-demo` instead of maintaining a private full skill dump.

## Agent routing line (paste into partner system prompt if needed)

```text
For 最小前后端 / Lovable-like demos, FIRST call:
  searchKnowledgeBase(mode="skill", skillName="minimal-web-baas-demo")
then Read the returned path. Do not rely only on ad-hoc BaaS brief text in the
expert prompt. Order: connector → template warmup during credential wait →
envQuery → lock DB → MCP schema → @cloudbase/js-sdk CRUD → preview.
Do not dump all CloudBase skills. Do not create cloud functions for CRUD.
```

## Host packaging

| Host capability | What to ship |
| --- | --- |
| WorkBuddy SessionStart | Merge `../settings.snippet.json` (rendered) into `~/.workbuddy/settings.json` |
| Plugin marketplace | Enable sibling `workbuddy-template-prewarm` (`hooks/hooks.json`) — no frontmatter allowlist |
| Expert Agent only | Ship `cloudbase-baas-expert.md` **without** frontmatter hooks; keep portable §1b warmup |

See `../HOOKS.md` for why frontmatter hooks are not used.
