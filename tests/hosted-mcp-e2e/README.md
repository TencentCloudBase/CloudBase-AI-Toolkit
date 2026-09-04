# Hosted MCP E2E

End-to-end client compatibility tests for CloudBase **hosted MCP**
(`https://tcb-api.cloud.tencent.com/mcp/v1`) using the official
`@modelcontextprotocol/sdk` `StreamableHTTPClientTransport`.

These tests do **not** exercise the local stdio MCP package. They talk to the
cloud BFF over Streamable HTTP (OAuth 2.1 DCR+PKCE and/or static credentials).

## Quick start

```bash
# No credentials / no network opt-in → all suites skip (exit 0)
npm run test:hosted-mcp:e2e

# Staging (hosts → 21.22.73.179, HTTP only, TLS disabled) — enables W/N + optional modes
MCP_E2E_TLS_INSECURE=1 \
MCP_E2E_ENDPOINT=http://tcb-api.cloud.tencent.com/mcp/v1 \
MCP_E2E_ISSUER=https://tcb-api.cloud.tencent.com \
npm run test:hosted-mcp:e2e
```

Anonymous discovery/negative suites require `MCP_E2E_ENDPOINT` or `MCP_E2E_NETWORK=1`
(or any Mode A/B credentials). This keeps bare CI runs green when `/etc/hosts` points
at staging without TLS.
## Modes (env-driven)

| Mode | `MCP_E2E_MODE` | Required env | Asserts |
| --- | --- | --- | --- |
| A static credentials | `apikey` (or unset) | `MCP_E2E_ENV_ID` + (`MCP_E2E_API_KEY` **or** `MCP_E2E_SECRET_ID`/`MCP_E2E_SECRET_KEY`) | initialize, tools/list, `queryEnv(action=list)` |
| B headless OAuth | `oauth` (or unset) | `MCP_E2E_API_KEY` + `MCP_E2E_ENV_ID` | DCR→authorize→apikey→consent→token→initialize+tools/list; refresh_token (T1) |

Missing credentials → suites **skip** (not fail).

### Extra env

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_E2E_ENDPOINT` | derived from issuer | MCP Streamable HTTP URL |
| `MCP_E2E_ISSUER` | `https://tcb-api.cloud.tencent.com` | OAuth issuer / well-known base |
| `MCP_E2E_TLS_INSECURE` | off | `undici.Agent({ connect: { rejectUnauthorized: false } })` |
| `MCP_E2E_FORCE_HTTP` | off | Rewrite `https://` → `http://` on redirects |
| `MCP_E2E_DCR_BURST` | `3` | N2 DCR burst size; set `61+` to assert 429 |
| `MCP_E2E_STRICT_WELLKNOWN` | off | Fail if path-aware auth-server well-known is missing |

## Staging hosts tip (2026-09-02)

```
# /etc/hosts
21.22.73.179 tcb-api.cloud.tencent.com
```

Proxy must be `DIRECT` for that host. Port **443 has no TLS**; use
`http://tcb-api.cloud.tencent.com/mcp/v1` + `MCP_E2E_TLS_INSECURE=1`.

## Suites

| File | Coverage |
| --- | --- |
| `discovery.test.js` | W1 well-known dual paths, W2 401 WWW-Authenticate |
| `negative.test.js` | N1 forged JWT, N2 DCR rate limit, N3 bad env_id |
| `apikey-mode.test.js` | Mode A |
| `oauth-mode.test.js` | Mode B + T1 refresh_token |
| `protocol.test.js` | P1 protocol versions, P2 capabilities, P3 `queryPgDatabase(context)` |

## CI sketch (not wired in this change)

1. Store secrets: `MCP_E2E_API_KEY`, `MCP_E2E_ENV_ID`, optional SecretId/Key.
2. Nightly / manual workflow on `workflow_dispatch` + `schedule`.
3. Job env: `MCP_E2E_TLS_INSECURE=1` only for staging; production uses normal HTTPS.
4. Default PR CI: run **without** secrets (skip modes, still cover W1/W2/N1 smoke against public prod **or** skip network via `MCP_E2E_SKIP_NETWORK=1` if added later).

## Known staging issues (record in PR)

- `GET /.well-known/oauth-authorization-server/mcp/v1` → `BAD_REQUEST` (root path works).
- Authorize `Location` advertises `https://` even when clients must use `http://` on staging.
