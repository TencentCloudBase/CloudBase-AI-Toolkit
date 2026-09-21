# Recipe 2 — ICP 备案：提交前自查与等待期查询

## When to use

准备用云开发环境作为备案云资源，或已在备案流程中需要把「能不能提、要等多久、被什么卡住」查清楚时：

- 提交前想知道当前云开发环境够不够格当备案云资源（套餐、剩余有效期、固定 IP）
- 想知道**现在能不能提交下一条备案**（同一主体下多条备案不能并行）
- 想知道某个省大概要审多少天、这个省对个人/企业有什么硬性限制
- 想知道某个域名的备案状态（管局是否通过、是否已落地、是否被拦）

本篇管到「查清楚」为止。**提交备案、上传材料、人脸/视频核身**在腾讯云备案小程序里完成，不走云 API；域名注册 / 实名转 [domain](../service-versions.md)；证书申请转 `ssl`；备案通过后往云开发绑自定义域名转 `manageHosting` / HTTP 网关。

## 前置权限

用到的 service：

| service | version | 用途 |
| --- | --- | --- |
| `tcb` | `2018-06-08` | 读云开发环境套餐与到期时间 |
| `ba` | `2020-07-20` | 读备案订单、主体、省份规则、域名状态 |

**凭据身份：账号级。** 备案数据挂在腾讯云账号下，与环境无关 —— 但 `callCloudApi` 有环境绑定门禁，账号级登录后仍需先 `auth(action="set_env", envId=…)` 绑一个环境（任一正常环境即可，不参与备案判定），否则首个调用返回 `ENV_REQUIRED`。

`ba` 的接口是**操作级**授权。账号读自己的备案数据一般不需要额外策略；出现 `UnauthorizedOperation` 时，给**该身份**追加 ICP 备案（`ba`）的读权限，链接拼法与角色载体读法见 [calling-methods.md §3](../calling-methods.md)。

官方接口文档：https://cloud.tencent.com/document/api/243/ （请求域名 `ba.tencentcloudapi.com`）。

## 接口序列

### A. 环境够不够格当备案云资源

| 步 | Action | service | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 1 | DescribeEnvInfo | `tcb` | `{ "EnvId": "<envId>" }` | `EnvInfo.BillingInfo.PackageId`、`ExpireTime` |

判定两条可判定的准入条件：

- **套餐**：`PackageId` 为 `baas_personal` 及以上（免费体验环境不带套餐，不能备案）。
- **剩余有效期 > 6 个月**：`ExpireTime` 距今必须大于 6 个月。这条最容易不自知 —— 环境刚创建或快到期时，`ExpireTime` 可能只余几周。

第三条「环境已开启云托管固定 IP」公开面没有对应的读 Action，判据只能在控制台读：进入目标环境的**备案管理**页，页面会直接列出三项的状态（例如「剩余有效期不足」「未开启云托管固定 IP」），并给出「续费环境」「开启固定IP」入口。三项都满足时该页才出现「去备案」。

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
| 备案管理页与环境设置页不一致 | 个人版环境：备案管理页给「开启固定IP」入口，但环境设置页**没有**固定公网 IP 卡片 | 固定 IP 的准入以备案管理页的状态为准；环境设置页看不到不代表不可开启，按备案管理页的入口走 |
| 用环境级凭据路径去查 | 环境级 API Key 只能看到绑定环境，备案数据看不到 | 备案查询用账号级登录取凭据 |
| 把 `ba` 当成国际站能力 | 国际站账号查不到国内备案数据 | 备案是腾讯云国内站业务，走国内站身份查询 |

## 验证步骤

1. **序列 A**：`DescribeEnvInfo` 返回的 `BillingInfo.PackageId` 非空、`ExpireTime` 可解析为日期，且 `ExpireTime - 今天 > 6 个月`；不满足就先续费 / 升级，不要往下走。
2. **序列 B**：`DescribeLastIcpOrderInProgress` 返回 `IcpOrderId` —— 空串即「无进行中订单」，非空则停下来先处理这条订单，不要提交第二条。
3. **序列 C**：`DescribeEvaluateAuditDays` 的 `Result` 能解析成 `ProvinceCode` → 天数的数组，且能对上自己省份的行政区划码；`DescribeProvinceRules` 里能定位到自己省份的 `Personal` / `Enterprise` 段落。
4. **序列 D**：`DescribeDomainIcpStatus` 返回四个布尔字段。任意一项为 `true` 时，先按对应语义处理（`GovStatus` 已通过、`LandedStatus` 已落地、`AuditTicket` 有工单、`Ban` 被拦），再决定是否发起新订单。
5. 全链路只调用 `Describe*`，不应产生任何订单或状态变更；若某步返回了订单号或写操作结果，说明参数传错，停止并复核。
