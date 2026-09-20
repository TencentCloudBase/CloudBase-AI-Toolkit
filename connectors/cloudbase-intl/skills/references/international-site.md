# International site (intl) — endpoints, scope, and limits

This connector is pinned to the CloudBase **international** site (`site=intl`). Environments,
accounts, and billing are **separate** from the CloudBase China site — two independent account
systems that must never be mixed. Read this file before acting on any CloudBase task here.

## Use the international endpoints, never the China-site ones

| Purpose | International (use this) | China site (never use) |
| --- | --- | --- |
| Console / dev platform | `https://tcb.tencentcloud.com/dev?envId=${envId}#/{path}` | `tcb.cloud.tencent.com` |
| Data-plane gateway | `https://{envId}.api.intl.tcloudbasegateway.com` | `{envId}.api.tcloudbasegateway.com` |
| Control-plane API host | `tcb.intl.tencentcloudapi.com` | `tcb.tencentcloudapi.com` |
| Cloud Functions API host | `scf.intl.tencentcloudapi.com` | `scf.tencentcloudapi.com` |
| Container Registry API host | `tcr.intl.tencentcloudapi.com` | `tcr.tencentcloudapi.com` |

- Region: `ap-singapore` is the international site region. `ap-shanghai` / `ap-guangzhou`
  belong to the China site — never pass them for an international environment.
- When a user asks for a console link, give the `tcb.tencentcloud.com` form above. Never hand
  out a `tcb.cloud.tencent.com` or `console.cloud.tencent.com` link.
- Purchase, API Explorer, and CAM role-authorization links found in the skill corpus still
  point at the China site — their international equivalents are unverified. Do not forward
  those links to users. Route them to the international console above, or ask the user how
  they want to proceed.
  - Specifically: when the AI Token Credits resource pack is missing, do **not** emit the
    `buy.cloud.tencent.com/lowcode?...` purchase link. Tell the user the pack is not enabled
    on the environment and let them handle billing on the international console.

## Sign-in

Authentication uses a **Tencent Cloud International account** over OAuth, run by this connector
in the browser. No SecretId / SecretKey or API key has to be pasted, and tokens refresh
automatically. If authorization is revoked or expires, reconnect from the connector card to
re-run the browser flow — do not fall back to long-term keys.

## Capability scope

- **Relational databases only.** The international site does not support the CloudBase NoSQL
  document database, and those tools are not registered on this site. Use PostgreSQL
  (`postgresql-development-cloudbase`, `relational-database-mcp-cloudbase`) or MySQL. Guidance
  that assumes NoSQL collections does not apply — including `cloudbase-document-database-web-sdk`,
  `cloudbase-document-database-in-wechat-miniprogram`, and the NoSQL-first fast path in
  `minimal-web-baas-demo`.
- **No WeChat Cloud Development.** WeChat Mini Program scenarios depend on the WeChat side of
  CloudBase, which belongs to the China site. `miniprogram-development`, `ai-model-wechat`,
  `auth-wechat-miniprogram`, and `cloudbase-wechat-integration` are out of scope here. For
  client apps use the Web SDK and HTTP API paths (`web-development`, `http-api-cloudbase`).
- **PostgreSQL platform boundaries still apply.** On PostgreSQL environments the platform
  rejects `ModifyResourcePermission` and the role actions outright. That is a platform
  boundary, not a misconfiguration — manage table permissions with RLS
  (`managePgDatabase(action="execute")` running `CREATE POLICY`) instead of retrying.

## Before acting

1. Resolve the environment first (`queryEnv(action="list")`, then `action="info"` with the
   `envId`). Never invent or assume an `envId`, and never reuse a China-site environment.
2. Read the matching file under `references/` completely before writing code.
3. Check `EnvInfo.RuntimeBackends` on `action="info"` output to pick the data backend before
   generating business code.
