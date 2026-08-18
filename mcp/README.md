<div align="center"><a name="readme-top"></a>

<img src="https://raw.githubusercontent.com/TencentCloudBase/CloudBase-AI-Toolkit/main/mcp/icon.png" width="96" height="96" alt="CloudBase AI Toolkit" />

# @cloudbase/cloudbase-mcp

**MCP Server for Tencent CloudBase.** Part of [CloudBase AI Toolkit](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit).

Operate CloudBase from AI coding tools: login, databases, functions, storage, hosting, and logs—via the Model Context Protocol.

**English** · [简体中文](./README.zh-CN.md) · [Toolkit README](../README.md) · [Docs][docs] · [Changelog][changelog] · [Issues][github-issues-link]

[![][npm-version-shield]][npm-link]
[![][npm-downloads-shield]][npm-link]
[![][github-stars-shield]][github-stars-link]
![][github-license-shield]
[![][mcp-registry-shield]][mcp-registry-link]
[![][glama-shield]][glama-link]

</div>

## What this package is

`@cloudbase/cloudbase-mcp` is the npm distribution of the CloudBase MCP Server. It is one piece of the Toolkit:

| Piece | Role |
|------|------|
| **Plugin** | Installs MCP + Skills + Hooks together |
| **Agent Skills** | Scenario skills toward workable CloudBase practice |
| **MCP** (this package) | Tools the agent calls to act on your CloudBase environment |

Prefer Plugin when your IDE supports it. Use this package alone when you only need MCP config.

Full Toolkit narrative, related repos, and IDE matrix: [repository README](../README.md).

## Quick start

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

First prompts:

```
Login to CloudBase
```

```
Use CloudBase Skills to build a todo app with login, database and permissions, then deploy
```

You need a [CloudBase environment](https://tcb.cloud.tencent.com/dev) and should confirm sensitive actions the AI proposes.

### Other install paths

| Path | When |
|------|------|
| Official MCP Registry `io.github.TencentCloudBase/cloudbase-mcp` | Discover via [registry search=cloudbase](https://registry.modelcontextprotocol.io/v0/servers?search=cloudbase) |
| Glama | [glama.ai/mcp/servers/TencentCloudBase/CloudBase-AI-Toolkit](https://glama.ai/mcp/servers/TencentCloudBase/CloudBase-AI-Toolkit) |
| `npx plugins add TencentCloudBase/cloudbase-plugin` | Open Plugin Spec tools |
| `npm i -g @cloudbase/cli && tcb ai` | [CloudBase AI CLI](https://docs.cloudbase.net/cli-v1/ai/introduce) configures many IDEs |
| Marketplace / built-in plugin | Claude Code, Codex, CodeBuddy, WorkBuddy, ZCode, etc. |

## Connection modes

**Local** (default): `npx` on your machine—full features, including local filesystem upload/templates. Requires Node.js v18.15.0+.

**Hosted**: IDE connects over HTTP to Tencent Cloud MCP; no local Node. Some local-file features are unavailable.

```json
{
  "mcpServers": {
    "cloudbase": {
      "type": "http",
      "url": "https://tcb-api.cloud.tencent.com/mcp/v1?env_id=<env_id>",
      "headers": {
        "X-TencentCloud-SecretId": "<Tencent Cloud Secret ID>",
        "X-TencentCloud-SecretKey": "<Tencent Cloud Secret Key>"
      }
    }
  }
}
```

Hosted URLs can use `site=domestic` to pin the login site—domestic-site Singapore must pass `site=domestic`—plus `enable_plugins` / `disable_plugins` (comma-separated). Canonical plugin names: see `src/server.ts` in this package (e.g. `env`, `database`, `functions`, `hosting`, `storage`, `pg_database`, `cloudrun`, `logs`).

**Self-hosted Cloud Mode**: set `CLOUDBASE_MCP_CLOUD_MODE=true` (or `MCP_CLOUD_MODE=true`) so local file and process tools are disabled for remote callers.

| Scenario | Suggestion |
|------|------|
| Personal | Local `npx` |
| Team / zero ops | Hosted HTTP |
| Self-hosted MCP | Cloud Mode required |

### Site & region

Set `TCB_SITE` (`domestic` / `intl`) to select the login/credential site, and `TCB_REGION` for API routing. The domestic and international sites are separate account systems. `ap-singapore` exists on both, so **domestic-site Singapore users must set `TCB_SITE=domestic`**; otherwise it defaults to `intl`. Project-level `.cloudbase/project.json` (`{ site, region, envId }`) is also supported.

In **hosted mode** there is no MCP `env` block for HTTP servers, so pass the site as a URL query parameter instead: `https://tcb-api.cloud.tencent.com/mcp/v1?env_id=<env_id>&site=domestic`. Self-hosted Cloud Mode deployments can still use the `TCB_SITE` environment variable.

## Capabilities

Typical backend work in your environment (confirm critical steps):

- **Database**: PostgreSQL and document DB, data models, CRUD, permissions
- **Compute**: cloud functions / Cloud Run—author, deploy, invoke, debug
- **Auth & storage**: login methods, object storage, permission linkage
- **Release & ops**: static hosting / Mini Program publish; logs and redeploy

Tool catalog: [MCP tools](../doc/mcp-tools.md) · [tools.json](../scripts/tools.json)

## IDE config snippets

<details>
<summary>Cursor (.cursor/mcp.json)</summary>

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary>WindSurf (.windsurf/settings.json)</summary>

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

</details>

<details>
<summary>CodeBuddy</summary>

CloudBase is built in; manual MCP config is usually unnecessary.

</details>

Others: [IDE setup](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/).

## Docs

- [Toolkit README](../README.md)
- [Getting started](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/getting-started)
- [AI plugins](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ai-agent-plugins)
- [FAQ](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/faq)
- [Changelog][changelog]

## License

[MIT](../LICENSE) · [TencentCloudBase](https://github.com/TencentCloudBase)

<div align="center">
  <a href="https://glama.ai/mcp/servers/TencentCloudBase/CloudBase-AI-Toolkit">
    <img width="380" height="200" src="https://glama.ai/mcp/servers/TencentCloudBase/CloudBase-AI-Toolkit/badge" alt="CloudBase MCP server" />
  </a>
</div>

<!-- Links -->
[docs]: https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/
[changelog]: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/releases
[github-issues-link]: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/issues
[github-stars-link]: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/stargazers
[npm-link]: https://www.npmjs.com/package/@cloudbase/cloudbase-mcp
[mcp-registry-link]: https://registry.modelcontextprotocol.io/v0/servers?search=cloudbase
[glama-link]: https://glama.ai/mcp/servers/TencentCloudBase/CloudBase-AI-Toolkit

<!-- Shields -->
[npm-version-shield]: https://img.shields.io/npm/v/@cloudbase/cloudbase-mcp?color=3B82F6&label=npm&logo=npm&style=flat-square
[npm-downloads-shield]: https://img.shields.io/npm/dw/@cloudbase/cloudbase-mcp?color=10B981&label=downloads&logo=npm&style=flat-square
[github-stars-shield]: https://img.shields.io/github/stars/TencentCloudBase/CloudBase-AI-Toolkit?color=F59E0B&label=stars&logo=github&style=flat-square
[github-license-shield]: https://img.shields.io/badge/license-MIT-6366F1?logo=github&style=flat-square
[mcp-registry-shield]: https://img.shields.io/badge/MCP-Official%20Registry-412991?style=flat-square
[glama-shield]: https://img.shields.io/badge/Glama-MCP-111827?style=flat-square
