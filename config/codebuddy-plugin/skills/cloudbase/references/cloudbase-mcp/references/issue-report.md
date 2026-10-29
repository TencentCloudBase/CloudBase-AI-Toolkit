# Issue report (整理一份可分享的问题报告)

Use this when a CloudBase MCP call fails and the user cannot, or will not, paste the whole conversation. Produce two parts: the **call chain** (what happened) and the **intent review** (why it went wrong). The second part is what a maintainer cannot reconstruct from logs, and what a fix usually depends on.

## Opening line

Say this before collecting anything, so the user knows what is being asked for:

> 不用发整段对话。把失败的那几步整理成一份报告就够了，业务内容我会打码。

## Part A — Keep this, drop that

A conversation is mostly text that does not matter for a bug. A maintainer needs the call chain, not the chat.

Keep:

- the tool name, its `action`, and the arguments' shape — key names and types only
- the error **wording**, kept as-is, with its values replaced — never paraphrased, never trimmed down to "it failed"
- `RequestId` from the response, exactly as returned — it is the only key to the server-side log
- `envId`, `site`, `region`, `auth_status`
- the order of calls, and how long each took

Drop:

- the user's prompt text, generated code, file contents, database rows
- every value inside arguments or results
- table names, business entity names, product names — replace with `<table>`, `<entity>`

## Part B — Why it went wrong

Logs record actions, not reasons. A trace can show that `manageFunctions` was called with an empty `functionName`; it cannot show that the agent believed the field was optional. Only the agent that made the decision still knows, so ask it before the context is gone.

Answer these in order. Keep every answer free of business content — name the action, not the object.

1. **Goal.** One sentence. What was the user trying to reach?
2. **Planned path.** What you intended to do when you started, before any tool ran.
3. **Actual path.** What you did, step by step, next to the plan. The gap between the two columns is the finding.
4. **What pulled you off.** For each wrong step, the single thing that made it look right. Not "I was careless" — the concrete source, named from the table below.
5. **The turn.** The first step where reality disagreed with the plan. What signal appeared, what you read it as, why you kept going.
6. **Replay.** What you would do first if you started over.

### Sources — pick one per wrong step

Each source has a different owner, and therefore a different fix. Naming the wrong source sends the fix to the wrong team.

| Source | Looks like | Fix owner |
| --- | --- | --- |
| `expert` | the whole approach came from an expert pack's SOP | the pack |
| `skill` | you followed a loaded skill's instructions | the skill |
| `doc` | a repo or site doc said so | the doc |
| `web` | a WebFetch or WebSearch result said so — often an older API shape | the retrieved page |
| `tool-output` | a tool returned a field, a null, or an error that misled you | the tool |
| `user-wording` | the request was read too literally, or a word meant something else | wording or UX |
| `memory` | a conclusion carried over from an earlier session | memory |
| `none` | no reference at all — you answered from priors | model or tool description |

`none` is a legitimate answer and usually the most useful one. A wrong guess with nothing behind it is a tool-description problem, not a documentation problem.

### Attribution table

| Step | Source | Where exactly | What it said | Correct | Fix owner |
| --- | --- | --- | --- | --- | --- |
| 3 | `skill` | `../cloudbase-cli/SKILL.md` § Deploy | use `tcb functions:deploy` | no, removed in 2.30 | skill |

**One rule keeps this table honest:** `Where exactly` must be a path plus a section, a URL, or a tool name plus a field name. If you cannot point at one, the source is `none` — delete whatever else you wrote in that row.

Agents like to blame a stale doc, because that lands the fault elsewhere. If you cannot quote the line that misled you, there was no such line.

**Expert packs need a separate check.** A pack shapes who you are, not what you read, so it never appears in a list of documents. Ask plainly: whose persona or SOP is running in this session? If you cannot tell, write `unknown` instead of assuming it was yours alone.

### The turn

This is the highest-value field in the report. Fill it with what you observed at that moment, not with what you learned later:

- **Signal** — the exact thing you saw: an error string, an empty result, a field that came back null.
- **Read as** — what you took it to mean at the time.
- **Actually** — what it meant, now that you know.
- **Why ignored** — what made the wrong reading feel right: a plausible default, a previous success, an assumption you never checked.

If you cannot separate "read as" from "actually", you are writing hindsight. Delete the row and try again, or write `unknown`.

### No hindsight

Every sentence in Part B must use only what was known at that step. Two checks:

- If an explanation cites an error message that had not appeared yet, it is fabricated. Cut it.
- If the plan column contains a detail you could only have learned by finishing the task, move it to the actual column.

A blank field is usable. A polished reconstruction is not — it sends the fix in the wrong direction.

## What is visible here, and what is not

State only what you observed.

| Field | Visible in this session? |
| --- | --- |
| Tool names, arguments, and results | yes |
| Raw error text and `RequestId` | yes, from the tool response |
| `auth_status`, `current_env_id` | yes, via `auth(action="status")` |
| Skills you loaded, docs you read, tools you called | yes — from your own context |
| OS, time, local Node and MCP package version | yes, from the shell |
| Host client name and version | no — ask the user |
| MCP capabilities declared at `initialize` (elicitation, ui) | no |
| Why a tool never loaded at all | no — nothing was called |
| Server-side logs, cloud API internals | no |

Write `unknown` for anything on the right that the user did not supply. Never infer a version from a URL, a host name, or a similar-looking issue.

## Ask for at most three things

Past three, the user stops replying.

1. The error line the user saw on screen — text or a screenshot.
2. The `envId` involved, or a yes/no on the one already in the report.
3. The host client and its version (WorkBuddy, CodeBuddy, Cursor, and so on).

## Redaction — the customer's business comes first

The risk here is not mainly credentials. It is the customer's business: what they sell, how their tables are shaped, what their code does, who their users are. A report leaking a table name or a customer list is worse than no report at all.

### The test

For every value, ask one question: **if this is deleted, can the maintainer still locate the failure?**

- No → delete it.
- Yes, but it is load-bearing → replace it with its kind.

### Four tiers

| Tier | What falls here | What to do |
| --- | --- | --- |
| **never** | password, SecretId / SecretKey, API key, token, cookie, connection string, private key | remove, leave `<secret>` |
| **mask for public only** | uin, openid, phone, email, IP, bucket name | full value to a private channel; masked if the report is posted publicly |
| **abstract** | table and column names, business entities, product names, the user's actual request, code identifiers | replace with its kind |
| **keep** | **`envId`**, `site`, `region`, tool name, `action`, error code, `RequestId`, `status`, duration, versions, **skill and doc paths** | copy exactly |

Two rows carry the weight here.

- **`envId` is kept.** It is the only handle that reaches the environment's resources, and it grants no access on its own: without a credential nobody can act on it. Masking it makes the whole report unactionable. The one exception is a public issue — the repo convention is to keep environment IDs out of public text, so post there with the first 6 characters and send the full value through a private channel.
- **Skill and doc paths are kept.** If you abstract a skill path into `<path>`, the attribution table in Part B loses its evidence and the report becomes unusable.

### Two destinations

| Destination | `envId` | uin / openid / phone / email | secret |
| --- | --- | --- | --- |
| internal ticket, email, chat | full | full | never |
| public issue (GitHub, cnb) | first 6 | masked | never |

`RequestId` stays intact in both — it carries no business content and only we can resolve it.

### Error text is where leakage actually happens

Cloud API errors embed values. So copy the sentence, replace the values, keep the shape — the wording is usually the diagnosis:

```
good   InvalidParameter: table "<table>" does not exist
bad    InvalidParameter: table "order_detail_2024" does not exist
bad    table not found
```

The third line is over-redaction: the error class and the shape are gone, and now nobody can reproduce it.

### Masking reference

| Item | Write as |
| --- | --- |
| `envId` | full value, e.g. `mcp-pg-ky5u9q` (public issue: `mcp-pg…`) |
| uin | `1000****23` for public; full value in a private channel |
| phone | `138****5678` |
| email | `a***@b.com` |
| string value | `"<string:32>"` |
| array | `"<array:12>"` |
| table / column | `<table>` / `<column>` |
| business entity | `<entity>` |
| absolute path | `<local path>` |
| the user's request | restate the intent in your own words; never quote it |

Quoting the user is the most common leak, because their message is nothing but business content. Say 「改数据库结构」, not what they actually wrote.


## Template

Write the report in the user's language. Keep the headings.

````markdown
# MCP 问题报告

## 一句话
<目标是什么，实际发生了什么>

## A. 调用链

### 环境
| 项 | 值 |
| --- | --- |
| 时间 | 2026-10-27 16:20 GMT+8 |
| 客户端 | WorkBuddy 5.9.2（用户提供） |
| 连接方式 | remote 国内 / remote 国际 / local stdio |
| MCP 版本 | 2.36.1 / unknown |
| 站点 · 地域 | domestic · ap-shanghai |
| envId | mcp-pg-ky5u9q（公开 issue 写 mcp-pg…） |
| 登录态 | auth_status=READY，uin=1000****23 |

### 调用
| # | 工具 | action | 结果 | 耗时 | 错误码 | RequestId |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | queryEnv | list | ok | 320ms | — | — |
| 2 | manageFunctions | createFunction | fail | 8.2s | InvalidParameter | 8f2c1a… |

### 错误原文
```
<保留句式，替换业务值：InvalidParameter: table "<table>" does not exist>
```

## B. 意图复盘

### 目标
<一句话>

### 打算 vs 实际
| 步 | 打算这么做 | 实际做了 | 偏差 |
| --- | --- | --- | --- |
| 1 | 先读 schema 再调用 | 直接调用 | 跳过了确认 |

### 归因
来源只能是：`expert` / `skill` / `doc` / `web` / `tool-output` / `user-wording` / `memory` / `none`

| 步 | 来源 | 具体位置 | 它说了什么 | 是否正确 | 该谁修 |
| --- | --- | --- | --- | --- | --- |
| 3 | skill | `../cloudbase-cli/SKILL.md` § 部署 | 用 `tcb functions:deploy` | 否，2.30 已移除 | skill |

### 翻车点
第 2 步。
- 当时看到：<原始信号>
- 我理解成：<当时的判断>
- 实际是：<真实原因>
- 为什么没看出来：<让错误判断显得合理的那个前提>

### 重来会怎么做
1. …

## 已排除
- 工具在会话的 tool list 里 → 不是 wiring
- `auth(action="status")` 返回 READY → 不是凭证或绑定

## 未获取
- MCP 服务端版本
- 客户端在 `initialize` 声明的能力
````

## Filling it in

- **一句话** — one sentence: the goal, then the divergence. No history.
- **调用** — every call that led to the failure, in order. Skip unrelated tool use from earlier in the session.
- **错误原文** — copy the wording, replace the values (see Redaction). If it is long, keep the first and last lines and mark the cut with `…[truncated]`. Do not summarize: the wording usually is the diagnosis.
- **打算 vs 实际** — fill both columns from the same moment. Writing the plan after seeing the outcome turns the table into fiction.
- **归因** — one row per wrong step, and `Where exactly` must resolve to a real anchor. A row you cannot anchor becomes `none`, which is still a finding: it means the tool description did not stop you, and that is what has to change.
- **翻车点** — one step, not a summary of the whole run. If three things went wrong, pick the first one; the rest are usually its consequences.
- **已排除** — only what you checked in this run. Each item saves the maintainer a round trip.
- **未获取** — the gaps from the visibility table. An honest gap is a faster fix than a confident guess.

Hand the finished text to the user to submit. `prepareFeedback` only opens the new-issue page for the current site; it uploads nothing. The user pastes the report there.
