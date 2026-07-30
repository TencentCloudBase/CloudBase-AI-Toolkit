# CloudBase Plugin Marketplace Analysis

Generated: 2026-07-30T10:38:16.628Z

> This report does not auto-submit to any marketplace. All submissions are manual.

## Summary

Total markets: **44**

| Priority | Count |
|----------|------:|
| ready_to_submit | 8 |
| needs_packaging_or_manifest | 0 |
| needs_partner_outreach | 13 |
| listed | 7 |
| not_applicable | 15 |
| unknown | 1 |

## Stale reviews

None.

## ready_to_submit

### claude-code-community — Claude Code

- Region: global
- Channel: `community_plugin_directory`
- Eligibility: `public_github_repo_required`
- Last reviewed: 2026-07-28
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: submittable
- `self_marketplace`: listed
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `self_marketplace_claude`: **present** — .claude-plugin/marketplace.json lists cloudbase
- `claude_plugin_manifest`: **present** — plugin/cloudbase/.claude-plugin/plugin.json exists
- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema

Submit checklist:

- [ ] Public GitHub repository URL
- [ ] Valid .claude-plugin/plugin.json (or marketplace entry)
- [ ] README with install and usage
- [ ] claude plugin validate locally

Process:

```
Submit public GitHub plugin via claude.ai or platform.claude.com forms; lands in anthropics/claude-plugins-community after review.
Status 2026-07-28: human submit deferred; packet ready at specs/plugin-marketplace-listing/claude-submission-packet.md
```

Evidence:

- https://code.claude.com/docs/en/plugins
- https://platform.claude.com/plugins/submit
- https://claude.ai/admin-settings/directory/submissions/plugins/new

Recommended install docs: `doc/ide-setup/claude-code.mdx`

### cursor-marketplace — Cursor

- Region: global
- Channel: `official_curated_marketplace`
- Eligibility: `public_github_repo_required`
- Last reviewed: 2026-07-28
- Manual submit only: yes

Statuses:

- `official_curated`: submittable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `cursor_plugin_manifest`: **present** — Found plugin/cloudbase/.cursor-plugin/plugin.json, .cursor-plugin/marketplace.json
- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema

Submit checklist:

- [ ] .cursor-plugin/plugin.json at plugin root
- [ ] README.md
- [ ] Valid relative paths in manifest
- [ ] Tested locally under ~/.cursor/plugins/local/
- [ ] Submit at cursor.com/marketplace/publish

Process:

```
Submit publisher application at https://cursor.com/marketplace/publish (manual review).
Needs .cursor-plugin/plugin.json (and marketplace.json for multi-plugin repos).
Status 2026-07-28: publisher application submitted (Tencent CloudBase / @tencent-cloudbase).
Awaiting follow-up from marketplace-publishing@cursor.com. Not yet listed.
```

Evidence:

- https://cursor.com/docs/plugins
- https://cursor.com/marketplace/publish
- https://cursor.com/docs/reference/plugins

Recommended install docs: `doc/ide-setup/cursor.mdx`

### cursor-directory — Cursor

- Region: global
- Channel: `community_plugin_directory`
- Eligibility: `public_github_repo_required`
- Last reviewed: 2026-07-28
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: submittable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `cursor_plugin_manifest`: **present** — Found plugin/cloudbase/.cursor-plugin/plugin.json, .cursor-plugin/marketplace.json
- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema

Submit checklist:

- [ ] Public repo with root .mcp.json (cloudbase-plugin)
- [ ] Listing on cursor.directory

Process:

```
Community listing via cursor.directory (plugin discovery). Prefer official Cursor Marketplace for primary listing.
Status 2026-07-28: submitted — https://cursor.directory/plugins/cloudbase (being verified).
Source repo: https://github.com/TencentCloudBase/cloudbase-plugin (root .mcp.json).
```

Evidence:

- https://cursor.directory/plugins/cloudbase
- https://cursor.directory
- https://cursor.directory/plugins/new
- https://cursor.com/docs/plugins

Recommended install docs: `doc/ide-setup/cursor.mdx`

### codex-universal — Codex / ChatGPT Work

- Region: global
- Channel: `official_curated_marketplace`
- Eligibility: `openai_platform_submission`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: submittable
- `community_directory`: not_applicable
- `self_marketplace`: listed
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `self_marketplace_codex`: **present** — .agents/plugins/marketplace.json lists cloudbase
- `codex_plugin_manifest`: **present** — plugin/cloudbase/.codex-plugin/plugin.json exists
- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema

Submit checklist:

- [ ] Listing metadata (name, descriptions, logo, category)
- [ ] Developer identity verification
- [ ] Website / support / privacy / terms URLs
- [ ] MCP details and test cases if MCP included
- [ ] Submit through OpenAI plugin portal; publish after approval

Process:

```
Submit via OpenAI plugin submission portal for universal Plugins Directory shared by ChatGPT and Codex.
```

Evidence:

- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/codex/plugins/build

Recommended install docs: `doc/ide-setup/codex.mdx`

### grok-marketplace — Grok Build

- Region: global
- Channel: `community_plugin_directory`
- Eligibility: `public_github_pr_required`
- Last reviewed: 2026-07-28
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: submittable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: unknown

Local evidence:

- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema

Submit checklist:

- [ ] Plugin installable from public GitHub
- [ ] Entry in .grok-plugin/marketplace.json (remote source + commit pin)
- [ ] PR to xai-org/plugin-marketplace

Process:

```
Open a PR to xai-org/plugin-marketplace adding a remote catalog entry pinned to commit SHA.
Status 2026-07-28: PR opened https://github.com/xai-org/plugin-marketplace/pull/151
Source: TencentCloudBase/cloudbase-plugin @ 93b747b3287787b8c3ad0811ef4f9b51e2479ec9
```

Evidence:

- https://github.com/xai-org/plugin-marketplace
- https://github.com/xai-org/plugin-marketplace/pull/151
- https://x.ai/news/grok-plugin-marketplace

### vscode-agent-plugins — Visual Studio Code

- Region: global
- Channel: `self_hosted_marketplace`
- Eligibility: `marketplace_add_or_catalog_pr`
- Last reviewed: 2026-07-28
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: submittable
- `self_marketplace`: listed
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `self_marketplace_claude`: **present** — .claude-plugin/marketplace.json lists cloudbase
- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema

Submit checklist:

- [ ] Users can add TencentCloudBase/CloudBase-MCP as marketplace
- [ ] [object Object]

Process:

```
Users add marketplaces via chat.plugins.marketplaces (default: github/copilot-plugins, awesome-copilot). Can point at this repo; curated default catalog inclusion needs outreach.
Status 2026-07-28: Awesome Copilot external plugin issue opened https://github.com/github/awesome-copilot/issues/2459
```

Evidence:

- https://code.visualstudio.com/docs/agent-customization/agent-plugins
- https://github.com/github/awesome-copilot/issues/2459

Recommended install docs: `doc/ide-setup/vscode.mdx`

### qoder-plugin — Qoder

- Region: cn
- Channel: `community_plugin_directory`
- Eligibility: `marketplace_add_or_catalog_pr`
- Last reviewed: 2026-07-30
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: submittable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Blockers:

- Need to map CloudBase package to `.qoder-plugin` layout and try community submit
- Featured / official curated placement process unclear

Local evidence:

- `doc/ide-setup/qoder.mdx`: **invalid** — Unknown local_evidence id "doc/ide-setup/qoder.mdx"

Submit checklist:

- [ ] Adapt plugin/cloudbase (or thin wrapper) to `.qoder-plugin/plugin.json` layout
- [ ] Submit Skill or Plugin via Qoder CN community / AppHub publications
- [ ] Verify install from Qoder plugin marketplace UI
- [ ] Ask Qoder for Featured category if needed

Process:

```
Qoder IDE has an in-product plugin marketplace (Featured/Coding/DataBase/…).
CN community skill hub: https://qoder.com.cn/marketplace (submit via https://qoder.com.cn/account/apphub-publications).
Plugin packaging uses `.qoder-plugin/plugin.json` (+ skills/MCP/hooks). See https://docs.qoder.com/zh/extensions/plugins
CloudBase already has ide-setup docs; Featured/curated placement may still need partner outreach.
```

Evidence:

- https://docs.qoder.com/zh/extensions/plugins
- https://qoder.com.cn/marketplace
- https://qoder.com.cn/account/apphub-publications
- doc/ide-setup/qoder.mdx

Recommended install docs: `doc/ide-setup/qoder.mdx`

### qoderwork-marketplace — QoderWork

- Region: cn
- Channel: `community_plugin_directory`
- Eligibility: `self_serve_submit`
- Last reviewed: 2026-07-30
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: submittable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: submittable
- `docs_only`: listed

Local evidence:

- `plugin/cloudbase`: **invalid** — Unknown local_evidence id "plugin/cloudbase"
- `config/source/skills`: **invalid** — Unknown local_evidence id "config/source/skills"

Submit checklist:

- [ ] Choose Plugin vs Skill packaging (prefer Plugin wrapping CloudBase skills + MCP)
- [ ] Produce `.qoder-plugin/plugin.json` + skills/ + optional `.mcp.json` (stdio npx @cloudbase/cloudbase-mcp)
- [ ] Submit from QoderWork client marketplace / 我的发布
- [ ] Pass structure precheck + automated review
- [ ] [object Object]

Process:

```
QoderWork public marketplace is self-serve inside the client: submit → review → live.
Four extension types: Skill / Plugin (专家套件) / Connector / 工作台.
Recommended first path for CloudBase: **Plugin** (skills + optional `.mcp.json` for cloudbase-mcp) or a thin **Skill**.
Guidelines: https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines
Plugin layout requires `.qoder-plugin/plugin.json` under the package root.
```

Evidence:

- https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines
- https://docs.qoder.com/zh/qoderwork/connectors

## needs_packaging_or_manifest

_None_

## needs_partner_outreach

### claude-code-official — Claude Code

- Region: global
- Channel: `official_curated_marketplace`
- Eligibility: `anthropic_discretion_only`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: not_applicable
- `self_marketplace`: listed
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Blockers:

- No public submission path for claude-plugins-official

Local evidence:

- `self_marketplace_claude`: **present** — .claude-plugin/marketplace.json lists cloudbase
- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema

Process:

```
Anthropic-curated only; no public application. Community form does not add to official marketplace.
```

Evidence:

- https://code.claude.com/docs/en/discover-plugins
- https://github.com/anthropics/claude-plugins-official

Recommended install docs: `doc/ide-setup/claude-code.mdx`

### kimi-code-marketplace — Kimi Code

- Region: cn
- Channel: `community_plugin_directory`
- Eligibility: `marketplace_add_or_catalog_pr`
- Last reviewed: 2026-07-30
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: listed
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Blockers:

- Official / Third-party curated listing process not publicly documented

Local evidence:

- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema
- `plugin/cloudbase`: **invalid** — Unknown local_evidence id "plugin/cloudbase"

Submit checklist:

- [ ] Confirm install works via /plugins install GitHub URL (TencentCloudBase/cloudbase-plugin)
- [ ] Optionally publish a Kimi-compatible marketplace.json pointing at cloudbase-plugin
- [ ] Ask Moonshot / Kimi Code team how to appear under Official or Third-party tab
- [ ] Keep docs install path updated

Process:

```
Kimi Code CLI `/plugins` has Official / Third-party / Custom tabs.
Users can already install via GitHub URL or `npx plugins add TencentCloudBase/cloudbase-plugin` (kimi target).
Custom catalog: set KIMI_CODE_PLUGIN_MARKETPLACE_URL or `/plugins marketplace <json-url>`.
How to land in Official/Third-party curated tabs is not publicly documented (2026-07-30) — needs Moonshot outreach.
Docs: https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html
```

Evidence:

- https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html
- https://www.kimi.com/code/docs/en/kimi-code/whats-new.html

### codebuddy-plugin — CodeBuddy

- Region: cn
- Channel: `native_connector_or_builtin`
- Eligibility: `partner_outreach_required`
- Last reviewed: 2026-07-29
- Manual submit only: yes

Statuses:

- `official_curated`: listed
- `community_directory`: unknown
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: listed
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Blockers:

- Awaiting merge of https://cnb.cool/codebuddy/marketplace/-/pulls/19 (refresh to v2.25.0)

Local evidence:

- `config/codebuddy-plugin`: **invalid** — Unknown local_evidence id "config/codebuddy-plugin"
- `specs/plugin-marketplace-listing/submission-log.md`: **invalid** — Unknown local_evidence id "specs/plugin-marketplace-listing/submission-log.md"

Submit checklist:

- [ ] Await merge of https://cnb.cool/codebuddy/marketplace/-/pulls/19
- [ ] Confirm keep rules/cloudbase_rules.md in marketplace package
- [ ] Ask CodeBuddy product team about built-in IDE sync if needed

Process:

```
Official catalog already has plugins/cloudbase on cnb.cool/codebuddy/marketplace (content stale vs v2.25.0).
Fork: https://cnb.cool/tencent/cloud/cloudbase/marketplace
PR open: https://cnb.cool/codebuddy/marketplace/-/pulls/19 (from fork main).
```

Evidence:

- https://cnb.cool/codebuddy/marketplace/-/tree/main/plugins/cloudbase
- https://cnb.cool/tencent/cloud/cloudbase/marketplace
- https://cnb.cool/codebuddy/marketplace/-/pulls/19
- https://www.codebuddy.cn/docs/cli/plugins
- doc/ide-setup/codebuddy.mdx

Recommended install docs: `doc/ide-setup/codebuddy.mdx`

### codebuddy-code-plugin — CodeBuddy Code

- Region: cn
- Channel: `community_plugin_directory`
- Eligibility: `partner_outreach_required`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Blockers:

- Public submit path not fully verified

Submit checklist:

- [ ] plugin.json + README
- [ ] Marketplace listing steps from CodeBuddy docs

Process:

```
Share via CodeBuddy Code plugin marketplace after plugin.json packaging. Confirm public submit path.
```

Evidence:

- https://www.codebuddy.cn/docs/cli/plugins
- doc/ide-setup/codebuddy-code.mdx

Recommended install docs: `doc/ide-setup/codebuddy-code.mdx`

### qoderwork-connector — QoderWork

- Region: cn
- Channel: `native_connector_or_builtin`
- Eligibility: `partner_outreach_required`
- Last reviewed: 2026-07-30
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: unknown
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: unknown

Blockers:

- Requires public HTTPS MCP with OAuth (current CloudBase MCP is primarily npx stdio)
- Company identity phone verification + legal docs

Submit checklist:

- [ ] Decide whether hosted CloudBase MCP HTTPS endpoint is in scope
- [ ] Prepare OAuth, privacy policy, ToS, connectivity self-test
- [ ] Submit Connector via QoderWork + complete company verification

Process:

```
Connector is a separate QoderWork extension type: public HTTPS MCP + OAuth, company identity verification, privacy/ToS, self-test report, then human review.
Prefer shipping CloudBase first as Plugin/Skill (`qoderwork-marketplace`); treat official Connector as a later partner track.
Docs: https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines (Connector section)
```

Evidence:

- https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines
- https://docs.qoder.com/zh/qoderwork/connectors

### minimax-agent-mcp — MiniMax Agent

- Region: cn
- Channel: `mcp_registry_or_aggregator`
- Eligibility: `unknown_or_partner`
- Last reviewed: 2026-07-30
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: unknown
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: unknown
- `docs_only`: listed

Blockers:

- No public third-party plugin/MCP submit form found
- Marketplace reuse appears product-internal after MCP Builder

Submit checklist:

- [ ] Smoke-test CloudBase MCP inside MiniMax Agent (manual add)
- [ ] Add ide-setup / docs note if product fit is confirmed
- [ ] Monitor MiniMax for public marketplace publisher docs
- [ ] Partner outreach if curated catalog is required

Process:

```
MiniMax Agent supports custom MCP and an in-product MCP Builder; changelog mentions adding completed MCPs to a marketplace for reuse.
No stable public third-party developer submission URL found (2026-07-30).
Near-term path: document manual MCP config (`npx @cloudbase/cloudbase-mcp@latest`) for MiniMax Agent users; watch Agent docs/changelog for publisher onboarding.
Refs: https://agent.minimaxi.com/docs/user-guide ; https://agent.minimax.io/docs/changelog
```

Evidence:

- https://agent.minimaxi.com/docs/user-guide
- https://agent.minimax.io/docs/user-guide
- https://agent.minimax.io/docs/changelog

### trae-mcp-marketplace — Trae IDE / Trae Work

- Region: cn
- Channel: `mcp_registry_or_aggregator`
- Eligibility: `partner_outreach_required`
- Last reviewed: 2026-07-28
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: unknown
- `docs_only`: listed

Blockers:

- No public developer submit form for Trae official MCP marketplace

Local evidence:

- `trae_mcp_deeplink_docs`: **present** — Trae docs present: doc/ide-setup/trae.mdx

Submit checklist:

- [ ] Partner outreach for official MCP marketplace inclusion
- [ ] Provide stdio npx config for CloudBase MCP
- [ ] Community README PR to trae-community/trae-mcp

Process:

```
Users can add MCP from Trae built-in MCP marketplace or manual config. Third-party submission into Trae MCP marketplace is not publicly documented.
Status 2026-07-28: Community list PR opened https://github.com/trae-community/trae-mcp/pull/4 (README catalog; not official Trae store).
```

Evidence:

- https://docs.trae.cn/work_remote-mcp-server
- https://docs.trae.cn/ide_model-context-protocol
- https://github.com/trae-community/trae-mcp/pull/4
- doc/ide-setup/trae.mdx

Recommended install docs: `doc/ide-setup/trae.mdx`

### trae-work-skills-marketplace — Trae Work

- Region: cn
- Channel: `skill_registry`
- Eligibility: `partner_outreach_required`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: unknown
- `docs_only`: unknown

Blockers:

- Public skill publishing path not documented

Submit checklist:

- [ ] Confirm Trae Work skill market publisher process
- [ ] Package SKILL.md zip if allowed

Process:

```
Users can upload local SKILL.md zip/.skill or install from Trae Work skills marketplace. Public publisher onboarding unclear.
```

Evidence:

- https://docs.trae.cn/solo_skills

### mcp-official-registry — Official MCP Registry

- Region: global
- Channel: `mcp_registry_or_aggregator`
- Eligibility: `mcp_publisher_cli`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: unknown
- `docs_only`: unknown

Blockers:

- Confirm whether @cloudbase/cloudbase-mcp is already published to official registry

Submit checklist:

- [ ] server.json / publisher metadata
- [ ] mcp-publisher publish

Process:

```
Publish via mcp-publisher CLI to registry.modelcontextprotocol.io; aggregators may ingest afterward.
```

Evidence:

- https://registry.modelcontextprotocol.io

### smithery — Smithery

- Region: global
- Channel: `mcp_registry_or_aggregator`
- Eligibility: `hosted_http_mcp_or_registry`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: unknown
- `docs_only`: unknown

Submit checklist:

- [ ] Public MCP URL or registry entry
- [ ] Complete Smithery publish flow if needed

Process:

```
Publish hosted HTTPS MCP or rely on registry ingest; see smithery.ai/new.
```

Evidence:

- https://smithery.ai/docs/build/publish.md

### pulsemcp — PulseMCP

- Region: global
- Channel: `mcp_registry_or_aggregator`
- Eligibility: `via_official_registry`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: unknown
- `docs_only`: unknown

Submit checklist:

- [ ] Ensure official MCP registry listing first

Process:

```
Typically ingests from official MCP registry; expedite via contact after registry publish.
```

Evidence:

- https://www.pulsemcp.com

### glama — Glama

- Region: global
- Channel: `mcp_registry_or_aggregator`
- Eligibility: `public_github_mcp`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: unknown
- `docs_only`: unknown

Submit checklist:

- [ ] Public MCP server repo discoverable

Process:

```
Indexes public GitHub MCP repos / registry.
```

Evidence:

- https://glama.ai/mcp/servers

### mcp-so — mcp.so

- Region: global
- Channel: `mcp_registry_or_aggregator`
- Eligibility: `github_pr`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: unknown
- `docs_only`: unknown

Submit checklist:

- [ ] PR adding CloudBase MCP listing line

Process:

```
Community PR / listing line in mcp.so source catalog.
```

Evidence:

- https://mcp.so

## listed

### github-copilot-cli — GitHub Copilot CLI

- Region: global
- Channel: `open_plugin_spec_target`
- Eligibility: `marketplace_add_or_ops`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: listed
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema
- `ops_publish_repo_docs`: **present** — doc/ai-agent-plugins.mdx documents npx plugins add

Submit checklist:

- [ ] Confirm default Copilot curated catalog submission if desired

Process:

```
Shares agent plugin format with VS Code; install via marketplace add or npx plugins --target github-copilot.
```

Evidence:

- https://code.visualstudio.com/docs/agent-customization/agent-plugins
- https://open-plugins.com/plugin-builders/specification

Recommended install docs: `doc/ide-setup/github-copilot.mdx`

### workbuddy-connector — WorkBuddy

- Region: cn
- Channel: `native_connector_or_builtin`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: listed
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Already listed as built-in CloudBase connector.
```

Evidence:

- doc/ide-setup/workbuddy.mdx
- doc/ai-agent-plugins.mdx

Recommended install docs: `doc/ide-setup/workbuddy.mdx`

### zcode-plugin — ZCode

- Region: cn
- Channel: `native_connector_or_builtin`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: listed
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Listed as cloudbase-skills under ZCode plugins (>= 3.4.1).
```

Evidence:

- doc/ide-setup/zcode.mdx
- doc/ai-agent-plugins.mdx

Recommended install docs: `doc/ide-setup/zcode.mdx`

### trae-mcp-deeplink — Trae IDE

- Region: cn
- Channel: `deeplink_or_install_assist`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `trae_mcp_deeplink_docs`: **present** — Trae docs present: doc/ide-setup/trae.mdx

Process:

```
Distribution assist via trae-cn:// MCP import deep link (already documented). Not a store listing.
```

Evidence:

- https://docs.trae.cn/ide_mcp-server-install-links
- doc/ide-setup/trae.mdx

Recommended install docs: `doc/ide-setup/trae.mdx`

### ops-cli — Open Plugin Spec CLI

- Region: global
- Channel: `open_plugin_spec_target`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema
- `ops_publish_repo_docs`: **present** — doc/ai-agent-plugins.mdx documents npx plugins add

Process:

```
Already installable via npx plugins add TencentCloudBase/cloudbase-plugin (targets: claude-code, cursor, codex, grok, kimi, github-copilot, vscode).
```

Evidence:

- doc/ai-agent-plugins.mdx
- https://open-plugins.com/plugin-builders/specification

Recommended install docs: `doc/ai-agent-plugins.mdx`

### self-marketplace-claude — Claude Code (self marketplace)

- Region: global
- Channel: `self_hosted_marketplace`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: listed
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `self_marketplace_claude`: **present** — .claude-plugin/marketplace.json lists cloudbase
- `claude_plugin_manifest`: **present** — plugin/cloudbase/.claude-plugin/plugin.json exists

Process:

```
Users add TencentCloudBase/CloudBase-MCP then install cloudbase@tencent-cloudbase.
```

Evidence:

- .claude-plugin/marketplace.json
- doc/ide-setup/claude-code.mdx

Recommended install docs: `doc/ide-setup/claude-code.mdx`

### self-marketplace-codex — Codex (self marketplace)

- Region: global
- Channel: `self_hosted_marketplace`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: listed
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Local evidence:

- `self_marketplace_codex`: **present** — .agents/plugins/marketplace.json lists cloudbase
- `codex_plugin_manifest`: **present** — plugin/cloudbase/.codex-plugin/plugin.json exists

Process:

```
Users add marketplace from this repo. Codex prefers .agents/plugins/marketplace.json (root marketplace.json kept for compat). Recommended: --sparse .agents/plugins --sparse plugin.
```

Evidence:

- .agents/plugins/marketplace.json
- marketplace.json
- doc/ide-setup/codex.mdx
- doc/ai-agent-plugins.mdx

Recommended install docs: `doc/ide-setup/codex.mdx`

## not_applicable

### trae-ide-extension — Trae IDE

- Region: cn
- Channel: `editor_extension_marketplace`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: not_applicable

Process:

```
VS Code-compatible .vsix extension marketplace. Not the correct channel for CloudBase agent plugin / MCP listing.
```

Evidence:

- https://docs.trae.cn/ide_manage-extensions

Recommended install docs: `doc/ide-setup/trae.mdx`

### tongyi-lingma — Tongyi Lingma

- Region: cn
- Channel: `docs_config_only`
- Eligibility: `unknown_or_partner`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
MCP / rules via ide-setup docs; dedicated agent plugin store status unknown.
```

Evidence:

- doc/ide-setup/tongyi-lingma.mdx

Recommended install docs: `doc/ide-setup/tongyi-lingma.mdx`

### baidu-comate — Baidu Comate

- Region: cn
- Channel: `docs_config_only`
- Eligibility: `unknown_or_partner`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
MCP / rules via ide-setup docs; store listing unknown.
```

Evidence:

- doc/ide-setup/baidu-comate.mdx

Recommended install docs: `doc/ide-setup/baidu-comate.mdx`

### windsurf — WindSurf

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
MCP + rules config; no confirmed CloudBase agent plugin marketplace.
```

Evidence:

- doc/ide-setup/windsurf.mdx

Recommended install docs: `doc/ide-setup/windsurf.mdx`

### docs-cline — Cline

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
No dedicated CloudBase store channel; use MCP + rules docs.
```

Evidence:

- doc/ide-setup/cline.mdx

Recommended install docs: `doc/ide-setup/cline.mdx`

### docs-gemini-cli — Gemini CLI

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only MCP/rules setup.
```

Evidence:

- doc/ide-setup/gemini-cli.mdx

Recommended install docs: `doc/ide-setup/gemini-cli.mdx`

### docs-opencode — OpenCode

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only MCP/rules setup.
```

Evidence:

- doc/ide-setup/opencode.mdx

Recommended install docs: `doc/ide-setup/opencode.mdx`

### docs-qwen-code — Qwen Code

- Region: cn
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only MCP/rules setup.
```

Evidence:

- doc/ide-setup/qwen-code.mdx

Recommended install docs: `doc/ide-setup/qwen-code.mdx`

### docs-augment-code — Augment Code

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only MCP/rules setup.
```

Evidence:

- doc/ide-setup/augment-code.mdx

Recommended install docs: `doc/ide-setup/augment-code.mdx`

### docs-roocode — RooCode

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only MCP/rules setup (deprecated product guidance may apply).
```

Evidence:

- doc/ide-setup/roocode.mdx

Recommended install docs: `doc/ide-setup/roocode.mdx`

### docs-antigravity — Google Antigravity

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only MCP/rules setup.
```

Evidence:

- doc/ide-setup/antigravity.mdx

Recommended install docs: `doc/ide-setup/antigravity.mdx`

### docs-kiro — Kiro

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only MCP/rules setup.
```

Evidence:

- doc/ide-setup/kiro.mdx

Recommended install docs: `doc/ide-setup/kiro.mdx`

### docs-aider — Aider

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only MCP/rules setup. Dedicated ide-setup page not present yet.
```

### docs-iflow-cli — iFlow CLI

- Region: cn
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only MCP/rules setup.
```

Evidence:

- doc/ide-setup/iflow-cli.mdx

Recommended install docs: `doc/ide-setup/iflow-cli.mdx`

### docs-openclaw — OpenClaw

- Region: global
- Channel: `docs_config_only`
- Eligibility: `n_a`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: listed

Process:

```
Docs-only setup; skill registry via ClawHub tracked separately.
```

Evidence:

- doc/ide-setup/openclaw.mdx

Recommended install docs: `doc/ide-setup/openclaw.mdx`

## unknown

### clawhub — ClawHub

- Region: global
- Channel: `skill_registry`
- Eligibility: `clawhub_cli_workflow`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: not_applicable
- `community_directory`: not_applicable
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: unknown
- `docs_only`: listed

Submit checklist:

- [ ] Follow existing ClawHub publish spec

Process:

```
Covered by specs/clawhub-public-skill-registry-publish; do not duplicate publish pipeline here.
```

Evidence:

- specs/clawhub-public-skill-registry-publish/requirements.md

