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
| `npx plugins add TencentCloudBase/cloudbase-plugin` | Open Plugin Spec tools |
| `npm i -g @cloudbase/cli && tcb ai` | [CloudBase AI CLI](https://docs.cloudbase.net/cli-v1/ai/introduce) configures many IDEs |
| Marketplace / built-in plugin | Claude Code, Codex, CodeBuddy, WorkBuddy, Doubao, MiniMax Code, DeepSeek Harness, Kimi Code, Kimi Work, ZCode, etc. |

## Connection modes

**Remote** (recommended): your IDE connects over HTTP to Tencent Cloud MCP. No local Node, and interactive clients finish authorization in the browser.

| Site | MCP endpoint |
|------|--------------|
| China (domestic) | `https://tcb-api.cloud.tencent.com/mcp/v1` |
| International | `https://tcb-api.tencentcloud.com/mcp/v1` |

Pick the endpoint matching the site your environment lives in—the two sites use separate accounts and credentials.

**OAuth (interactive, recommended)**: the URL is the whole configuration—your IDE opens the browser for login and consent, and you pick the environment there. No keys land in config files, and there is nothing to rotate.

```json
{
  "mcpServers": {
    "cloudbase": {
      "type": "http",
      "url": "https://tcb-api.cloud.tencent.com/mcp/v1"
    }
  }
}
```

**Static credentials** (for a client without OAuth, and for CI/CD): append `env_id` and a key pair created on the same site as the endpoint.

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

> A static key pair stays valid until it is rotated or deleted; an OAuth session ends when you log out. Use the static form only where the browser flow is impossible—and keep it out of a repository.

**Local**: runs `npx @cloudbase/cloudbase-mcp@latest` on your machine—full features, including local filesystem upload and template download. Requires Node.js v18.15.0+.

Remote trade-off: local-filesystem features (upload, template download) are unavailable, and the international site does not yet expose NoSQL tools.

Remote URLs accept `site` for one case only—a China-site environment in `ap-singapore`, where the region is ambiguous—plus `enable_plugins` / `disable_plugins` (comma-separated). Canonical plugin names: see `src/server.ts` in this package (e.g. `env`, `database`, `functions`, `hosting`, `storage`, `pg_database`, `cloudrun`, `logs`, `feedback`).

**Self-hosted Cloud Mode**: set `CLOUDBASE_MCP_CLOUD_MODE=true` (or `MCP_CLOUD_MODE=true`) so local file and process tools are disabled for remote callers.

| Scenario | Suggestion |
|------|------|
| Personal / fastest start | Remote URL (OAuth) |
| Need local file features | Local `npx` |
| CI / automation | Remote + static credentials |
| Self-hosted MCP | Cloud Mode required |

### Site & region

Set `TCB_SITE` (`domestic` / `intl`) to select the login/credential site, and `TCB_REGION` for API routing. The domestic and international sites are separate account systems. `ap-singapore` exists on both, so **domestic-site Singapore users must set `TCB_SITE=domestic`**; otherwise it defaults to `intl`. Project-level `.cloudbase/project.json` (`{ site, region, envId }`) is also supported.

In **remote mode** the site is determined by the endpoint host itself—`tcb-api.cloud.tencent.com` is the China site, `tcb-api.tencentcloud.com` is the international site—and there is no `site` query parameter to set. This holds for a China-site environment in `ap-singapore` too: keep using the China-site endpoint. Self-hosted Cloud Mode deployments can still use the `TCB_SITE` environment variable.

## Capabilities

Typical backend work in your environment (confirm critical steps):

- **Database**: PostgreSQL and document DB, data models, CRUD, permissions
- **Compute**: cloud functions / Cloud Run—author, deploy, invoke, debug
- **Auth & storage**: login methods, object storage, permission linkage
- **Release & ops**: static hosting / Mini Program publish; logs and redeploy

Tool catalog: [MCP tools](../doc/mcp-tools.md) · [tools.json](../scripts/tools.json)

## Confirmations before destructive calls

Deleting a cloud function, a collection, the documents in one, a stored file, a CloudRun service or a MySQL instance now pauses
the call until you answer a dialog that names the target — "about to delete the cloud function `hello` (env `env-abc`)" — instead
of asking a bare "are you sure?". It is built on MCP form elicitation, so it can only appear where the client declares that
capability *and* actually asks the user.

| Situation | What happens |
| --- | --- |
| The client asks the user | You get the dialog; the call runs only after you pick "delete" |
| The client is in a full-access / never-ask mode | It answers on its own within a few milliseconds. That is treated as "you were not asked", and the call proceeds |
| The client cannot render forms | No dialog, and the call proceeds — the behaviour is the same as before this change |
| You decline, dismiss it, or answer nothing for 45s | Nothing is executed, and the result says so **without** being marked as an error, so a model does not retry the same deletion |

A declined call is not a failure: the tool returns "not executed" plus what to do instead. Two environment variables change the
handling, and neither of them bypasses authentication, permissions or read-only limits — they only decide whether the question is
asked:

| Variable | Effect |
| --- | --- |
| `CLOUDBASE_MCP_SKIP_ELICITATIONS` | Comma-separated. Accepts a tool name (`manageFunctions`) or a single action (`manageFunctions.deleteFunction`), case-sensitive, no wildcard. Unknown entries are logged and ignored rather than failing the server |
| `CLOUDBASE_MCP_ELICIT_AUTO_APPROVE` | `allow` (default) proceeds when the client answers for itself; `block` treats that case as not confirmed |

A client's own tool-approval prompt is not this confirmation: it asks "may this tool run?", not "is this the resource you want to
delete?".

### Credential-shaped arguments: one real check before writing

When a call's arguments contain something shaped like a credential — a three-part JWT, or a `cb_secret_…` / `cb_publishable_…`
key — the server asks the client for one check before writing: compare the value against your original source and confirm. The
message deliberately carries **no plaintext**: only the total length, the segment lengths (for a JWT), and a fingerprint (the first
12 hex characters of sha256). That is enough to notice a value that was changed while being copied or transcribed, and nothing that
would put the secret into the conversation or into the logs.

**What this is not.** We do not decide whether the credential is valid. There is no signature verification, no `certs`/JWKS lookup,
no network request of any kind, and no server-side comparison — the server never sees the value you originally pasted, so the only
side that can compare it is the client. This is a request for a real confirmation at write time, not a validity check.

**Boundaries.** It only applies when the arguments actually contain a credential-shaped string (otherwise the call is unchanged: one
shallow scan, no network). It only applies when the client supports interactive form elicitation; a client that cannot ask proceeds
as before, so an unattended client is not blocked. And a check that returns within a few hundred milliseconds counts as "nobody
looked at it": unlike the deletion confirmation — where a client answering for itself is treated as "you were not asked" and the call
proceeds — a credential write is **not** executed, because a value nobody compared is exactly the case this guards against. When the
guard declines, the result says "not executed" **without** being marked as an error, so a model does not retry it blindly.

If a client always answers for itself — always inside that few-hundred-millisecond window — then credential writes on that client
will never proceed. That is the design, and there are two ways out: switch the client's permission to ask, so the check reaches a
person; or skip the check for that tool with `CLOUDBASE_MCP_SKIP_CREDENTIAL_GUARD`. Both are named in the message the guard returns.

| Variable | Effect |
| --- | --- |
| `CLOUDBASE_MCP_SKIP_CREDENTIAL_GUARD` | Comma-separated. Accepts a tool name (`manageCloudRun`) or a single action (`manageCloudRun.updateConfig`), case-sensitive, no wildcard. Unknown entries are logged and ignored rather than failing the server |

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

<!-- Links -->
[docs]: https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/
[changelog]: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/releases
[github-issues-link]: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/issues
[github-stars-link]: https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/stargazers
[npm-link]: https://www.npmjs.com/package/@cloudbase/cloudbase-mcp

<!-- Shields -->
[npm-version-shield]: https://img.shields.io/npm/v/@cloudbase/cloudbase-mcp?color=3B82F6&label=npm&logo=npm&style=flat-square
[npm-downloads-shield]: https://img.shields.io/npm/dw/@cloudbase/cloudbase-mcp?color=10B981&label=downloads&logo=npm&style=flat-square
[github-stars-shield]: https://img.shields.io/github/stars/TencentCloudBase/CloudBase-AI-Toolkit?color=F59E0B&label=stars&logo=github&style=flat-square
[github-license-shield]: https://img.shields.io/badge/license-MIT-6366F1?logo=github&style=flat-square
