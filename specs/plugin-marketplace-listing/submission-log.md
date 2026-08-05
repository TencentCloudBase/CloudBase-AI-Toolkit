# Marketplace submission log

Track manual publisher / listing applications. Update when status changes.

## Cursor Marketplace

| Field | Value |
|-------|-------|
| Status | **Publisher application submitted** (awaiting review) |
| Submitted at | 2026-07-28 |
| Form | https://cursor.com/marketplace/publish |
| Organization | Tencent CloudBase |
| Handle | `@tencent-cloudbase` |
| Contact | bookerzhao@tencent.com |
| Website | https://cloudbase.net |
| Repo | https://github.com/TencentCloudBase/CloudBase-AI-Toolkit |
| Logo | https://raw.githubusercontent.com/TencentCloudBase/CloudBase-AI-Toolkit/main/plugin/cloudbase/assets/logo.png |
| Confirmation UI | "Thanks for applying" — follow-up via marketplace-publishing@cursor.com |
| Listed yet? | No |

### How to check progress

Cursor does **not** show an in-page application dashboard after submit. Use:

1. **Email** — watch `bookerzhao@tencent.com` (and spam) for `marketplace-publishing@cursor.com`
2. **Reply to that thread** if you need status / more materials
3. **Marketplace browse** — after approval, search https://cursor.com/marketplace for `CloudBase` / `cloudbase`
4. **Re-open publish page** — https://cursor.com/marketplace/publish (may show publisher state after approval; today it mainly accepts new applications)
5. **Escalate** — email `marketplace-publishing@cursor.com` with org name + repo URL if no reply in ~1–2 weeks

When live: set `markets.yaml` `listing_statuses.official_curated: listed`, check the checklist box, re-run `npm run analyze:plugin-marketplaces`.

## Claude Community

| Field | Value |
|-------|-------|
| Status | **Deferred** (2026-07-28) — human cannot submit yet; packet kept ready |
| Form | https://platform.claude.com/plugins/submit |
| Packet | `specs/plugin-marketplace-listing/claude-submission-packet.md` |
| Repo | https://github.com/TencentCloudBase/CloudBase-AI-Toolkit |
| Plugin path | `plugin/cloudbase` |

### How to check progress (Claude)

1. After submit, watch for Anthropic review email / Console submission status.
2. Search community catalog nightly sync: https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json
3. Install test: `claude plugin marketplace add anthropics/claude-plugins-community` then `claude plugin install cloudbase@claude-community` (name may vary after listing).

## Grok Build

| Field | Value |
|-------|-------|
| Status | **PR opened** — conflict resolved 2026-07-29; awaiting xAI review |
| PR | https://github.com/xai-org/plugin-marketplace/pull/151 |
| Source repo | https://github.com/TencentCloudBase/cloudbase-plugin.git |
| Pinned SHA | `b615a7f8bfad6637f2297e1a993d29f6a292a13d` |
| Submitted at | 2026-07-28 |

### How to check progress (Grok)

1. Watch PR #151 CI + review comments: https://github.com/xai-org/plugin-marketplace/pull/151
2. After merge, confirm entry in https://github.com/xai-org/plugin-marketplace/blob/main/.grok-plugin/marketplace.json
3. Install / browse from Grok Build marketplace UI

## cursor.directory

| Field | Value |
|-------|-------|
| Status | **Submitted** — page live, plugin being verified |
| Listing URL | https://cursor.directory/plugins/cloudbase |
| Form | https://cursor.directory/plugins/new |
| Packet | `specs/plugin-marketplace-listing/cursor-directory-submission-packet.md` |
| Repo | https://github.com/TencentCloudBase/cloudbase-plugin |
| Submitted at | 2026-07-28 |
| Detected | MCP 1 · Agents 2 · Skills 28 · Commands 4 · Hooks 1 |

### How to check progress (cursor.directory)

1. Open https://cursor.directory/plugins/cloudbase — wait until “Plugin is being verified” clears
2. Search https://cursor.directory/?q=cloudbase
3. Flip `markets.yaml` `cursor-directory.community_directory` → `listed` when fully verified

## Awesome Copilot (VS Code / Copilot default marketplace)

| Field | Value |
|-------|-------|
| Status | **Intake re-passed** — awaiting maintainer re-review (`ready-for-review`) |
| Issue | https://github.com/github/awesome-copilot/issues/2459 |
| Packet | `specs/plugin-marketplace-listing/awesome-copilot-submission-packet.md` |
| Response | `specs/plugin-marketplace-listing/awesome-copilot-rejection-response.md` |
| Source | `TencentCloudBase/cloudbase-plugin` @ `4082ba957d41f8fc6545411d8a929884ab88980c` |
| Submitted at | 2026-07-28 |
| Rejected at | 2026-08-04 (security: agent-directed remote skill fetch) |
| Re-run at | 2026-08-05 (`/rerun-intake` after stripping `cnb.cool/.../git/raw` skill URLs; intake passed) |

### How to check progress (Awesome Copilot)

1. Watch issue #2459 labels / comments
2. After merge, confirm entry in https://github.com/github/awesome-copilot/blob/main/plugins/external.json
3. Install test: `copilot plugin install cloudbase@awesome-copilot`

## Trae community MCP list

| Field | Value |
|-------|-------|
| Status | **Merged / listed** — community README catalog |
| PR | https://github.com/trae-community/trae-mcp/pull/4 |
| Merged at | 2026-08-05 |
| Submitted at | 2026-07-28 |
| Catalog | https://github.com/trae-community/trae-mcp/blob/main/README.md |
| Note | Community README list (not Trae official in-app marketplace) |

### How to check progress (Trae community MCP)

1. Confirm CloudBase row in https://github.com/trae-community/trae-mcp/blob/main/README.md
2. Watch official marketplace outreach: https://github.com/trae-community/trae-mcp/issues/5

## Trae community Skills

| Field | Value |
|-------|-------|
| Status | **Merged / listed** — community skills catalog |
| PR | https://github.com/trae-community/trae-skills/pull/20 |
| Merged at | 2026-08-05 |
| Skill | `skills/cloudbase/SKILL.md` (Trae MCP-first entry skill) |
| Submitted at | 2026-07-28 |
| Catalog | https://github.com/trae-community/trae-skills/blob/main/README.md |
| Note | Community skills catalog (not Trae official in-app marketplace) |

### How to check progress (Trae community Skills)

1. Confirm catalog row in https://github.com/trae-community/trae-skills/blob/main/README.md
2. Watch official skills marketplace outreach: https://github.com/trae-community/trae-skills/issues/21

### 2026-08-05 — Trae community MCP + Skills approved

- Trae community maintainer YeatsLiao approved and merged both PRs the same day.
- MCP: https://github.com/trae-community/trae-mcp/pull/4 (`good MCP :)`)
- Skills: https://github.com/trae-community/trae-skills/pull/20 (`good SKILL :)`)
- Flip `markets.yaml` `community_directory` → `listed` for `trae-mcp-marketplace` and `trae-work-skills-marketplace`.
- Closed conflicting docs PR #876 as superseded by already-merged #877 (Awesome Copilot intake status).

### 2026-08-05 — Trae official in-app MCP / Skills marketplace outreach

| Field | Value |
|-------|-------|
| Status | **Outreach initiated** — awaiting Trae product / community reply |
| Packet | `specs/plugin-marketplace-listing/trae-official-outreach-packet.md` |
| MCP GitHub ask | https://github.com/trae-community/trae-mcp/issues/5 |
| Skills GitHub ask | https://github.com/trae-community/trae-skills/issues/21 |
| PR follow-ups | [mcp#4 comment](https://github.com/trae-community/trae-mcp/pull/4#issuecomment-5189097225) · [skills#20 comment](https://github.com/trae-community/trae-skills/pull/20#issuecomment-5189097487) |
| Forum (human) | Draft in packet → 社区伙伴 / 产品建议 / TraeWork 专区 |
| Note | Community listed ≠ official curated. Forum https://forum.trae.cn/t/topic/171994 indicates personal Skill upload is not global marketplace publish. |

### How to check progress (Trae official in-app markets)

1. Watch replies on trae-mcp#5 and trae-skills#21
2. After human posts forum draft, record thread URL here
3. When Trae accepts curation, flip `official_curated` → `listed` in `markets.yaml` and re-run `npm run analyze:plugin-marketplaces`

### 2026-07-29 — CodeBuddy official marketplace sync (CNB staging)

- **Staging repo (CNB):** https://cnb.cool/tencent/cloud/cloudbase/codebuddy-marketplace
- **Branch:** `sync/cloudbase-v2.25.0` (commit `f95b126`, based on upstream `codebuddy/marketplace` main)
- **Staging `main`:** force-aligned to upstream tip `8ae4a25` (clean base for compare)
- **Diff preview:** https://cnb.cool/tencent/cloud/cloudbase/codebuddy-marketplace/-/compare/main...sync/cloudbase-v2.25.0
- **Target:** https://cnb.cool/codebuddy/marketplace (`plugins/cloudbase` + marketplace.json entry → v2.25.0, keep `rules/cloudbase_rules.md`)
- **Blocker:** local CNB token can push to staging but lacks `repo-pr:rw` (and cannot write PRs into `codebuddy/marketplace`). Open cross-repo PR in CNB UI, or ask CodeBuddy maintainers to pull the staging branch.
- **Payload source:** `npx tsx scripts/sync-codebuddy-plugin.ts` → `config/codebuddy-plugin`

### 2026-07-29 — CodeBuddy marketplace fork sync (ready for PR)

- **Fork (CNB):** https://cnb.cool/tencent/cloud/cloudbase/marketplace (forked from `codebuddy/marketplace`)
- **Note:** Path is `marketplace`, not `codebuddy-marketplace`
- **Branch:** `sync/cloudbase-v2.25.0` @ `4a60074` (v2.25.0, keep `rules/cloudbase_rules.md`, 133 files)
- **Compare / Create PR:** https://cnb.cool/tencent/cloud/cloudbase/marketplace/-/compare/main...sync/cloudbase-v2.25.0
- **Target:** `codebuddy/marketplace:main`
- **Blocker:** CNB token can push to fork but lacks `repo-pr:rw` (cannot open PR via API)

### 2026-07-29 — CodeBuddy marketplace PR submitted

- **PR:** https://cnb.cool/codebuddy/marketplace/-/pulls/19
- **Title:** feat(cloudbase): sync CloudBase plugin v2.25.0 and keep rules
- **From:** https://cnb.cool/tencent/cloud/cloudbase/marketplace `main` (`0cde7d0`, author bookerzhao)
- **To:** `codebuddy/marketplace:main`
- **Status:** open / awaiting maintainer review

### 2026-07-29 — Grok PR #151 conflict fixed

- Rebased/merged upstream `main` into `binggg/plugin-marketplace:add-cloudbase-plugin`
- Kept upstream `tinyfish` entry + CloudBase listing (pin `b615a7f`)
- Regenerated `.grok-plugin/plugin-index.json`
- PR: https://github.com/xai-org/plugin-marketplace/pull/151

### 2026-07-29 — PR body hygiene pass

- Rule: always fill target-repo PR/issue template / CONTRIBUTING checklist (see `submission-checklist.md` → “PR / issue body hygiene”).
- **Grok #151:** rewritten to official Ownership / Checklist / Security template.
- **Trae MCP #4:** body updated to CONTRIBUTING PR Checklist.
- **Trae Skills #20:** body updated to full CONTRIBUTING Pull request checklist.
- **Awesome Copilot #2459:** already has Submission checklist (issue form) — OK.
- **CodeBuddy CNB #19:** body still short (“AI-generated…”); token cannot PATCH upstream PR — edit in CNB UI if needed.

## QoderWork Plugin

| Field | Value |
|-------|-------|
| Status | **Submitted** — awaiting review |
| Package | `dist/cloudbase-qoder-v0.2.0.zip` |
| Guide / copy | `plugin/cloudbase/docs/qoder-submit.md` |
| Channel | QoderWork → Extensions → Plugin / Expert Kits |
| Submitted at | 2026-07-30 |
| Listed yet? | No |

### How to check progress (QoderWork Plugin)

1. QoderWork → **设置 → 我的发布**
2. After live, search marketplace for `CloudBase` / `cloudbase`
3. Flip `markets.yaml` `qoder-plugin.self_marketplace` → `listed`

## QoderWork Skill

| Field | Value |
|-------|-------|
| Status | **Submitted** — awaiting review |
| Package | `dist/cloudbase-skill-v2.25.1.zip` |
| Skill id | `cloudbase` |
| Guide / copy | `plugin/cloudbase/docs/qoder-submit.md` (Skill section) |
| Channel | QoderWork → Extensions → Skills |
| Submitted at | 2026-07-30 |
| Listed yet? | No |

### How to check progress (QoderWork Skill)

1. QoderWork → **设置 → 我的发布**
2. After live, confirm Skill marketplace entry for `cloudbase`
3. Flip `markets.yaml` `qoder-plugin.mcp_or_skill_registry` → `listed`

