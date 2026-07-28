# Awesome Copilot — external plugin submission packet

Submit via GitHub issue form (do **not** PR `plugins/external.json` directly):

https://github.com/github/awesome-copilot/issues/new?template=external-plugin.yml

Prepared: 2026-07-28

## Issue fields

| Field | Value |
|-------|-------|
| Plugin name | `cloudbase` |
| Short description | Tencent CloudBase — AI models, auth, NoSQL/PostgreSQL, cloud functions, storage, CloudRun, and WeChat Mini Program via MCP tools and agent skills. |
| GitHub repository | `TencentCloudBase/cloudbase-plugin` |
| Plugin path | _(leave empty — plugin is at repo root)_ |
| Ref to review | _(optional if SHA provided)_ |
| Commit SHA | `b615a7f8bfad6637f2297e1a993d29f6a292a13d` |
| Version | `0.2.0` |
| License | `MIT` |
| Author name | `Tencent CloudBase` |
| Author URL | `https://cloudbase.net` |
| Homepage URL | `https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ai-agent-plugins` |
| Keywords | `cloudbase`, `tencent-cloud`, `baas`, `mcp`, `database`, `cloud-function`, `authentication`, `storage`, `cloudrun`, `miniprogram` |

### Additional notes for reviewers

```text
- Manifest: .plugin/plugin.json (Open Plugin Spec; accepted by awesome-copilot external validation)
- MCP: root .mcp.json → npx @cloudbase/cloudbase-mcp@latest
- Repo is OPS-synced from TencentCloudBase/CloudBase-AI-Toolkit plugin/cloudbase
- SHA is full 40-char commit on main (immutable); refresh SHA if a newer sync lands before review
- Not already listed in plugins/external.json (checked 2026-07-28)
```

## Checklist (form)

- [x] Public GitHub repository
- [x] Immutable SHA provided
- [x] Follows contribution / security policies
- [x] Not already listed

## After submit

Record issue URL in `submission-log.md`. When maintainers merge into `plugins/external.json`, flip VS Code / Copilot channel status toward `listed` and re-run the analyzer.
