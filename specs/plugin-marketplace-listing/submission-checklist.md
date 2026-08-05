# Manual Submission Checklist

Generated companion to `npm run analyze:plugin-marketplaces`.
**Do not auto-submit** — complete these steps manually after packaging is ready.

Repo to submit: `https://github.com/TencentCloudBase/CloudBase-MCP`

## PR / issue body hygiene (mandatory)

Before opening or editing any marketplace PR/issue:

1. **Read the target repo template first** — `.github/PULL_REQUEST_TEMPLATE.md`, issue forms, or `CONTRIBUTING.md` PR checklist.
2. **Fill that template**, not a generic Cursor “Summary / Test plan” body.
3. Tick Ownership / Checklist / Security (or whatever the repo names them) with honest `[x]` / `[ ]`.
4. Keep pinned SHAs, versions, and links current when you amend the PR.
5. If CI needs first-time workflow approval, say so explicitly in the body or a follow-up comment.

Examples of good targets:

| Market | Template source |
|--------|-----------------|
| Grok Build | `xai-org/plugin-marketplace` `.github/PULL_REQUEST_TEMPLATE.md` |
| Trae MCP | `trae-community/trae-mcp` `CONTRIBUTING.md` → PR Checklist |
| Trae Skills | `trae-community/trae-skills` `CONTRIBUTING.md` → Pull request checklist |
| Awesome Copilot | issue form + Submission checklist section |
| CodeBuddy CNB | no fixed template — still include Summary + Checklist + Notes |

## Ready now

### 1. Claude Code — Community marketplace

- [x] Run `claude plugin validate` against `plugin/cloudbase` (or install from this repo marketplace and smoke-test)
- [x] Confirm public repo URL: `TencentCloudBase/CloudBase-MCP` (GitHub may redirect to `CloudBase-AI-Toolkit`)
- [ ] **Deferred** — submit when login available (packet: `claude-submission-packet.md`):
  - https://platform.claude.com/plugins/submit
  - https://claude.ai/admin-settings/directory/submissions/plugins/new
- [ ] After approval, verify entry appears in `anthropics/claude-plugins-community` catalog
- [ ] Note: official `claude-plugins-official` has **no** public application (partner / Anthropic discretion)

### 2. Cursor Marketplace

- [x] Confirm manifests exist:
  - `.cursor-plugin/marketplace.json` (repo root)
  - `plugin/cloudbase/.cursor-plugin/plugin.json`
  - `plugin/cloudbase-sites/.cursor-plugin/plugin.json`
  - `plugin/cloudbase/mcp.json`
  - `plugin/cloudbase/assets/logo.png` (+ sites)
- [x] Command/skill/agent frontmatter quality gate (`npm run check:plugin-quality`)
- [ ] Local test (optional): symlink plugin into `~/.cursor/plugins/local/cloudbase` and restart Cursor
- [x] Submit publisher application at https://cursor.com/marketplace/publish (2026-07-28)
  - Org: Tencent CloudBase (`@tencent-cloudbase`)
  - Contact: bookerzhao@tencent.com
  - Repo: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit
  - Confirmation: "Thanks for applying" — awaiting `marketplace-publishing@cursor.com`
- [ ] After approval: verify listing appears on https://cursor.com/marketplace
- [x] Secondary listing: cursor.directory submitted (2026-07-28)
  - Live (verifying): https://cursor.directory/plugins/cloudbase
  - Repo: https://github.com/TencentCloudBase/cloudbase-plugin
- [ ] After cursor.directory verification: mark `markets.yaml` → `listed`

### 3. Codex / ChatGPT — git marketplace (ready) vs Universal portal (blocked)

**Git marketplace (App / CLI sparse):**

- [x] Confirm `.agents/plugins/marketplace.json` (preferred) + root `marketplace.json` + `plugin/cloudbase/.codex-plugin/plugin.json`
- [x] Logo + privacy/terms URLs present on Codex interface

**Universal Plugins Directory portal (separate track):**

- [ ] Host public MCP HTTPS URL + domain verification (current packaging is local `npx` — not portal-ready)
- [ ] Prepare listing assets + 5 positive / 3 negative test cases
- [ ] Verified OpenAI org identity + Apps Management write
- [ ] Submit via https://developers.openai.com/plugins/deploy/submission

### 4. Grok Build marketplace

- [x] Prefer remote source `https://github.com/TencentCloudBase/cloudbase-plugin.git` (not monorepo root)
- [x] Open PR to https://github.com/xai-org/plugin-marketplace — https://github.com/xai-org/plugin-marketplace/pull/151 (2026-07-28)
- [x] Add remote catalog entry pinned to SHA `b615a7f8bfad6637f2297e1a993d29f6a292a13d`
- [x] Regenerate `.grok-plugin/plugin-index.json` + validate-catalog
- [x] PR body rewritten to official Ownership / Checklist / Security template (2026-07-29)
- [x] Conflict with upstream `tinyfish` resolved; asked maintainers to Approve workflows
- [ ] Await xAI review / merge (`Validate catalog` may need maintainer workflow approval)
- [ ] After merge: confirm catalog entry live; mark `markets.yaml` listed
- [x] Brand-scoped keywords/domains only

### 5. VS Code / Copilot agent plugins

- [x] Users can already add this repo / `cloudbase-plugin` as a marketplace source
- [x] Awesome Copilot external plugin issue opened — https://github.com/github/awesome-copilot/issues/2459 (2026-07-28)
- [x] Rejection response documented — `awesome-copilot-rejection-response.md` (remote skill-fetch)
- [x] Strip remote skill-fetch URLs, sync plugin SHA, `/rerun-intake` on #2459 (intake passed 2026-08-05)
- [ ] Await Awesome Copilot maintainer review → entry in `plugins/external.json`
- [ ] Optional later: PR to official `github/copilot-plugins` (mostly Microsoft-curated; lower priority)
- [x] Prefer documenting `npx plugins add TencentCloudBase/cloudbase-plugin --target vscode` / `github-copilot`

### 6. Trae community MCP list

- [x] Open PR to https://github.com/trae-community/trae-mcp — https://github.com/trae-community/trae-mcp/pull/4 (2026-07-28)
- [x] PR body aligned to CONTRIBUTING PR Checklist (2026-07-29)
- [x] Merged 2026-08-05 — mark `trae-mcp-marketplace.community_directory` listed
- [x] Official Trae in-app MCP marketplace outreach started — https://github.com/trae-community/trae-mcp/issues/5 + `trae-official-outreach-packet.md` (2026-08-05)
- [ ] Await Trae reply; then mark `official_curated` listed if accepted
- [ ] Human: post forum draft (社区伙伴 / 产品建议) from outreach packet

### 6b. Trae community Skills

- [x] Open PR to https://github.com/trae-community/trae-skills — https://github.com/trae-community/trae-skills/pull/20 (2026-07-28)
- [x] PR body aligned to CONTRIBUTING Pull request checklist (2026-07-29)
- [x] Merged 2026-08-05 — mark `trae-work-skills-marketplace.community_directory` / `mcp_or_skill_registry` listed
- [x] Official Trae Work skills marketplace outreach started — https://github.com/trae-community/trae-skills/issues/21 + packet (2026-08-05)
- [ ] Await Trae reply; then mark `official_curated` listed if accepted
- [ ] Human: post forum draft (TraeWork 专区 / 社区伙伴) from outreach packet

### 6c. CodeBuddy official marketplace (CNB)

- [x] Fork + sync PR — https://cnb.cool/codebuddy/marketplace/-/pulls/19 (2026-07-29)
- [ ] Enrich PR description with Summary + Checklist if CNB UI allows edit (API token cannot PATCH target PR)
- [ ] Await merge; then mark `codebuddy-plugin` curated listed
- **Future sync to fork:** `npm run sync:codebuddy-marketplace`
  - Regenerates skills, overlays `config/codebuddy-plugin` onto fork `plugins/cloudbase` (keeps `rules/`), bumps catalog entry, pushes fork `main`
  - Fork: https://cnb.cool/tencent/cloud/cloudbase/marketplace
  - Upstream PR still needs CNB UI / `repo-pr:rw` (script does not open upstream PR)
  - Dry-run: `npm run sync:codebuddy-marketplace -- --dry-run`

### 7. Qoder / QoderWork plugin + skill package

- [x] Generate `.qoder-plugin/plugin.json` via `node scripts/build-open-plugin-spec.mjs`
- [x] Pack Plugin zip: `npm run pack:qoder-plugin` → `dist/cloudbase-qoder-v0.2.0.zip`
- [x] Pack Skill zip: `npm run pack:qoder-skill` → `dist/cloudbase-skill-v2.25.1.zip`
- [x] Submit guide + copy: `plugin/cloudbase/docs/qoder-submit.md`
- [x] **QoderWork:** Plugin submitted (2026-07-30) — awaiting review
- [x] **QoderWork:** Skill submitted (2026-07-30) — awaiting review
- [ ] **Qoder CN AppHub (optional):** https://qoder.com.cn/account/apphub-publications
- [ ] After live: mark `qoder-plugin` `self_marketplace` / `mcp_or_skill_registry` → `listed` in `markets.yaml`

## Needs partner outreach (do not fake as ready)

| Market | Action |
|--------|--------|
| Claude Official curated | Wait for / request Anthropic partnership |
| Trae official MCP marketplace | Outreach opened: trae-mcp#5 + packet; still need product reply / forum BD post |
| Trae Work skills marketplace | Outreach opened: trae-skills#21 + packet; forum confirms upload ≠ global publish |
| Qoder Featured / curated | After community submit, ask for Featured if needed |
| QoderWork Connector | Only if HTTPS+OAuth CloudBase MCP is in scope |
| CodeBuddy / CodeBuddy Code | Await CNB #19 merge; built-in may still need PM sync |
| Kimi Code Official / Third-party tabs | Confirm curated listing with Moonshot |
| MiniMax Agent marketplace | No public submit form yet — monitor + outreach |

## After each submission

1. Update `markets.yaml` status (`submittable` → `listed` when live)
2. Bump `last_reviewed_at`
3. Re-run `npm run analyze:plugin-marketplaces`
4. Commit updated `reports/latest.*`
