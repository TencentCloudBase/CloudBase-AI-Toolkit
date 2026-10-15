# Recipe 10 — 平台版用量、账期与环境回收

## When to use

平台版已经在给用户发环境，接下来要在自己的业务里回答「用完额度怎么办」：

- 按账期结算：某个用户这个周期用了多少资源点
- 找出高消耗环境，或按环境、按资源类型看用量明细
- 试用到期或欠费，要暂停环境，必要时销毁

不管什么：怎么建环境、怎么发凭证见 [Recipe 7](./platform-onboarding.md)。本篇只讲"看用量 + 处置"，不管支付、发票与退款。

## 前置权限

账号级凭据，且账号已购平台版套餐。环境级 API Key 调不了这批接口 —— 身份判定与补齐见 [calling-methods.md §3](../calling-methods.md)。

## 接口序列

| 步 | Action | service / version | 关键参数 |
| --- | --- | --- | --- |
| 1 | `DescribePlatforms` | tcb / 2018-06-08 | `{ "Limit": 10 }`，取 `PlatformList[].PlatformId` —— 后面几乎每个接口都要它 |
| 2 | `DescribePlatformAccountCircle` | tcb / 2018-06-08 | `{ "PlatformId": "...", "WithHistoryCircle": true }`，返回当前周期 `StartTime` / `EndTime`，`true` 时附带最近两个历史周期与 `Expired` |
| 3 | `DescribePlatformCreditsUsage` | tcb / 2018-06-08 | `{ "PlatformId": "...", "StartDate": "YYYY-MM-DD", "EndDate": "YYYY-MM-DD" }`，返回四类总量 + 每日明细 |
| 4 | `DescribePlatformCreditsUsageDetail` | tcb / 2018-06-08 | `{ "PlatformId": "...", "Modules": ["FLEXDB", "SCF"], "StartDate": "...", "EndDate": "...", "NeedUsageDetails": true }`，按模块 → 指标 → 每日拆开 |
| 5 | `DescribePlatformEnvUsage` | tcb / 2018-06-08 | `{ "EnvId": "...", "StartDate": "...", "EndDate": "...", "ResourceTypes": ["Storage", "Function"] }`，单个环境的按资源类型用量 |
| 6 | `DescribePlatformEnvCreditsRanking` | tcb / 2018-06-08 | `{ "PlatformId": "...", "TimeRange": "Recent7Days", "PageSize": 50 }`，各环境用量排行 |
| 7 | `ModifyPlatformEnv` | tcb / 2018-06-08 | `{ "EnvId": "...", "Status": "DISABLE" }` 暂停；`"ENABLE"` 恢复 |
| 8 | `DestroyPlatformEnv` | tcb / 2018-06-08 | `{ "EnvId": "..." }`，删环境并清除数据，**不可逆** |

### 两套时间参数别混

| 接口 | 时间参数 | 取值 |
| --- | --- | --- |
| `DescribePlatformCreditsUsage` / `...Detail` / `DescribePlatformEnvUsage` | `StartDate` / `EndDate` | 任意区间，格式 `YYYY-MM-DD` |
| `DescribePlatformAccountCircle` / `DescribePlatformEnvCreditsRanking` | `TimeRange` | 只能填枚举值：`Today`（近 1 天，默认）/ `Recent7Days` / `CurrentCycle` / `PreviousCycle` / `Previous2Cycle` |

账期**自购买日起算、按月滚**，不是自然月。要对账就用第 2 步返回的 `StartTime` / `EndTime` 当区间，不要自己按自然月推。

### 四类用量的口径

第 3 步的返回把用量分四类，用途不同：

| 字段 | 口径 | 用来判断 |
| --- | --- | --- |
| 套餐内抵扣 | 套餐额度里扣掉的 | 额度还剩多少 |
| 资源包抵扣 | 资源包里扣掉的 | 同上（有买资源包时） |
| 按量上报 | 超出套餐后按量计费的 | 超出多少钱 |
| 原价消耗 | 不折扣的原价口径 | 成本分析 |

判断"额度用完没有"看前两类；算"超了多少"看后两类。

### 用量感知只有轮询

判断"哪些环境该处置"目前只有一种方式：定时任务遍历环境列表，按各自账期查用量、比对额度、再下发处置。

用量变化的事件回调**暂未开放**，别去文档里找开关。环境数量多时，全量轮询的调用量是「环境数 × 轮询频率」，要控制频率或只轮询有风险的那批。

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 给 `TimeRange` 传具体日期 | 报参数不合法 | 任意区间用 `StartDate` / `EndDate`；`TimeRange` 只吃那五个枚举值 |
| 按自然月算账期 | 对账对不上 | 账期自购买日起算；用 `DescribePlatformAccountCircle` 的返回值当区间 |
| 拿排行数据做实时判定 | 数字比实际少，像漏报 | 排行由后台定时计算，**有小时级延迟**；实时判定用 `DescribePlatformEnvUsage` |
| 把暂停当省钱手段 | 暂停后资源点照旧消耗 | 暂停只停服务不停计费；要停止消耗只能销毁 |
| 在停服状态下调暂停 / 恢复 | 调用失败 | 账号处于超限停服或到期隔离时这两个动作不可用；先恢复套餐 |
| 销毁前没确认依赖 | 用户数据一起没了 | 销毁不可逆；先暂停观察一段时间，或先导出需要的数据 |
| 只查账号总量就下发处置 | 不知道该停哪个环境 | 先按环境查（第 5 步）或看排行（第 6 步），再决定处置对象 |

## 验证步骤

1. `DescribePlatformAccountCircle`：当前周期起止时间与套餐购买日推得出的一致，`Expired` 与套餐实际状态相符。
2. `DescribePlatformCreditsUsage`（区间取当前周期）：四类总量与每日明细都在；**每日之和应等于对应总量**，不等说明区间没对齐。
3. `DescribePlatformEnvCreditsRanking`：排行靠前的环境与你已知的高消耗环境吻合。
4. 处置后回查：`DescribeEnvs` 里目标环境状态已变；再调一次 `ModifyPlatformEnv` 传 `"ENABLE"` 把它恢复，确认启停双向可用。
