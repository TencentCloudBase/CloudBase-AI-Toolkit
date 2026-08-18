# T9 live verification — 2026-08-19

Host: macOS / dsh `0.1.0-rc.6` / `@cloudbase/cloudbase-mcp@latest` (npx, logged `mcpVersion 2.28.1` in stderr) / tcb CLI 3.7.2

## Results

| Check | Result |
|---|---|
| `npm test` | 18/18 pass |
| `npm run typecheck` + `npm run build` | pass (server + client ModuleLoader factory + skill-cli) |
| MCP `tools/list` via plugin `CloudBaseMcpBridge` | **38 tools**, including auth / queryEnv / queryPgDatabase / queryMysqlDatabase / readNoSqlDatabaseContent / queryStorage / queryAppAuth / queryLogs / queryFunctions / manageHosting |
| patch contract | only `CLOUDBASE_ENV_ID` with string fallback; **no `CLOUDBASE_API_KEY`** |
| `dsh plugin --profile headless add <repo>/dsh-plugin` | profile `dsh.profile.bundles` includes `@cloudbase/dsh-plugin` |
| `dsh --profile headless --dump-config` | `# == @cloudbase/dsh-plugin`, `id: mcp-cloudbase`, `serverName: cloudbase`, `npx -y @cloudbase/cloudbase-mcp@latest`, env fallback present, **API Key absent** (no boot crash from `!!js` undefined) |
| `cloudbase-skills sync` | `~/.dsh/skills/cloudbase/{sites,web-development,postgresql,cloud-functions,auth-web,cloud-storage}` |
| panel `envInfo.envId` | full id `ai-share-d2guukyxybb63b206` (copyable in Config tab) |
| term-map | usage JSON has no FLEXDB/SCF/TDSQL |
| GitHub topic | `dsh-plugin` added on TencentCloudBase/CloudBase-AI-Toolkit |

## Host limitation (not a plugin defect)

`tcb env list` and the plugin-spawned MCP both fail token refresh with:

`FetchError: request to https://iaas.cloud.tencent.com/tcb_refresh failed, reason: unable to verify the first certificate`

Same TLS intercept on this machine. `queryEnv` still **runs** and returns the real auth-error + device-code hint (no fake EnvList). Cursor-hosted CloudBase MCP on the same machine can list real EnvIds, so the API path is valid when CA/login works.

## Not run in this unattended round

- Web profile `build:web` + clicking DetailsPanel 5 tabs (needs DSH web UI and a human)
- Full-stack todo `downloadTemplate → Vite → manageHosting` chat demo (needs a signed-in env after TLS refresh)

Replay:

```bash
cd dsh-plugin && npm test && npm run build
node scripts/e2e-live.mjs
dsh plugin --profile headless add .
dsh --profile headless --dump-config | grep -A20 '@cloudbase/dsh-plugin'
```
