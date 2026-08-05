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
| Trae MCP | Community list merged: [trae-community/trae-mcp#4](https://github.com/trae-community/trae-mcp/pull/4). Official IDE in-app MCP marketplace still partner-only. | Watch [trae-mcp#5](https://github.com/trae-community/trae-mcp/issues/5); human posts forum draft from `trae-official-outreach-packet.md`. |
| Trae Skills | Community skills merged: [trae-community/trae-skills#20](https://github.com/trae-community/trae-skills/pull/20). Forum confirms personal upload ≠ global market publish. | Watch [trae-skills#21](https://github.com/trae-community/trae-skills/issues/21); package zip/`.skill` if Trae requests. |
| Qoder / QoderWork | No public third-party plugin submit docs found in this pass. | Keep `needs_partner_outreach`; monitor Qoder docs / BD. |
| CodeBuddy | CloudBase already deep-integrated; may already be listed/native. | Confirm with CodeBuddy PM whether catalog entry is needed vs built-in. |
| Kimi Code | No clear public third-party listing path. | Outreach / watch docs. |
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
