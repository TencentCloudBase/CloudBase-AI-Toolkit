# Awesome Copilot rejection response (#2459)

## Status

| Field | Value |
|-------|-------|
| Issue | https://github.com/github/awesome-copilot/issues/2459 |
| Rejected at | 2026-08-04 |
| Maintainer | aaronpowell |
| Root cause | Agent-directed remote skill fetch via `cnb.cool/.../git/raw/...` URLs in every skill |
| Remediation | Source-level strip of remote skill-fetch (this document) |
| Resubmit path | Done 2026-08-05 — SHA `4082ba957d41f8fc6545411d8a929884ab88980c`; intake passed; label `ready-for-review` |

## Rejection (verbatim)

> Each skill includes a way for an agent to have an injection attack presented as it tells it to go to an external endpoint and pull more skills, which opens to gate for session hijacking. While there are gates defined it's not guaranteed that the agent would adhere to them.

## Root cause

Every packaged skill had a **Standalone Install Note** plus inline `(standalone fallback: https://cnb.cool/.../git/raw/...)` links that instruct agents to HTTP-fetch sibling skill markdown from a mutable remote when local siblings are missing.

Awesome Copilot installs the **full plugin**, so remote sibling fetch is unnecessary and fails the marketplace security bar.

## Remediation plan

1. **Source skills** (`config/source/skills/**/SKILL.md`) — **done**
   - Replace Standalone Install Note with `## Sibling skills (local only)`
   - Forbid agent HTTP fetch of skill/protocol markdown into context
   - If siblings missing: ask the user to install the full skills pack / plugin
   - Strip all `standalone fallback:` raw URLs
   - Keep human `docs.cloudbase.net` references
2. **Guideline / templates** — **done**
   - `config/source/guideline/cloudbase/SKILL.md`
3. **Tests** — **done**
   - Invert `tests/single-skill-fallback-links.test.js` to assert **absence** of skill raw-fetch URLs
4. **Mirrors / plugin** — **done**
   - Sync `config/.claude/skills` from source
   - Update `plugin/cloudbase/skills` in the same change (marketplace payload)
   - Scrub `plugin/cloudbase/cloudbase-session.md` remote-pull wording
5. **Ship** — **done**
   - Published immutable SHA on `TencentCloudBase/cloudbase-plugin`: `4082ba957d41f8fc6545411d8a929884ab88980c`
   - Acceptance: `rg 'cloudbase-skills/-/git/raw' plugin/cloudbase/skills` → zero matches
6. **Resubmit** — **done**
   - Edit #2459 Commit SHA → `4082ba957d41f8fc6545411d8a929884ab88980c`
   - Comment remediation summary + `/rerun-intake` (2026-08-05)
   - Intake re-passed; `rejected` removed; label `ready-for-review`

## Explicit non-goals

- Bare appeal without code change
- Plugin-only strip that leaves skills-repo unsafe
- Opening a brand-new submission issue before fixing

## Self-install fallback (if curated listing stays hard)

Documented separately for Copilot users:

```bash
npx @github/copilot-cli plugins add TencentCloudBase/cloudbase-plugin --target github-copilot
```

(Exact CLI may vary by Copilot surface; keep `doc` / README self-marketplace paths current.)
