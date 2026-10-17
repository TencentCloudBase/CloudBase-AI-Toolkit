---
name: cloud-api-operations
description: Operate Tencent Cloud control-plane resources (monitoring/alarms, CLB, CAM roles, COS, MySQL, SCF) via cloud APIs when no dedicated MCP tool covers the task. Use when a task needs control-plane operations beyond CloudBase's own tooling, or when a callCloudApi call failed and needs classifying.
version: 2.35.2
license: MIT
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

> **API first：公开 API 概览就是契约边界。** 索引里查不到某个能力，它就不在公开契约内 —— 不要拿某个 SDK 的封装方法反推未公开的 Action 名去调（这类 Action 不受公开文档保护，非该语言的使用者也无从照做）。此时改用有公开 API 的等价路径，或把缺口明确告诉用户。本 skill 的 recipes 只收录公开 API 覆盖的场景。

### 2. Choose the calling path

| Scenario | Path | Reference |
| --- | --- | --- |
| Interactive ops inside this session | MCP `callCloudApi` | `./references/calling-methods.md` §1 |
| Picking the `service` identifier / deciding whether `version` is needed | MCP `callCloudApi` | `./references/service-versions.md` |
| User's code / scripts | Official SDKs (TC3-HMAC-SHA256) or `@cloudbase/manager-node` | `./references/calling-methods.md` §2 |
| Quick one-off verification | API Explorer (https://console.cloud.tencent.com/api/explorer) | — |

Priority rule: if `@cloudbase/manager-node` has a matching method, use it; drop to raw cloud API only when it does not.

### 3. Check credentials before the first call

**Three identities produce the same error text.** Before reading anything into an `UnauthorizedOperation`, find out which one you are holding:

| Identity | How it is reached | CAM / CloudAudit |
| --- | --- | --- |
| Account-level login (`federated-user/<id>`) | Device-code / web login, or account-level SecretId + Key | reachable, subject to that identity's CAM policies |
| `TCB_QcsRole` service role | what CLI / MCP **become** after calling a CloudBase product API | refused (`resource (...) has no permission`) |
| Environment API Key (`<uin>:TCB-CAPI-Configured-idaas-apikey`) | `--cloudbase-api-key -e <envId>` | refused — the API Key model has no channel to attach arbitrary CAM policies |

Confirm the identity with `sts GetCallerIdentity` (`--api-version 2018-08-13`) before concluding anything: the refusal text is identical across all three rows, so it cannot tell you which row you are in.

**Order matters.** Calling a CloudBase product API swaps the identity to `TCB_QcsRole` for the rest of the session, so a CAM / CloudAudit call issued *after* any product call is refused even though the login is account-level. Do the CAM / audit work **first**.

- Read the current credential scope from `auth` tools: `credential_scope: account` = account-level, reaches control-plane APIs subject to that identity's CAM policies; `env` = API Key, scoped to one environment's data plane plus the fixed TCB policies.
- Permission comes from a different place per credential identity: the account-level identity's own policies, the API Key model (no channel to attach arbitrary CAM policies), or the TCB service role that CLI / MCP assume. Which cross-product capabilities that role family already covers is not fixed — read the attached policies (`ListAttachedRolePolicies` + `GetPolicy`) instead of assuming, and treat `UnauthorizedOperation` as "this identity lacks this action", never as a broken setup.
- On `UnauthorizedOperation` / `AuthFailure`, hand the user a **one-click CAM grant link** (role name + policy name + `principal`) instead of telling them to go find the policy in the console, then retry the original call. Role targets, the `principal` values, and which preset policy covers what: `./references/calling-methods.md` §3.

**Done when**: the credential identity has been confirmed with `sts GetCallerIdentity` (not inferred from the error text), and every permission error has been converted into a clickable authorization link carrying a concrete policy name before any retry.

### 4. Follow a proven recipe when one exists

Recipes encode the exact call sequence, required parameters, and empirically discovered pitfalls so the flow works on the first pass. One scenario per file — start from the index `./references/recipes/README.md`, whose 状态 column records how far each recipe has been verified:

- **PostgreSQL storage-usage alarm**: `./references/recipes/pg-storage-alarm.md`
- **ICP filing readiness and wait-time checks**: `./references/recipes/icp-filing-readiness.md`
- **PostgreSQL instance spec change and shared-to-dedicated upgrade**: `./references/recipes/pg-instance-spec.md`
- **Custom domain onboarding for an env (HTTP access domain, certificate, DNS binding)**: `./references/recipes/custom-domain.md`
- **Operation trace / 操作审计 — who did what, from which IP, with which key**: `./references/recipes/cloud-audit-operation-trace.md`
- **Platform edition onboarding — create env and issue the environment API key**: `./references/recipes/platform-onboarding.md`
- **Wiring that credential into a user's agent, one env per project**: `./references/recipes/platform-agent-connect.md`
- **Closing down the agent's tool surface — plugin trimming, gateway wrap for audit, expert-enforced constraints**: `./references/recipes/platform-agent-guardrails.md`
- **Platform edition usage, billing cycle, and environment recycling**: `./references/recipes/platform-usage-and-recycle.md`

**Done when**: every parameter value in the call sequence traces to a recipe value marked as verified (实测) or to official docs.

## Constraints

- Region is a top-level `region` argument (X-TC-Region), never a body param. Some APIs additionally take a short region code inside `Dimensions` (e.g. `sh` vs `ap-shanghai`) — these are different fields.
- Route SDK-language details to official SDK docs or sdkHints; keep this skill SDK-language-agnostic.
