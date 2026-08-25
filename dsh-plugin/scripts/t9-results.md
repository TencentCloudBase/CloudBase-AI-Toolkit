# T9 live verification — 2026-08-25 (037f3310)

Host: macOS / dsh `0.1.0-rc.6` / `@cloudbase/cloudbase-mcp` via plugin bridge / tcb CLI 3.7.2  
Env under test: `ai-native-d1ggefhgb8c27e3e8` (postgresql, ap-shanghai)

## Results

| Check | Result |
|---|---|
| `npm test` | **110/110** pass |
| `npm run typecheck` + `npm run build` | pass (server + client ModuleLoader factory + skill-cli) |
| `node ../scripts/e2e/verify-dsh-plugin.mjs` | all checks passed |
| MCP `tools/list` via plugin `CloudBaseMcpBridge` | **38 tools**, including auth / queryEnv / queryPgDatabase / queryMysqlDatabase / readNoSqlDatabaseContent / queryStorage / queryAppAuth / queryLogs / queryFunctions / manageHosting |
| patch contract | **no env at all** (device-code login); no `CLOUDBASE_ENV_ID`, no API key |
| `queryEnv action=list` | real EnvList |
| `setEnvironment(ai-native-…)` | bound; `envInfo.envId` full display |
| panel `listTables` | **59** objects |
| panel `listStorage` | callable (0 objects empty real) |
| `usage` | real API error when DescribeUsage lacks ResourceType (no fake metrics / no FLEXDB\|SCF\|TDSQL leak) |
| `dsh --profile headless --dump-config` | includes `@cloudbase/dsh-plugin` / `mcp-cloudbase` |
| GitHub topic | `dsh-plugin` present on TencentCloudBase/CloudBase-AI-Toolkit |

## Gate script

```bash
cd dsh-plugin && npm test && npm run build
node scripts/e2e-live.mjs
# optional override:
# CLOUDBASE_ENV_ID=<envId> node scripts/e2e-live.mjs
```

`e2e-live.mjs` now auto-binds `CLOUDBASE_ENV_ID` or default `ai-native-d1ggefhgb8c27e3e8` when signed in but unbound.

## Still blocked on Booker (not agent-owned)

- Merge PR #933 → main
- Tag `dsh-plugin-v0.1.0` → npm `@cloudbase/dsh-plugin@0.1.0`
- Oh-My-DSH curated PR (needs public npm package)
- Unattended full-stack chat demo (downloadTemplate → Vite → manageHosting) needs web profile + model session; panel channel + MCP tools proven above

## Prior note (2026-08-19)

Earlier TLS refresh failures on some hosts are environment-specific; this host now returns real EnvList + PG tables after device-code login.
