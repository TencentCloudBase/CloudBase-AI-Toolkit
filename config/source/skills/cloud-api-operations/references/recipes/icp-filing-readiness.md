# Recipe 2 — ICP 备案：提交前自查与等待期查询

## When to use

准备用云开发环境作为备案云资源，或已在备案流程中需要把「能不能提、要等多久、被什么卡住」查清楚时：

- 提交前想知道当前云开发环境够不够格当备案云资源（套餐、剩余有效期、固定 IP）
- 判定出「未开启云托管固定 IP」后，要把它开启（序列 E）
- 想知道**现在能不能提交下一条备案**（同一主体下多条备案不能并行）
- 想知道某个省大概要审多少天、这个省对个人/企业有什么硬性限制
- 想知道某个域名的备案状态（管局是否通过、是否已落地、是否被拦）

本篇覆盖「判定能不能备」和「把环境调到能备（开固定 IP）」，到此为止。**提交备案、上传材料、人脸/视频核身**在腾讯云备案小程序里完成，不走云 API；域名注册 / 实名转 [domain](../service-versions.md)；证书申请转 `ssl`；备案通过后往云开发绑自定义域名转 `manageHosting` / HTTP 网关。

## 前置权限

用到的 service：

| service | version | 用途 |
| --- | --- | --- |
| `tcb` | `2018-06-08` | 读环境准入判定（备案资源与不符合项） |
| `tcbr` | `2022-02-17` | 读 / 改云托管固定 IP 状态 |
| `ba` | `2020-07-20` | 读备案订单、主体、省份规则、域名状态 |

**凭据身份：账号级。** 备案数据挂在腾讯云账号下，与环境无关 —— 但 `callCloudApi` 有环境绑定门禁，账号级登录后仍需先 `auth(action="set_env", envId=…)` 绑一个环境（任一正常环境即可，不参与备案判定），否则首个调用返回 `ENV_REQUIRED`。

`ba` 的接口是**操作级**授权。账号读自己的备案数据一般不需要额外策略；出现 `UnauthorizedOperation` 时，给**该身份**追加 ICP 备案（`ba`）的读权限，链接拼法与角色载体读法见 [calling-methods.md §3](../calling-methods.md)。

官方接口文档：https://cloud.tencent.com/document/api/243/ （请求域名 `ba.tencentcloudapi.com`）。

## 接口序列

### A. 环境够不够格当备案云资源

| 步 | Action | service | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 1 | DescribeICPResourcesInfo | `tcb` | `{ "EnvId": "<envId>" }` | `IcpNotAllowedReason[]`、`ICPResources[]`、`Total` |

**一条调用给出三项准入的完整判定**，不用逐项去查。`IcpNotAllowedReason` 是**不符合项**的枚举数组，三项都满足时为空数组：

| 值 | 含义 | 解法 |
| --- | --- | --- |
| `packageUnsupported` | 当前套餐不支持备案 | 升级套餐 |
| `validPeriod` | 剩余有效期不足（需大于 6 个月） | 续费环境 |
| `fixedIpNotEnabled` | 未开启云托管固定 IP | 开启固定 IP（序列 E） |

`ICPResources[]` 是可用于备案的资源列表，每项含 `ResourceId`（云托管服务 ID）、`ResourceIp`（**备案时要填的那个 IP**）、`Region`；有任一项不满足时该数组为空。

会同时出现的是 `packageUnsupported` + `validPeriod`（套餐不对时有效期必然也不够）—— 按「先解决 `packageUnsupported`」的顺序推进，否则续完费仍然备案不了。

需要看页面时，该环境的**备案管理**页 `https://tcb.cloud.tencent.com/dev?envId=<envId>#/env/filing-manage` 会把上述状态与对应操作入口一并列出。要单独读套餐与到期时间的原始值，用 `tcb/DescribeEnvInfo` 的 `EnvInfo.BillingInfo.PackageId` 与 `ExpireTime`；但准入判定以 `DescribeICPResourcesInfo` 为准，不要自己按天数算 —— 边界（是否严格大于 6 个月）由服务端定。

### B. 现在能不能提交备案（同主体互斥判定）

| 步 | Action | service | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 2 | DescribeLastIcpOrderInProgress | `ba` | `{}` | `IcpOrderId` |
| 3 | DescribeIcpOrders | `ba` | `{ "Offset": 0, "Limit": 10 }` | `TotalCount`、`Rows` |
| 4 | DescribeUserSummary | `ba` | `{}` | `PassedCount`、`PendingCount` |

步骤 2 是互斥判定的正解：`IcpOrderId` 返回**空串表示当前没有进行中的订单**（实测），可以发起新订单；非空则表示已有一条在路上，此时提交第二条会被拦。提交前先查这一步，比等到被驳回再排查省一轮等待。

步骤 3 看历史订单总量，步骤 4 看通过 / 待处理计数。

### C. 要等多久、这个省有什么硬规则

| 步 | Action | service | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 5 | DescribeEvaluateAuditDays | `ba` | `{}` | `Result`（JSON 字符串，`ProvinceCode` → 预计天数） |
| 6 | DescribeProvinceRules | `ba` | `{}` | `ProvinceRules[].Personal` / `.Enterprise`（HTML 片段） |
| 7 | DescribeOrganizationTypes | `ba` | `{}` | `OrganizationTypes[].Type` 与 `CertTypes[]`（主体类型 / 证件类型枚举） |

步骤 5 返回各省预计审核天数（`ProvinceCode` 是六位行政区划码，如 `110000` 北京、`440000` 广东），用来给使用者一个量级预期，而不是「一般 1-20 个工作日」。

步骤 6 返回各省管局对个人 / 企业的硬规则原文（HTML），提交前按自己所在省读一遍，网站命名、域名后缀、负责人年龄这类限制都在里面。

### D. 域名与主体当前状态

| 步 | Action | service | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 8 | DescribeDomainIcpStatus | `ba` | `{ "Domain": "<domain>" }` | `GovStatus`、`LandedStatus`、`AuditTicket`、`Ban` |
| 9 | DescribeIcpSubject | `ba` | `{}` | `Result`、`ContentData` |
| 10 | DescribeIcpRegister | `ba` | `{}` | `Webs[]`（该账号已备案的网站） |
| 11 | DescribeInWhiteList | `ba` | `{}` | `Rows[]` |

步骤 8 的四个布尔字段分别对应：管局是否已通过、是否已落地到腾讯云、是否有核查工单、是否被拦。域名不是自己的、已在别处备案未接入、被列入限制名单，都会在这里体现，不必等到提交后才被打回。

### E. 开启云托管固定 IP（写操作）

序列 A 判定出 `fixedIpNotEnabled` 时走到这里。固定 IP 挂在**云托管（tcbr）**下，不是云开发环境自身的配置。

| 步 | Action | service | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 12 | DescribeStableIP | `tcbr` | `{ "EnvId": "<envId>" }` | `Status`（空串 = 未开启）、`Address`、`ExpireTime` |
| 13 | ModifyStableIPStatus | `tcbr` | `{ "EnvId": "<envId>", "Status": "ON" }` | `TaskId` |
| 14 | DescribeStableIPTask | `tcbr` | `{ "EnvId": "<envId>", "TaskId": <TaskId> }` | `Result`（`running` / `success` / `failed`） |

步骤 12 先确认现状：`Status` 为空串表示未开启，`Address` 是已分配的固定 IP。

步骤 13 是**异步任务**，只返回 `TaskId`，不等于已生效；步骤 14 用它轮询，`Result` 仍为 `running` 就继续等（间隔 2 秒量级）。生效后重跑序列 A，`fixedIpNotEnabled` 才会消失。

关闭固定 IP 把步骤 13 的 `Status` 换成 `OFF`，轮询同一套。

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 账号级登录仍被拦 | 首个 `ba` 调用返回 `ENV_REQUIRED`（「当前已登录，但尚未绑定环境」） | 先 `auth(action="set_env", envId=…)`；备案本身与环境无关，绑任一个正常环境即可 |
| 猜错环境信息 Action | `tcb/DescribeEnvBaseInfo` → `action is invalid or not found` | 环境基础信息用 `tcb/DescribeEnvInfo`（不是 `EnvBaseInfo`） |
| 以为设备列表能直接查 | `ba/DescribeDevices` / `ba/DescribeTaskDevices` → `missing the required parameter Skey` | `Skey` 来自备案订单流程，公开面拿不到；要判定「环境能否作为备案资源」走序列 A |
| 以为网站名能独立校验 | `ba/ValidateSiteName` → `missing the required parameter IcpOrderID` | 它只能在已有订单内校验；提交前自查改用序列 C 的省份规则 |
| 以为能查任意账号 | `ba/CheckAccountNotBeian` 缺 `CheckUin`、`ba/CheckIcpRestrictionsByAh` 缺 `Uin` | 这两个是查指定 Uin 的通道，不是「查我自己」的默认入口 |
| 域名详情查不了 | `ba/DescribeIcpDomainInfo` 缺 `Type`，补上后又缺 `Value` | 只想看域名备案状态时用 `ba/DescribeDomainIcpStatus`，只需 `Domain` |
| APP 备案状态查询 | `ba/DescribeAppIcpStatus` → `missing the required parameter CertificateNumber` | 该接口按备案号查，需先有备案号；新申请阶段查不到 |
| 管局时长查询 | `ba/DescribeAvgAuditDaysByAh` → `missing the required parameter OrderType` | 按省份量级预期用 `ba/DescribeEvaluateAuditDays`（无需参数） |
| 以为准入判定只能翻控制台 | 只读 `tcb/DescribeEnvInfo` 拿不到「固定 IP 是否开启」，就以为要人工看页面 | `tcb/DescribeICPResourcesInfo` 一条就返回三项判定（含 `fixedIpNotEnabled`），备案管理页展示的是同一份数据 |
| 去环境设置页找固定 IP 开关 | `#/env/env-setting` 只有环境信息、QPS、预览状态，没有固定 IP 卡片 | 备案管理页只是入口（点「开启固定IP」会跳到云托管的 `#/platform-run/env-setting`）；AI 侧直接走序列 E，不必进控制台 |
| 按 API 概览清单找接口 | `tcb/DescribeICPResourcesInfo` 未收录在 TCB 官方 API 概览页的接口清单里，按清单检索会漏掉它 | 以实际可调为准 —— 该 Action 已在公开云 API 上可用；清单收录有滞后，先试调再判定「没有这个接口」 |
| 用环境级凭据路径去查 | 环境级 API Key 只能看到绑定环境，备案数据看不到 | 备案查询用账号级登录取凭据 |
| 把 `ba` 当成国际站能力 | 国际站账号查不到国内备案数据 | 备案是腾讯云国内站业务，走国内站身份查询 |

## 验证步骤

1. **序列 A**：`DescribeICPResourcesInfo` 返回 `IcpNotAllowedReason` 与 `ICPResources`。**数组为空 + `ICPResources` 非空**（每项都有 `ResourceId` / `ResourceIp` / `Region`）才算够格备案；数组非空就按上表逐项解决，不要往下走。
2. **序列 B**：`DescribeLastIcpOrderInProgress` 返回 `IcpOrderId` —— 空串即「无进行中订单」，非空则停下来先处理这条订单，不要提交第二条。
3. **序列 C**：`DescribeEvaluateAuditDays` 的 `Result` 能解析成 `ProvinceCode` → 天数的数组，且能对上自己省份的行政区划码；`DescribeProvinceRules` 里能定位到自己省份的 `Personal` / `Enterprise` 段落。
4. **序列 D**：`DescribeDomainIcpStatus` 返回四个布尔字段。任意一项为 `true` 时，先按对应语义处理（`GovStatus` 已通过、`LandedStatus` 已落地、`AuditTicket` 有工单、`Ban` 被拦），再决定是否发起新订单。
5. **序列 E 是唯一会改状态的一段**：动手前先用 `DescribeStableIP` 确认当前状态，避免误开或误关；`ModifyStableIPStatus` 拿到 `TaskId` 后必须轮询 `DescribeStableIPTask` 到 `Result` 不再是 `running`，再重跑序列 A 确认 `fixedIpNotEnabled` 已消失。只轮询到一半就收工，等于把「到底开没开上」留给下一个人。
6. 序列 A–D 只调用 `Describe*`，不产生订单或状态变更；若这几步返回了订单号或写操作结果，说明参数传错，停止并复核。
