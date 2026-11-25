# Recipe 5 — 云开发环境的操作追溯（操作审计）

## When to use

需要回答**「谁、在什么时候、从哪个 IP，对我的云开发环境或它的资源做了什么操作」** —— 凭据被谁用过、某个环境/函数/数据库/域名是谁删的、配置被谁改的、某个操作到底发生过没有。

典型症状：

- 客户报「我的环境/配置莫名其妙变了或被删了」，要查操作来源。
- 排查异常调用：想知道某个 AccessKey 在某个时间窗内都调了什么。
- 合规/交付场景要导出一段时间内的管理面操作清单。

**本篇不管什么**：

- **数据面的业务请求**（用户访问你的云函数、数据库读写、HTTP 访问）→ 那是运行/网关日志，走日志服务查，本篇的接口查不到。
- 环境自身的运行报错与性能问题 → 走日志与监控。
- 本篇只解决**管理面云 API 调用**的追溯。

## 前置权限

| 项 | 值 |
| --- | --- |
| service / version | `cloudaudit` · `2019-03-19` |
| 开通与计费 | **无需开通、免费** —— 账号创建时即自动启用，查看/检索事件历史不额外计费 |
| 凭据身份 | **必须是账号级**，且**当前工作目录不能残留项目级凭据**。审计按**账号**记录，与环境无关：环境级凭据（环境 API Key / 托管授权 token）到不了；被换成服务角色 `TCB_QcsRole` 时也到不了。两者都要先认人再动手 |
| 查询所需策略 | `QcloudAuditReadOnlyAccess`（`PolicyId` `4732274`），覆盖 `cloudaudit:List*` / `Describe*` / `Get*` / `Look*`（`LookUpEvents` 属 `Look*`），另带 `cam:DescribeRoleList`、`cls:DescribeLogsets`、`cos:GetService` 等只读。**只查事件用这条就够** |
| 跟踪集管理所需策略 | `QcloudAuditFullAccess`（`PolicyId` `638468`），比只读版多出跟踪集管理。**仅在需要建/改跟踪集时才加**：`TCB_QcsRole` 是全平台共用的服务角色，能不给写权限就别给 |

### 先认人：三类凭据，权限面完全不同

被拒时**先 `pwd`，再 `sts/GetCallerIdentity`** —— 身份类型直接决定后面补什么：

| 凭据形态 | 落地身份（`Type` / `UserId`） | `cloudaudit` | 要补什么 |
| --- | --- | --- | --- |
| **账号级登录**（控制台扫码 / 设备码 / `tcb login`），且当前目录无残留凭据 | `CAMUser` · `federated-user/<uid>` | **通** | 不用补 |
| **账号级登录，但被换成服务角色** | `CAMRole` · `TCB_QcsRole-<uin>-<ts>` | 拒（`resource (*) has no permission`） | 给**角色**关联 `QcloudAuditReadOnlyAccess`（改信任策略没用） |
| **环境级（单环境）凭据**：环境 API Key / 托管授权 token | `CAMUser` · `<uin>:TCB-CAPI-Configured-idaas-apikey` | 拒（报错与角色被拒**长得一样**，根因不同） | 补策略没用，**必须换账号级凭据** |

两条机制各判一半：

1. **凭据按「项目根」分级解析，项目槽里那份优先于全局登录态。** 三层顺序：① 项目槽 `~/.config/.cloudbase/projects/<项目根路径转义>/auth.json`（**只在存着真凭据时生效**）→ ② 全局槽 `~/.config/.cloudbase/auth.json` → ③ 环境变量（`CLOUDBASE_API_KEY` + `CLOUDBASE_ENV_ID`，其次 `TENCENTCLOUD_SECRETID` / `KEY` / `SESSIONTOKEN`）。
   - **槽按「项目根」定位，不是按当前目录**：从 `cwd` 向上找 `cloudbaserc.json` / `cloudbaserc.js` / `.cloudbaserc` / `.git`，到 `$HOME` 为止，找不到就用 `cwd` 本身；目录名 = 该绝对路径里非字母数字全换成 `-`。⇒ **同一个仓库里换子目录没用**，仍是同一个槽；要拿到干净解析得换到**仓库外**没有 marker 的目录。
   - **空槽不遮蔽**：首次运行留下的 `{}` 不影响解析，会正常落回全局槽（已实测）。真正抢先的是槽里那份**环境级 API Key** —— 命中它时全局登录态**根本不会被读取**。
   - ⇒「我在别的目录登录过、这里却说是单环境」「登录了却只看得见一个环境」基本都是这条：先确认当前目录属于哪个项目根，再看那个项目的槽里存的是什么。
2. **调云开发自己的产品接口会把身份换成服务角色。** 同一份账号级登录，**先查审计是通的**；调用过 `tcb` / `tcbr` 系接口之后，再回来查审计就可能已被换成 `TCB_QcsRole` 而被拒。
   - ⇒ **要查审计就先查审计**；把顺序反过来是自己给自己制造「没权限」。

⇒「换个客户端试试」可以划掉：MCP、SDK、命令行走的是同一套凭据解析，病根在凭据本身（目录槽 + 是否被换成角色），不在客户端。

**三种错误形态，别混判**：

| 错误 | 形态 | 含义 |
| --- | --- | --- |
| `AuthFailure.UnauthorizedOperation`（`resource (*) has no permission`） | 带 `RequestId` | **已经到服务了**，是 CAM 拒绝 —— 要补权限 |
| `invalid token`（`RequestId: 0`） | 无有效 `RequestId` | **接入层就拦了**，凭据对不上这条链路 —— 换凭据，不是补策略 |
| `InvalidAction` | 带 `RequestId` | action 名或 `version` 写错。反过来，拿到 `AuthFailure` 就说明这个 action 存在 |

最小「认人 + 试查」，只给 `service / version / action / params` 四件套：

| 步 | service / version | Action | params |
| --- | --- | --- | --- |
| 认人 | `sts` · `2018-08-13` | `GetCallerIdentity` | 无 |
| 试查 | `cloudaudit` · `2019-03-19` | `LookUpEvents` | `{"StartTime":<整数秒>,"EndTime":<整数秒>,"MaxResults":3}` |

> **本篇与通道无关**：所有调用只写到 `service / version / action / params`，不绑定客户端 —— MCP 用 `callCloudApi` 传这四项、SDK 用对应产品的同名方法与同一段参数、命令行用 `tcb api <service> <Action> --body '{…}'`，三者入参与结论一致，任选其一即可。仅在命令行下要注意 `version` 必须显式给，不给会落到错误默认版本（例如 `sts` 被当成 `2018-04-16`，报 `InvalidAction`）。

### 给服务角色补权限（身份已是 `TCB_QcsRole` 时）

**要授的是「调用方身份所属账号」**，不是「用户控制台当前登录的账号」，两者经常不是同一个。`sts/GetCallerIdentity` 一次返回两个账号，别只看一个：`AccountId` 是**角色宿主主账号**（资源与环境在它名下），`PrincipalId` 是**申请该角色密钥的账号**（真正的调用方）。控制台要切到 `AccountId` 那个账号，并**优先用角色名定位，别用 `roleId`** —— `roleId` 是账号内资源，跨账号必然报「未查询到相关角色」。若该账号用户本人拿不到（MCP 走平台侧托管账号时就会这样），这条路直接不通：要么请账号主人在其上挂策略，要么改用「用户自己账号 + 自建**账号级**（非环境级）API Key」。

- ① **一键授权链接（首选）** —— 交给用户点一下，是这条路的**规范做法**（链接怎么拼、`principal` 取值表、两条边界都在 `../calling-methods.md` §3.2，不在这里重复）。本次要挂的就是把 `policyName` 换成审计只读：

  ```
  https://console.cloud.tencent.com/cam/role/grant?roleName=TCB_QcsRole&policyName=QcloudAuditReadOnlyAccess&principal=eyJzZXJ2aWNlIjpbInRjYi5jbG91ZC50ZW5jZW50LmNvbSJdfQ%3D%3D
  ```

- ② **调用 cam API 直接挂**（可重复执行，不用等人点；要求当前是**账号级身份**，否则自己也会被拒）：

  | 步 | service / version | Action | params | 取什么 |
  | --- | --- | --- | --- | --- |
  | 1 | `cam` · `2019-01-16` | `ListPolicies` | `{"Scope":"QCS","Keyword":"Audit","Page":1,"Rp":50}` | 预设策略的 `PolicyId`（`QcloudAuditReadOnlyAccess` = `4732274`） |
  | 2 | `cam` · `2019-01-16` | `AttachRolePolicy` | `{"AttachRoleName":"TCB_QcsRole","PolicyId":4732274}` | 只回 `RequestId`，**不代表已生效** |
  | 3 | `cam` · `2019-01-16` | `ListAttachedRolePolicies` | `{"RoleName":"TCB_QcsRole","Page":1,"Rp":100}` | 条数 +1，且能列出刚挂的那条 |

  三个 action 的入参就是上表，换通道只是换发送方式：MCP 走 `callCloudApi`（`service` / `action` / `version` / `params` 四项）、SDK 走 `cam` 客户端的同名方法与同一段参数、命令行走 `tcb api cam AttachRolePolicy --body '{…}'`。

  ⚠️ `ListPolicies` 要带 `Scope: QCS`（不带搜不到预设策略）；**关联的参数名是 `AttachRoleName`，复核的参数名又叫 `RoleName`**。**挂完之后立刻复核**（理由见下）。

- ③ **控制台手动关联**（需要**主账号**或**拥有访问管理读写权限**的账号）：

  ```
  https://console.cloud.tencent.com/cam/role?roleName=TCB_QcsRole
  ```

  页内两条路都行：**角色详情 → 关联策略**，或**策略页搜策略名 → 关联用户/组/角色**。

**挂完怎么确认（有两个验证死角）**：

- **没法在本地扮演该角色做端到端验证**：`sts:AssumeRole` 必被拒（该角色的信任策略 `principal` 只写了服务）；`cam:SimulatePrincipalPolicy` 报 `InvalidAction`（该 action 不存在）。
- ⇒ 判据只能落在两件确定性事实上：**策略已挂**（`ListAttachedRolePolicies` 条数 +1）与 **action 被覆盖**（策略正文里能看到 `cloudaudit:Look*`）。
- 读策略正文（都要求账号级身份）：`cam/GetPolicy`（`{"PolicyId":4732274}`）直接回 `PolicyDocument`，是一段**字符串**，二次解析后看 `statement[].action`；`cam/GetPolicyVersion` 多要一个 `VersionId`，且**必须是数字**（传字符串报 `InvalidParameter ... should be uint64`）。
- 🔴 **挂完立刻复核**：任何客户端会话（MCP / SDK / CLI）都可能把内存里的旧凭据快照写回凭据槽，隔几分钟当前身份可能已经不是刚才那个了，跨窗口的复核结论不可信。

边界与备注：

- **给服务角色加策略 = 扩大该角色的权限面**，不只是「让这一次调用通过」—— 拿到该角色临时密钥的任何调用方都会带上这份新权限，能用只读就别上全读写。
- **能不能用 `cam` 读接口「现场判断缺什么」，取决于当前身份**：账号级联邦身份（`federated-user`）可直接调通 `cam:GetRole` / `ListAttachedRolePolicies` / `ListPolicies` / `ListPolicyVersions`；换成 `TCB_QcsRole` 角色态后同样被拒。⇒ 「想查清缺什么权限」本身就要求先有账号级身份，**先 `pwd` + 认人**。
- **初始状态参照**：某账号的 `TCB_QcsRole` 起步挂 6 条策略（MongoDB / PostgreSQL / TCR / Lighthouse / CloudBase Run 等云开发自身资源），**一条 cloudaudit 都没有** —— 所以「调云开发没问题、查审计却没权限」是这个角色的常态，不是配置出了问题。
- **判断「现在挂在哪个账号」有两个入口**：① `sts/GetCallerIdentity` 的角色链（`Type` / `AccountId` / `PrincipalId` / `UserId`）；② `cam/GetUserAppId` 返回 `OwnerUin` 与 `AppId`，比读角色更直接。两者都不告诉你账号名，只能拿数字去核对。

控制台入口（人工核对与浏览）：`https://console.cloud.tencent.com/cloudaudit` → 左侧**操作记录**。控制台的「操作记录」**默认就有数据**，不要求先建跟踪集；跟踪集（最多 5 个）用于把日志**投递**到 COS 或 CLS 做长期归档，需要更长留存时才要碰它。

## 接口序列

### 1. 选一个检索接口

云审计有**两个**检索操作日志的接口，能力不同，按需求选：

| 接口 | 单次时间跨度 | 可回溯 | `NextToken` 类型 | 检索维度 |
| --- | --- | --- | --- | --- |
| `LookUpEvents` | ≤ **7 天** | — | **String** | 7 个 |
| `DescribeEvents` | < **30 天** | ≤ **90 天** | **Number** | 12 个（**含 `ResourceId`**） |

`LookUpEvents` 的 `AttributeKey` 取值：`RequestId`、`EventName`、`ReadOnly`、`Username`、`ResourceType`、`ResourceName`、`AccessKeyId`（+ `EventId`）。

`DescribeEvents` 的 `AttributeKey` 取值更全，额外支持：`ActionType`、`PrincipalId`、`ResourceId`、`SensitiveAction`、`ApiErrorCode`、`CamErrorCode`、`Tags`。

> 查**长区间**（>7 天）或要按**资源维度**精确筛 → 用 `DescribeEvents`；只查最近几天、要最少依赖 → 用 `LookUpEvents`。两个接口的 `NextToken` **类型不同**（String vs Number），翻页时别混用。

最小可跑序列（`service` / `version` / `action` / `params` 四件套）：

```
# A) LookUpEvents —— 时间必须是整数秒时间戳
{"service":"cloudaudit","version":"2019-03-19","action":"LookUpEvents","params":{
  "StartTime": <窗口起，整数秒>,
  "EndTime":   <窗口止，整数秒>,
  "MaxResults": 50,                            # 上限 50
  "LookupAttributes": [                        # 可选
    {"AttributeKey":"EventName","AttributeValue":"CreateEnv"}
  ]
}}
# 返回 NextToken 就带回去翻页；ListOver=false 表示还没取完

# B) DescribeEvents —— 跨度 <30 天，NextToken 是数字
{"service":"cloudaudit","version":"2019-03-19","action":"DescribeEvents","params":{
  "StartTime": <窗口起，整数秒，不早于 90 天前>,
  "EndTime":   <窗口止，整数秒>,
  "MaxResults": 50,
  "LookupAttributes": [
    {"AttributeKey":"ResourceType","AttributeValue":"tcb"}
  ]
}}
```

**返回要点**：

| 字段 | 用途 |
| --- | --- |
| `Events[]` | 记录集合，逐条见下表 |
| `TotalCount` | 本页/本次命中数 |
| `NextToken` | **有值就继续翻页**，当入参回传（注意类型） |
| `ListOver` | `false` = 还有下一页 |

单条 `Event` 的关键字段：

| 字段 | 含义 |
| --- | --- |
| `EventName` | API 名（如 `CreateEnv` / `DeleteFunction`） |
| `EventTime` | 事件时间（字符串，形如 `2026-09-30 23:09:34`） |
| `Username` | 操作用户名（主账号为 `root`，子用户为其名称） |
| `SourceIPAddress` | 来源 IP |
| `SecretId` | 使用的密钥 ID |
| `ErrorCode` | `0` = 成功；非 0 = 对应错误码 |
| `Resources` | `{ResourceType, ResourceName}` |
| `CloudAuditEvent` | **转义后的 JSON 字符串**，含 `requestParameters` 等原始入参 |

### 2. 展开原始请求参数

`Event.CloudAuditEvent` 是**字符串**，需要二次解析才能读到 `requestParameters`（其中才有引用具体环境/资源的参数）：

```
JSON.parse(event.CloudAuditEvent).requestParameters
```

### 3. 筛选出属于某个云开发环境的操作

云开发在审计里的 `ResourceType` 是**产品级**的 `tcb`（云托管 `tcbr`、低码 `lowcode`），**不细分到某个环境**。先把范围收到「云开发的管理面调用」：

```
{"AttributeKey": "ResourceType", "AttributeValue": "tcb"}
```

再按环境收敛，两条路：

1. **优先试 `ResourceId`**（仅 `DescribeEvents` 支持）：若云开发事件的资源 ID 就是 `EnvId`，可直接 `{"AttributeKey": "ResourceId", "AttributeValue": "<envId>"}` 精确命中。
2. **兜底：从请求参数里匹配**：取回后对 `JSON.parse(Event.CloudAuditEvent).requestParameters` 匹配 `EnvId`（`CreateEnv` / `DestroyEnv` / `ModifyEnv` 等接口的入参里就有），命中即属于该环境。

> ⚠️ **不要假设 `ResourceName` 一定带环境 ID**。它是「资源名」，是否填充取决于该 API 是否绑定资源：CAM 的 `GetPolicy` 事件是 `policy/7934***`（有值），而 `LookUpEvents` 自身的事件是空串。云开发里环境级写操作**可能**填 `env/<envId>`，账号级/入口级调用则大概率为空 —— **以实测为准**。
> 想知道某个 `ResourceType` 到底支持哪些检索维度，用 `GetAttributeKey`（按资源类型列出可用 `AttributeKey`），比猜可靠。

## 踩坑清单

| 坑 | 现象（真实报错原文） | 正确做法 |
| --- | --- | --- |
| 时间窗跨度超限 | `LimitExceeded.OverTime`：检索支持的有效时间范围是 7 天 | `LookUpEvents` 单次**最多 7 天跨度**；要查更长改用 `DescribeEvents`（<30 天），或按 ≤7 天循环多窗口合并 |
| 时间格式错 | `InvalidParameter.Time`：必须包含开始时间和结束时间，且必须为整形时间戳（精确到秒） | `StartTime` / `EndTime` 传**整数秒**时间戳，不要传日期字符串、不要传毫秒 |
| 起始晚于结束 | `InvalidParameterValue.Time`：开始时间不能大于结束时间 | 先校验 `StartTime < EndTime` 再发 |
| 单页要太多 | `InvalidParameterValue.MaxResult`：单次检索支持的最大返回条数是 50 | `MaxResults` ≤ 50，靠 `NextToken` 翻页拿全量 |
| 检索条件取值写错 | `InvalidParameterValue.attributeKey` | 按所用接口的取值表来（两接口支持的 key 不同）；两接口都**没有 EnvId** 这个维度 |
| 翻页翻不动 | 把 `LookUpEvents` 的 String `NextToken` 填给 `DescribeEvents`（或反着来） | 两个接口的 `NextToken` **类型不同**（String / Number），翻页只用同接口上一次的返回值 |
| 拿到的事件体读不出参数 | `CloudAuditEvent` 看起来是一坨带 `\"` 的字符串 | 它是**转义的 JSON 字符串**，先 `JSON.parse` 再读 `requestParameters` |
| 任一通道调都报没权限（MCP / SDK / CLI） | `cloudaudit:LookUpEvents ... you are not authorized`、`resource (*) has no permission` | **先 `pwd` 再认人**（见「前置权限」三类）：角色态 ⇒ 给角色挂策略；环境级凭据 ⇒ 换账号级凭据；账号级且无目录槽 ⇒ 本应能通，报错说明先跑过云开发接口被换成了角色 |
| 明明登录了却只有单环境权限 | 账号级调用全被拒、只看得见一个环境 | 当前目录里**钉着项目级凭据**（CLI 跑过的目录会留），优先级高于全局登录态 ⇒ 换一个**全新空目录**再验；要长期用它，清掉该目录的槽 |
| 明明有操作却查不到 | `Events` 为 `[]`，但确信刚发生过 | 审计事件**有 5~10 分钟延迟**；刚做的操作先等一会儿再查 |
| 想查的时间段取不到 | 更早的窗口恒为空 | 事件历史可追溯范围有限（`DescribeEvents` 上限 90 天）；更早的要靠**跟踪集**已投递到 COS 的归档 |
| 查了个空就下结论「没发生」 | `Events` 为 `[]`、`TotalCount` 为 0 | 空结果先排除四件事：**时间窗是否在范围内**、**`AttributeKey` 是否写错**、**凭据是否与目标同账号**、**是否还没到延迟时间**。四条都对上才能说「该窗口无记录」 |
| 变慢/被限频 | 频繁调用 | 接口默认频率限制 **20 次/秒**；长区间多窗口时控制节奏 |

## 验证步骤

0. **先验凭据能到**（否则后面全是假空）：`pwd` → `sts/GetCallerIdentity` 看身份 → 最小窗口 `LookUpEvents`。要的是 `Type: CAMUser` + `federated-user`；看到 `CAMRole` 或 `idaas-apikey` 就按「前置权限」先解决，**不要**拿一个必然被拒的凭据去跑后续步骤、再把空结果读成「没有操作」。
1. **窗口内已知操作能查到**：对一段**确认发生过操作**的时间窗发一次查询，`TotalCount > 0`，且能在 `Events[]` 里找到对应 `EventName` 与 `Username`。
2. **两个接口各跑通一次**：同一时间窗分别用 `LookUpEvents` 与 `DescribeEvents` 取，结果集应互相覆盖；据此确认 `NextToken` 类型差异不会用错。
3. **时间戳口径正确**：整数秒时间戳发出后不报 `InvalidParameter.Time`；把 `LookUpEvents` 跨度调到 8 天应复现 `LimitExceeded.OverTime`。
4. **翻页取全**：`NextToken` 非空时继续请求，直到 `ListOver = true`；合并后的条数与 `TotalCount` 一致。
5. **参数可展开**：随机取一条记录，`JSON.parse(CloudAuditEvent)` 成功，且能读到 `requestParameters` 里的具体参数。
6. **空结果归因**（用来确认「没有」是真的没有）：换一个**确认无操作**的时间窗，应为 `Events: []`；再故意把 `AttributeKey` 写成非法值，应复现 `InvalidParameterValue.attributeKey` —— 两条合起来证明空结果来自「确实没有」而不是「查错了」。
