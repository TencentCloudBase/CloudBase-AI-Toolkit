# Recipe 6 — 平台版接入：建环境、发凭证

## When to use

平台型客户要把云开发环境开给**没有腾讯云账号**的下游用户或员工：

- 用户不该各自注册腾讯云、也不该各自买套餐，环境由平台统一开、账号统一计费
- 需要一次拿到「环境 ID + 环境 API Key」这一对东西，再交给用户侧
- 要按用户/租户批量建环境，既可能随用随建，也可能提前预创建

不管什么：单个开发者自己开通自己用，走 getting-started。拿到凭证之后怎么让 Agent 用上，见 [Recipe 7](./platform-agent-connect.md)；用量、账期与环境回收见 [Recipe 9](./platform-usage-and-recycle.md)。

## 前置权限

两条硬前提，缺一条第一步就失败：

- **账号已购平台版套餐。** 未购时 `DescribePlatforms` 返回空列表，后面无以为继。
- **用账号级凭据调。** `CreatePlatformEnv` / `CreateApiKey` / `DestroyPlatformEnv` 这些管控面接口不接受环境级 API Key。`auth(action="status")` 返回 `credential_scope: single_env` 就是环境级身份，需换成账号级密钥或登录态。

权限不足的判据、身份分类与一键授权链接见 [calling-methods.md §3](../calling-methods.md)。

## 接口序列

| 步 | Action | service / version | 关键参数 |
| --- | --- | --- | --- |
| 1 | `DescribePlatforms` | tcb / 2018-06-08 | `{ "Limit": 10 }`，`Limit` 取值 [10, 100]；从 `PlatformList[]` 取 `PlatformId`（**套餐池标识**，第 2 步必传） |
| 2 | `CreatePlatformEnv` | tcb / 2018-06-08 | `{ "Alias": "<环境别名>", "PlatformId": "<第 1 步的值>", "ReqKey": "<幂等键>" }`，返回 `EnvId` |
| 3 | `DescribeEnvs` | tcb / 2018-06-08 | 无参数，返回 `EnvList[]`；按 `EnvId` 找到目标环境，等 `Status` 变为 `NORMAL` |
| 4 | `CreateApiKey` | tcb / 2018-06-08 | `{ "EnvId": "<第 2 步的值>", "KeyType": "api_key", "KeyName": "<能认出用户的别名>" }`，返回 `ApiKey`（明文**只返回一次**） |
| 5 | 记映射 | — | 落到自己的库里：`用户 ↔ EnvId ↔ ApiKey`。轮换、回收、审计都靠这张表 |

前两步的完整请求体：

```json
{ "service": "tcb", "action": "DescribePlatforms", "params": { "Limit": 10 } }
```

```json
{
  "service": "tcb",
  "action": "CreatePlatformEnv",
  "params": { "Alias": "user-10086", "PlatformId": "pf-t960szfwv1cs", "ReqKey": "user-10086-20261014" }
}
```

`Alias` 只用于区分与展示，**用户和环境的对应关系云开发不记录**，必须由第 5 步自己维护。

### 按需创建与预创建

| 方式 | 适用 | 流程 |
| --- | --- | --- |
| 按需创建 | 用户量小或建环境频率不高 | 用户请求时调第 2 步 → 记映射 → 第 3 步确认就绪 → 分配 |
| 预创建 | 对开通体验有要求，希望用户无感 | 循环调第 2 步批量建（不同 `Alias`）→ 第 3 步确认就绪后进池 → 用户请求时从池里挑一个绑定 |

预创建的环境**建出来就开始消耗资源点**，数量按预期用户量估。

### 环境生命周期（运营动作见 Recipe 9）

| 操作 | Action | 关键参数 |
| --- | --- | --- |
| 暂停 / 恢复 | `ModifyPlatformEnv` | `{ "EnvId": "...", "Status": "DISABLE" }` 暂停，`"ENABLE"` 恢复 |
| 销毁 | `DestroyPlatformEnv` | `{ "EnvId": "..." }`，环境内数据一并清除、**不可逆** |

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 拿 `CreateEnv` 当平台版建环境用 | 报缺少 `PackageId`；语义上也走偏了 —— 那是给**单个环境**买套餐 | 平台版用 `CreatePlatformEnv`，只传 `PlatformId`（套餐在账号维度） |
| 没先取 `PlatformId` | `CreatePlatformEnv` 缺参数直接失败 | 先调 `DescribePlatforms`；返回空列表说明账号下没有已购平台版资源 |
| 重试时换了 `ReqKey` | 一次重试多出一个环境，用户手里两个环境 | `ReqKey` 是幂等键，重试**复用同一个值** |
| 建完立刻发凭证 | 用户拿到 key 却操作不了 | 用 `DescribeEnvs` 等到 `Status = NORMAL` 再发 |
| 一把 key 跨环境复用 | 用户 A 的操作落到用户 B 的环境 | 一把 key 只绑一个环境，换环境必须换 key |
| 用环境级 API Key 建环境 | 返回无权限 | 管控面接口只接受账号级凭据 |
| key 明文散落 | 写进对话、日志、工单后收不回来 | `ApiKey` 只返回一次，只走平台自己的下发通道交给用户；不要贴进对话 |
| 单环境建超过 5 把 key | 创建失败 | 单环境最多 5 个 API Key；轮换时先淘汰旧的 |

## 验证步骤

1. `DescribePlatforms` 回查 `PlatformList[]`：`PlatformId` 与预期一致，计费状态正常。
2. `DescribeEnvs` 按 `EnvId` 找到目标环境，`Status` = `NORMAL`。
3. 用第 4 步发出的 key 在用户侧走一次只读查询，见 [Recipe 7](./platform-agent-connect.md) 的验证步骤。
4. **反向验证**：换另一个环境的 key 调同一个查询，应看不到本环境的资源 —— 这一步验证的是隔离真的生效，而不只是接口能通。
