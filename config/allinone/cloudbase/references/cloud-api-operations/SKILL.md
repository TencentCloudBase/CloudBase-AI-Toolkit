---
name: cloud-api-operations
description: Operate Tencent Cloud control-plane resources (monitoring/alarms, CLB, CAM roles, COS, MySQL, SCF, etc.) via cloud APIs when no dedicated MCP tool exists. Covers API discovery via the api-reference index, calling via MCP callCloudApi or official SDKs, credential/permission models with CAM authorization escalation, and battle-tested workflow recipes. Use when the task requires Tencent Cloud control-plane operations beyond CloudBase's own tooling.
version: 2.33.2
---

# Cloud API Operations

Operate Tencent Cloud resources that CloudBase depends on but that no dedicated MCP tool covers (monitoring & alarms, CLB, CAM roles, cross-product infra). Two goals: **find the right API without guessing**, and **reuse proven workflows instead of re-exploring**.

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../cloudbase-platform/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

## When to use

- The user asks to manage/operate Tencent Cloud resources beyond CloudBase's dedicated MCP tools (e.g. configure alarm policies, inspect CLB, attach CAM policies).
- The user wants to control these resources from code and asks which API/SDK to use.
- A callCloudApi call failed and you need to classify the error (wrong Action / wrong params / missing CAM permission) and recover.

## Workflow

### 1. Discover the API — resolve names from a documented source

1. **Read the API index first**: https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/api-reference.md — auto-synced daily, action-level coverage (TCB 105 + dependency products: MySQL / SCF / COS). Check rate limits there too. The index check is a quick grep — run it in parallel with step 2/3 fetches, do not serialize.
2. If the index does not cover the target product, go to the product's official API docs (e.g. monitor: https://cloud.tencent.com/document/product/649/30343) and confirm the exact Action name, Version, and parameters.
3. For machine-readable parameter schema, fetch the official SDK models source directly — see `./references/calling-methods.md` §2 item 4.

**Done when**: the Action name, Version, and full parameter shape each trace to the index, official product docs, or SDK models source — nothing from memory. A call that still returns `action ... is invalid or not found` means a name was not resolved this way; classify and recover via the error table in `./references/calling-methods.md` §1.

### 2. Choose the calling path

| Scenario | Path | Reference |
| --- | --- | --- |
| Interactive ops inside this session | MCP `callCloudApi` | `./references/calling-methods.md` §1 |
| User's code / scripts | Official SDKs (TC3-HMAC-SHA256) or `@cloudbase/manager-node` | `./references/calling-methods.md` §2 |
| Quick one-off verification | API Explorer (https://console.cloud.tencent.com/api/explorer) | — |

Priority rule: if `@cloudbase/manager-node` has a matching method, use it; drop to raw cloud API only when it does not.

### 3. Check credentials before the first call

- Read the current credential scope from `auth` tools: `credential_scope: account` = account-level, reaches control-plane APIs subject to that identity's CAM policies; `env` = API Key, scoped to one environment's data plane plus the fixed TCB policies.
- The TCB role family lacks alarm-management permissions by default — expect a permission error on first alarm calls (details and the verified evidence in `./references/calling-methods.md` §3).
- On `UnauthorizedOperation` / `AuthFailure`, compose the one-click CAM authorization link for the user per the programmatic flow in `./references/calling-methods.md` §3, then retry the original call.

**Done when**: the credential scope is known, and every permission error has been converted into an authorization link + concrete policy name for the user before any retry.

### 4. Follow a proven recipe when one exists

Recipes encode the exact call sequence, required parameters, and empirically discovered pitfalls so the flow works on the first pass. One scenario per file — start from the index `./references/recipes/README.md`:

- **PostgreSQL storage-usage alarm** (fully verified in production, 2026-09-08): `./references/recipes/pg-storage-alarm.md`

**Done when**: every parameter value in the call sequence traces to a recipe value marked as verified (实测) or to official docs.

## Constraints

- Region is a top-level `region` argument (X-TC-Region), never a body param. Some APIs additionally take a short region code inside `Dimensions` (e.g. `sh` vs `ap-shanghai`) — these are different fields.
- Route SDK-language details to official SDK docs or sdkHints; keep this skill SDK-language-agnostic.
