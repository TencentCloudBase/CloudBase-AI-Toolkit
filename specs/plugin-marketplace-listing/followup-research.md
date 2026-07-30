# Follow-up research notes

Generated: 2026-07-27

Companion to `submission-checklist.md`. Engineering packaging is in PR #823; this note covers **manual submission** constraints and **optional** next research.

## 1. Manual submissions — what an agent can / cannot do

| Market | Agent can do | Needs human (login / org auth) |
|--------|--------------|--------------------------------|
| Claude Community | `claude plugin validate`; draft repo URL + description | Submit at [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit) or [claude.ai admin form](https://claude.ai/admin-settings/directory/submissions/plugins/new) |
| Cursor Marketplace | Confirm `.cursor-plugin/*` present; draft listing copy | Submit repo at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) (manual review) |
| Codex Universal Directory | Prepare short/long description, logo paths, test cases | OpenAI [plugin submission portal](https://developers.openai.com/plugins/deploy/submission) (account + assets) |
| Grok Build | Draft catalog entry + regenerate index on a fork PR | Fork `xai-org/plugin-marketplace`, open PR (CI + code owners) |

**Recommendation:** After PR #823 merges to `main`, pin Grok remote `sha` to that merge commit and open the Grok PR. Do not pin a moving branch.

### Draft Grok catalog entry (after merge)

```json
{
  "name": "cloudbase",
  "description": "Tencent CloudBase platform plugin: AI models, auth, databases, cloud functions, storage, CloudRun, and Mini Program workflows via MCP + skills.",
  "category": "developer-tools",
  "source": {
    "source": "url",
    "url": "https://github.com/TencentCloudBase/CloudBase-AI-Toolkit.git",
    "sha": "<FULL_40_CHAR_SHA_AFTER_MERGE>"
  },
  "homepage": "https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ai-agent-plugins",
  "keywords": [
    "cloudbase",
    "tencent cloudbase",
    "cloudbase mcp"
  ],
  "domains": [
    "cloudbase.net",
    "tencent.com"
  ]
}
```

Notes from Grok CONTRIBUTING:

- Prefer official org source (`TencentCloudBase/...`) — we already do.
- Pin full 40-char SHA only (no branch/tag).
- Run `python3 scripts/generate-plugin-index.py` and `validate-catalog.py` before PR.
- Keep keywords brand-scoped (avoid generic `database` / `deploy`).

They accept `.claude-plugin/plugin.json` for Claude-ecosystem plugins; our repo also has Codex/Cursor manifests. Confirm whether their indexer expects plugin at repo root vs `plugin/cloudbase` path — **open question**: remote URL may need a path field if supported; sample entries point at dedicated single-plugin repos (e.g. `vercel/vercel-plugin`). If Grok only discovers root-level manifests, prefer pointing at `TencentCloudBase/cloudbase-plugin` (OPS dedicated repo) **or** vendor under `external_plugins/`. Validate against their schema before submitting.

## 2. Partner outreach (continued research)

| Market | Finding | Next action |
|--------|---------|-------------|
| Trae MCP | Community list: [trae-community/trae-mcp](https://github.com/trae-community/trae-mcp) — PRs add rows to README MCP table. Official IDE also has in-app MCP marketplace (publisher onboarding unclear). | Open PR to `trae-mcp` listing `@cloudbase/cloudbase-mcp` / docs; separately ask Trae for curated marketplace inclusion. |
| Trae Skills | Separate from MCP (`README-skills.md` / Trae skills docs). | Confirm whether CloudBase skills map to Trae Agent Skills format; may need a thin adapter + second PR. |
| Qoder IDE | In-product plugin market + CN community hub https://qoder.com.cn/marketplace ; packaging `.qoder-plugin/plugin.json`. | Package adapter + submit via AppHub publications; Featured may need BD. |
| QoderWork | **Self-serve** Skill/Plugin/Connector/Workbench marketplace. Guidelines: https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines | **Do next:** submit CloudBase as Plugin (skills + optional MCP). Defer Connector (needs HTTPS+OAuth). |
| CodeBuddy | CNB marketplace sync PR open; sync script on Toolkit. | Await merge of https://cnb.cool/codebuddy/marketplace/-/pulls/19 ; use `npm run sync:codebuddy-marketplace` for later refreshes. |
| Kimi Code | `/plugins` Official/Third-party/Custom; GitHub/zip/custom marketplace JSON supported. Curated tab process undocumented. | Verify GitHub install; ask Moonshot for Official/Third-party listing. |
| MiniMax Agent | Custom MCP + MCP Builder; marketplace reuse mentioned in changelog; no public publisher URL found (2026-07-30). | Manual MCP smoke-test; monitor docs; partner outreach if catalog opens. |
| Claude Official curated | No application; Anthropic discretion only. | Do not treat as submittable. |

## 3. Lightweight dedicated marketplace repo (optional)

**Problem:** Full clone of CloudBase-AI-Toolkit is large; Codex `--sparse` helps but users still forget flags / App UI may full-clone.

**Pattern (from Codex docs):** A marketplace can be a **separate Git repo** whose `.agents/plugins/marketplace.json` points at plugin sources (local paths in that repo, or other remotes if supported). Dedicated OPS repos already exist (`cloudbase-plugin`, `cloudbase-sites-plugin`) but intentionally **omit** marketplace metadata so `npx plugins` does not treat them as marketplaces.

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| A. Keep monorepo + document sparse | Already shipping in #823 | Weak-network full clone still painful if UI ignores sparse |
| B. New `TencentCloudBase/cloudbase-plugins` marketplace-only repo | Tiny clone; Codex/Claude App friendly | Extra CI sync; dual source of truth for marketplace JSON |
| C. Add marketplace.json to dedicated plugin repos | Simple per-plugin install | Breaks current OPS-only contract for `npx plugins add` |

**Recommendation:** Prefer **B** if App-path installs keep failing without sparse; wire CI next to `push-plugin-repos.yaml` to sync `.agents/plugins/marketplace.json` + `plugin/*` copies (or git submodules / sparse subtree). Until then, A is enough.

**Do not** history-rewrite / force-push the monorepo unless explicitly approved — tip GIF removal helps tree size but pack size stays large without rewrite.

## 4. Immediate human checklist (post-merge)

1. Claude: open submit form with `https://github.com/TencentCloudBase/CloudBase-AI-Toolkit` (or path to `plugin/cloudbase` if form asks for plugin root).
2. Cursor: submit same repo URL at marketplace publish.
3. Grok: fork + draft entry with merged SHA; clarify root vs `plugin/cloudbase` discovery.
4. Codex Universal: gather logo + privacy/terms + test cases, then portal.
5. Trae: PR to `trae-community/trae-mcp`.
6. Re-run `npm run analyze:plugin-marketplaces` and flip statuses in `markets.yaml`.
