# CloudBase Plugin Marketplace Analysis

Generated: 2026-08-05T07:36:57.965Z

> This report does not auto-submit to any marketplace. All submissions are manual.

## Summary

Total markets: **42**

| Priority | Count |
|----------|------:|
| ready_to_submit | 6 |
| needs_packaging_or_manifest | 1 |
| needs_partner_outreach | 12 |
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
- Last reviewed: 2026-08-05
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
- [ ] Strip remote skill-fetch URLs; sync cloudbase-plugin; /rerun-intake on
- [ ] [object Object]

Process:

```
Users add marketplaces via chat.plugins.marketplaces (default: github/copilot-plugins, awesome-copilot). Can point at this repo; curated default catalog inclusion needs outreach.
Status 2026-08-05: Awesome Copilot #2459 intake re-passed after stripping remote skill-fetch URLs (SHA 4082ba95...). Awaiting maintainer re-review.
See specs/plugin-marketplace-listing/awesome-copilot-rejection-response.md
```

Evidence:

- https://code.visualstudio.com/docs/agent-customization/agent-plugins
- https://github.com/github/awesome-copilot/issues/2459
- specs/plugin-marketplace-listing/awesome-copilot-rejection-response.md

Recommended install docs: `doc/ide-setup/vscode.mdx`

## needs_packaging_or_manifest

### qoder-plugin — Qoder / QoderWork

- Region: cn
- Channel: `community_plugin_directory`
- Eligibility: `public_github_repo_required`
- Last reviewed: 2026-07-30
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: submittable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: submittable
- `docs_only`: listed

Blockers:

- Awaiting QoderWork review / listing confirmation

Local evidence:

- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema
- `qoder_plugin_manifest`: **invalid** — Unknown local_evidence id "qoder_plugin_manifest"

Submit checklist:

- [ ] Pack Plugin zip (dist/cloudbase-qoder-v*.zip)
- [ ] Pack Skill zip (dist/cloudbase-skill-v*.zip)
- [ ] Submit Plugin + Skill in QoderWork
- [ ] [object Object]

Process:

```
QoderWork self-serve: Plugin (专家套件) + Skill marketplace.
Pack: npm run pack:qoder-plugin / pack:qoder-skill
Guide: plugin/cloudbase/docs/qoder-submit.md
Status 2026-07-30: Plugin zip + Skill zip both submitted (awaiting review).
Qoder CN AppHub: https://qoder.com.cn/account/apphub-publications (optional follow-up).
```

Evidence:

- https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines
- https://qoder.com.cn/account/apphub-publications
- doc/ide-setup/qoder.mdx
- plugin/cloudbase/docs/qoder-submit.md

Recommended install docs: `doc/ide-setup/qoder.mdx`

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
- Eligibility: `unknown_or_partner`
- Last reviewed: 2026-07-27
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: unknown
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: listed
- `mcp_or_skill_registry`: not_applicable
- `docs_only`: unknown

Blockers:

- Official third-party listing process not fully documented

Local evidence:

- `open_plugin_spec_cloudbase`: **present** — plugin/cloudbase/.plugin/plugin.json has $schema

Submit checklist:

- [ ] Confirm Kimi official vs third-party submission path
- [ ] Plugin zip or GitHub URL installable via /plugins

Process:

```
Official / third-party marketplace tabs plus custom marketplace JSON URL (KIMI_CODE_PLUGIN_MARKETPLACE_URL). Public third-party listing path needs verification.
```

Evidence:

- https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html

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
- Last reviewed: 2026-07-27
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

- No confirmed CloudBase listing
- Third-party connector submit path unclear

Submit checklist:

- [ ] Confirm connector onboarding with QoderWork
- [ ] MCP or connector packaging requirements

Process:

```
QoderWork has connector / integration marketplace plus custom MCP. CloudBase listing requires partner outreach.
```

Evidence:

- https://docs.qoder.com/zh/qoderwork/connectors

### trae-mcp-marketplace — Trae IDE / Trae Work

- Region: cn
- Channel: `mcp_registry_or_aggregator`
- Eligibility: `partner_outreach_required`
- Last reviewed: 2026-08-05
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: listed
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

Process:

```
Users can add MCP from Trae built-in MCP marketplace or manual config. Third-party submission into Trae MCP marketplace is not publicly documented.
Status 2026-08-05: Community list PR merged https://github.com/trae-community/trae-mcp/pull/4 (README catalog; not official Trae store).
```

Evidence:

- https://docs.trae.cn/work_remote-mcp-server
- https://docs.trae.cn/ide_model-context-protocol
- https://github.com/trae-community/trae-mcp/pull/4
- https://github.com/trae-community/trae-mcp/blob/main/README.md
- doc/ide-setup/trae.mdx

Recommended install docs: `doc/ide-setup/trae.mdx`

### trae-work-skills-marketplace — Trae Work

- Region: cn
- Channel: `skill_registry`
- Eligibility: `partner_outreach_required`
- Last reviewed: 2026-08-05
- Manual submit only: yes

Statuses:

- `official_curated`: unknown
- `community_directory`: listed
- `self_marketplace`: not_applicable
- `native_connector_or_builtin`: not_applicable
- `open_plugin_spec`: not_applicable
- `mcp_or_skill_registry`: listed
- `docs_only`: listed

Blockers:

- Official Trae Work in-app skill market publisher path not documented

Submit checklist:

- [ ] Confirm Trae Work official skill market publisher process
- [ ] Package SKILL.md zip if official market requires it

Process:

```
Community catalog: trae-community/trae-skills (merged PR #20).
Users can also upload local SKILL.md zip/.skill or install from Trae Work skills marketplace.
Official Trae Work publisher onboarding still unclear / partner outreach.
Status 2026-08-05: Community skills PR merged https://github.com/trae-community/trae-skills/pull/20
```

Evidence:

- https://docs.trae.cn/solo_skills
- https://github.com/trae-community/trae-skills/pull/20
- https://github.com/trae-community/trae-skills/blob/main/README.md
- https://github.com/trae-community/trae-skills/blob/main/skills/cloudbase/SKILL.md

Recommended install docs: `doc/ide-setup/trae.mdx`

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

