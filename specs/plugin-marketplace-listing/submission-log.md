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
| Status | **PR opened** — awaiting xAI review |
| PR | https://github.com/xai-org/plugin-marketplace/pull/151 |
| Source repo | https://github.com/TencentCloudBase/cloudbase-plugin.git |
| Pinned SHA | `93b747b3287787b8c3ad0811ef4f9b51e2479ec9` |
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
| Status | **Intake re-run requested** — vally fixes synced; awaiting gate recheck |
| Issue | https://github.com/github/awesome-copilot/issues/2459 |
| Packet | `specs/plugin-marketplace-listing/awesome-copilot-submission-packet.md` |
| Source | `TencentCloudBase/cloudbase-plugin` @ `b3835bea5cb8e10f57c1e0a584f645eea2cbc127` |
| Submitted at | 2026-07-28 |
| Re-run at | 2026-07-28 (`/rerun-intake` after skill dir rename for vally) |

### How to check progress (Awesome Copilot)

1. Watch issue #2459 labels / comments
2. After merge, confirm entry in https://github.com/github/awesome-copilot/blob/main/plugins/external.json
3. Install test: `copilot plugin install cloudbase@awesome-copilot`

## Trae community MCP list

| Field | Value |
|-------|-------|
| Status | **PR opened** — awaiting community review |
| PR | https://github.com/trae-community/trae-mcp/pull/4 |
| Submitted at | 2026-07-28 |
| Note | Community README list (not Trae official in-app marketplace) |

### How to check progress (Trae community MCP)

1. Watch PR #4 merge
2. Official Trae MCP marketplace still needs partner outreach separately

## CodeBuddy marketplace (CNB)

| Field | Value |
|-------|-------|
| Status | **Update prepared** — no write access to `codebuddy/marketplace`; patch + automation ready |
| Official plugin path | https://cnb.cool/codebuddy/marketplace/-/tree/main/plugins/cloudbase |
| Source of truth | `config/codebuddy-plugin` (skills via `npx tsx scripts/sync-codebuddy-plugin.ts`; always keep `rules/`) |
| Automation | `node scripts/push-codebuddy-marketplace.mjs` |
| Apply-ready patch | `specs/plugin-marketplace-listing/artifacts/codebuddy-marketplace-cloudbase-v2.25.0.patch` |
| Blocker | Current CNB token can read marketplace but **cannot push** (`403`); needs CodeBuddy write grant or maintainer apply |
| Prepared at | 2026-07-28 |
| Target version | `2.25.0` (keeps `rules/cloudbase_rules.md`) |


### Staging repo (personal)

| Field | Value |
|-------|-------|
| GitHub staging | https://github.com/binggg/codebuddy-marketplace |
| Contents | `plugins/cloudbase/**` (keeps rules) + refreshed marketplace.json entry |
| Version | 2.25.0 |
| CNB personal mirror | blocked until empty repo `bookerzhao/codebuddy-marketplace` is created on cnb.cool |

After CNB personal repo exists: push staging, then open PR into `codebuddy/marketplace`.

### How to land the update

1. Preferred: grant CloudBase CNB identity write/MR access on `codebuddy/marketplace`, then run:
   - `npx tsx scripts/sync-codebuddy-plugin.ts`
   - `node scripts/push-codebuddy-marketplace.mjs`
2. Or maintainer applies patch on a clone:
   - `git am < codebuddy-marketplace-cloudbase-v2.25.0.patch`
3. Built-in IDE integration remains a separate CodeBuddy product code update.

