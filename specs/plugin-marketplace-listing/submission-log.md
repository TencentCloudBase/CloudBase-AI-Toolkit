# Marketplace submission log

Track manual publisher / listing applications. Update when status changes.

## Official MCP Registry

| Field | Value |
|-------|-------|
| Status | **Listed** (hosted remotes; npm `packages[]` pending next npm release) |
| Registry name | `io.github.TencentCloudBase/cloudbase-mcp` |
| Version | `2.27.0` |
| Search | https://registry.modelcontextprotocol.io/v0/servers?search=cloudbase |
| npm package | `@cloudbase/cloudbase-mcp` (referenced in description; `mcpName` added in repo, not yet on npm 2.27.0) |
| Publisher | GitHub org `TencentCloudBase` (admin `binggg`, public membership) |
| Published at | 2026-08-17T08:25:05Z |
| Follow-up | Next `npm publish` (tag) runs `publish-mcp-registry` in `.github/workflows/npm-publish.yaml` and attaches `packages[]` |
| Local package contract | `packages[]` (stdio / npx) declares **no** `environmentVariables` — interactive login works with zero env; remotes still require hosted credentials |

### How to check progress (Official MCP Registry)

1. `curl -sS "https://registry.modelcontextprotocol.io/v0/servers?search=cloudbase"` — `metadata.count` must be ≥ 1
2. Confirm `server.name` is `io.github.TencentCloudBase/cloudbase-mcp` and description mentions `@cloudbase/cloudbase-mcp`
3. After the next npm release, confirm `packages[0].identifier` is `@cloudbase/cloudbase-mcp`
4. Aggregators: Glama and PulseMCP already had GitHub-indexed CloudBase listings as of 2026-08-17; they should pick up the official registry name after ingest

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
| Status | **PR mergeable** — conflict re-resolved 2026-08-13; CI green; awaiting xAI review |
| PR | https://github.com/xai-org/plugin-marketplace/pull/151 |
| Source repo | https://github.com/TencentCloudBase/cloudbase-plugin.git |
| Pinned SHA | `b615a7f8bfad6637f2297e1a993d29f6a292a13d` |
| Submitted at | 2026-07-28 |

### How to check progress (Grok)

1. Watch PR #151 CI + review comments: https://github.com/xai-org/plugin-marketplace/pull/151
2. After merge, confirm entry in https://github.com/xai-org/plugin-marketplace/blob/main/.grok-plugin/marketplace.json
3. Install / browse from Grok Build marketplace UI

### 2026-08-13 — Grok PR #151 conflict re-resolved

- Upstream `main` moved again (daily pin bumps + mongodb reformat + new `mongodb-atlas`/`base44` entries), making PR #151 conflicting.
- Merged latest `main` into `binggg/plugin-marketplace:add-cloudbase-plugin` (commit `d6b9848`), kept cloudbase pin `b615a7f`, adopted upstream mongodb changes, regenerated `plugin-index.json`.
- `mergeable: MERGEABLE`, `mergeStateStatus: BLOCKED` (needs maintainer review/approve). All CI checks pass (Socket Security, semgrep).
- Left comment asking for review: https://github.com/xai-org/plugin-marketplace/pull/151#issuecomment-5275877974

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
| Status | **Re-submitted #2645 — intake passed, ready-for-review; awaiting maintainer `/approve` to create listing PR** |
| Issue | https://github.com/github/awesome-copilot/issues/2459 |
| Re-submission | https://github.com/github/awesome-copilot/issues/2645 (opened 2026-08-13, intake passed) |
| Packet | `specs/plugin-marketplace-listing/awesome-copilot-submission-packet.md` |
| Response | `specs/plugin-marketplace-listing/awesome-copilot-rejection-response.md` |
| Source | `TencentCloudBase/cloudbase-plugin` @ `4082ba957d41f8fc6545411d8a929884ab88980c` |
| Submitted at | 2026-07-28 |
| Rejected at | 2026-08-04 (security: agent-directed remote skill fetch) |
| Re-run at | 2026-08-05 (`/rerun-intake` after stripping `cnb.cool/.../git/raw` skill URLs; intake passed) |
| Closed at | 2026-08-12 by `aaronpowell`, stateReason `COMPLETED`, no comment |

### How to check progress (Awesome Copilot)

1. Watch re-submission #2645 labels / comments; request maintainer `/approve`
2. After `/approve`, the bot opens an `[external-plugin] Add cloudbase` PR and merges it
3. After merge, confirm entry in https://github.com/github/awesome-copilot/blob/main/plugins/external.json
4. Install test: `copilot plugin install cloudbase@awesome-copilot`

### 2026-08-13 — #2459 closure = batch cleanup (silently dropped), re-submitted as #2645

- Maintainer `aaronpowell` closed #2459 on 2026-08-12 with stateReason `COMPLETED`, **no comment**, and **no `[external-plugin] Add cloudbase` PR**; `cloudbase` absent from `plugins/external.json`.
- Closure was part of a **6-issue batch cleanup** at 2026-08-12 01:54–01:55Z (#2286 teams-sdk, #2184 Arize, #2354 vscode-crash-recovery-skills, #2447 modellix, #2459 cloudbase, #2465 security-test-plugin). The batch also closed issues still in `requires-submitter-fixes` (and #2354 that aaronpowell explicitly called "too niche"), so `COMPLETED` here means **queue cleanup, NOT approval** — no `/approve` command, no `approved` label, no listing PR.
- **Re-advance:** reopen #2459 was rejected (submitter lacks permission to reopen issues closed by maintainer). Instead:
  1. Commented on #2459 asking for confirmation + `/approve` → https://github.com/github/awesome-copilot/issues/2459#issuecomment-5276131129
  2. Opened re-submission #2645 (same plugin payload, references #2459). Intake re-ran and passed: vally lint ✅ / install smoke test ✅ / version match ✅; labels `external-plugin` + `ready-for-review`.
- **Blocked on:** maintainer running `/approve` on #2645, which triggers the `external-plugin-approval` automation to open+merge the `[external-plugin] Add cloudbase` PR. Until `cloudbase` appears in `external.json`, treat as **not listed**.

### 2026-08-13 — Poll #2645 /approve status: no change, still awaiting maintainer

- Checked https://github.com/github/awesome-copilot/issues/2645 — still **OPEN**, labels `external-plugin` + `ready-for-review`. Only comment is the intake bot (passed with spec warnings). No `/approve` command, no `approved` label, no `[external-plugin] Add cloudbase` PR.
- Confirmed `cloudbase` **absent** from https://github.com/github/awesome-copilot/blob/main/plugins/external.json → still **not listed**.
- Nothing to do on our side; the ball is with maintainer `aaronpowell`. Next poll point: watch for `/approve` on #2645, then verify the auto-opened listing PR merges and `cloudbase` appears in `external.json`.

## Composio awesome-claude-plugins (Claude discovery)

| Field | Value |
|-------|-------|
| Status | **PR open** — awaiting maintainer merge (poll 2026-08-18: still not listed) |
| PR | https://github.com/composio-community/awesome-claude-plugins/pull/424 |
| Upstream | https://github.com/composio-community/awesome-claude-plugins (alias ComposioHQ/…) |
| Fork / branch | `binggg/awesome-claude-plugins` `add-cloudbase-plugin` @ `5757135` |
| Listing | README `### Integrations` → CloudBase → CloudBase-AI-Toolkit + [Setup](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/claude) |
| Submitted at | 2026-08-17 |
| Last polled | 2026-08-18 |
| CI / review | `state: OPEN`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`; no required checks; no reviews/comments |
| Upstream README | `master` Integrations still **no CloudBase** (only connect-apps + kaggle-skill) |
| Out of scope | Does **not** replace Claude Community form or awesome-claude-code Issue; DSH covered by other task |

### How to check progress (Composio awesome-claude-plugins)

1. Watch PR #424: https://github.com/composio-community/awesome-claude-plugins/pull/424
2. After merge, confirm CloudBase row under Integrations in upstream `README.md`
3. Flip `markets.yaml` `composio-awesome-claude-plugins.community_directory` → `listed` and clear blockers
4. Re-run `npm run analyze:plugin-marketplaces`

### 2026-08-17 — PR #424 opened

- Verified contribution pattern from merged PRs #304 / #306: README-only external link (no vendored plugin folder; `marketplace.json` is in-repo only).
- Added restrained Integrations bullet linking `TencentCloudBase/CloudBase-AI-Toolkit` and official Claude setup docs.
- PR mergeable/clean at open; no bot feedback yet.

### 2026-08-18 — Poll #424: still OPEN, not listed

- `gh pr view`: OPEN, MERGEABLE, CLEAN; `mergedAt` null; `statusCheckRollup` empty; reviews/comments empty.
- Confirmed upstream `master` README `### Integrations` does not include CloudBase.
- No CI/maintainer feedback to act on. Did not ping (PR age ~1 day; peer listings #304/#306 waited ~5 weeks).
- `markets.yaml` stays `community_directory: submittable`; blocker kept; `last_reviewed_at` bumped to 2026-08-18.
- Did **not** flip listed. Does not replace Claude Community form / DSH.

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

