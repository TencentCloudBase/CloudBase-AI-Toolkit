# Recipe 3 — PostgreSQL 实例变配、升级独享与账号密码

## When to use

要让云开发环境的 PostgreSQL 实例改变**租户形态或规格**、或要**重置它的账号密码**时：

- 规格撑不住：CPU / 内存打满、慢查询变多，要调大（或调小）实例规格
- 环境用的是**共享** PG，要升级成**独享**实例
- 要**重置 PG 账号密码**（密码泄露、忘了密码、交付前轮换）
- 已经提交了变配 / 升独享，要知道**任务跑完没有、失败原因是什么**

本篇管 PG 的**实例管控面**：租户形态、规格、存储、账号密码、异步任务。

- 数据面（建表、跑 SQL、schema、migration）转 `queryPgDatabase` / `managePgDatabase`
- 存储空间告警转 [Recipe 1](./pg-storage-alarm.md)
- 环境套餐（`baas_personal` 这类）的续费 / 升级转 `tcb/ModifyEnvPlan`

## 前置权限

| service | version | 用途 |
| --- | --- | --- |
| `tcb` | `2018-06-08` | 环境的 PG 实例管控面：变配 / 升独享 / 重置账号密码 / 查任务 |
| `postgres` | `2017-03-12` | 读实例现状与可售规格 |

**凭据身份：账号级。** 实例挂在云开发环境上，但读它的现状要走 `postgres` 产品接口。`callCloudApi` 有环境绑定门禁，账号级登录后先 `auth(action="set_env", envId=…)` 绑到目标环境；实例不在默认地域时，`postgres` 的读接口要在顶层传 `region`。

权限按凭据身份分开补：

- **账号级身份**（腾讯云密钥 / 子账号 / device 登录）：读实例现状与规格表需要 `QcloudPostgreSQLReadOnlyAccess`；`tcb` 的这几个 Action 属云开发自身能力，一般不额外要策略。**先直接往下做**，只有真的返回 `UnauthorizedOperation` 时才回来补。
- **CLI / MCP 用 TCB 服务角色换临时密钥**：权限挂在角色上，给角色追加同一条策略。

一键授权链接（以 `TCB_QcsRole` 为例，`principal` 是该角色载体的 base64）：

- `https://console.cloud.tencent.com/cam/role/grant?roleName=TCB_QcsRole&policyName=QcloudPostgreSQLReadOnlyAccess&principal=eyJzZXJ2aWNlIjoidGNiLmNsb3VkLnRlbmNlbnQuY29tIn0%3D`

账号级身份缺权限时，由主账号给**这个身份**追加策略，别去点角色的链接。链接拼法与角色载体的读法见 [calling-methods.md §3](../calling-methods.md)。

官方接口文档：云开发 API 概览 https://cloud.tencent.com/document/api/876/34809 （请求域名 `tcb.tencentcloudapi.com`）；云数据库 PostgreSQL API 概览 https://cloud.tencent.com/document/api/409/16761 （请求域名 `postgres.tencentcloudapi.com`）。

## 接口序列

### A. 先读现状：这个环境的 PG 是哪种、现在什么规格

| 步 | Action | service / version | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 1 | DescribeEnvInfo | `tcb` / `2018-06-08` | `{ "EnvId": "<envId>" }` | `EnvBaseInfo.PostgreSQL[].InstanceName`（= 下一步的 `DBInstanceId`）、`.TenantType` |
| 2 | DescribeDBInstanceAttribute | `postgres` / `2017-03-12` | `{ "DBInstanceId": "<上一步的 InstanceName>" }`，地域走顶层 `region` | `DBInstance` 下的 `DBInstanceCpu` / `DBInstanceMemory` / `DBInstanceStorage` / `DBInstanceClass` / `DBMajorVersion` / `DBInstanceStorageType` / `Zone` / `DBInstanceStatus` |

`PostgreSQL` 是数组：空数组说明这个环境没有开 PG，不要在它上面做变配。`TenantType` 是分流开关 —— `SHARED` 走序列 B2 升独享，`DEDICATED` 走序列 B1 调规格。

### B1. 独享实例调规格

| 步 | Action | service / version | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 3 | DescribeClasses | `postgres` / `2017-03-12` | `{ "Zone": "<A2 的 Zone>", "DBEngine": "postgresql", "DBMajorVersion": "<A2 的 DBMajorVersion>", "StorageType": "<A2 的 DBInstanceStorageType>", "InstanceCategory": "cloudbase" }` | `ClassInfoSet[]`：`SpecCode` / `CPU` / `Memory` / `MinStorage` / `MaxStorage` / `State` |
| 4 | ModifyPGInstanceSpec（预检） | `tcb` / `2018-06-08` | 步骤 5 的全部参数 + `"DryRun": true` | `DealName` / `BillId`（预检通过时都是空串） |
| 5 | ModifyPGInstanceSpec（正式） | `tcb` / `2018-06-08` | `{ "EnvId": …, "Cpu": <核数>, "Memory": <GB>, "SwitchTag": 0\|1\|2, "Storage": <GB，可选> }` | `DealName` / `BillId` |

步骤 3 只从返回列表里挑规格 —— `State` 为 `1` 表示在售；`CPU` / `Memory` 与 `SpecCode` 三列要一致地挑同一行。`Storage` 目标值必须落在该行的 `MinStorage` ~ `MaxStorage` 之间。

步骤 4 是提交前的安全网：`DryRun: true` 只做校验、不发起变配。预检报错就直接改参数重来，**不要跳过预检直接提交**（规格非法时会留下无效订单）。

步骤 5 的 `SwitchTag` 决定切换时机：`0` 立即、`1` 指定时间、`2` 维护时间窗口内。用 `1` 时 `SwitchStartTime` / `SwitchEndTime` 的格式是 **`YYYY-MM-dd HH:mm:ss`**：

```json
{
  "EnvId": "<envId>",
  "Cpu": 2,
  "Memory": 4,
  "Storage": 50,
  "SwitchTag": 0
}
```

返回 `DealName`（账单名）与 `BillId`（账单标识）。**变配是异步的：拿到订单号 ≠ 已经变完**，规格要按序列 D 回查。

### B2. 共享实例升级为独享

| 步 | Action | service / version | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 6 | DescribeClasses | `postgres` / `2017-03-12` | 同步骤 3，`StorageType` 可以不传 | 同步骤 3 |
| 7 | UpgradePGInstanceToDedicated | `tcb` / `2018-06-08` | `{ "EnvId": …, "SwitchTag": 0\|1, "SpecCode": "<步骤 6 的 SpecCode>", "Storage": <GB> }` | `TaskId` |

`SwitchTag` 是**必填**（`0` 立即切换、`1` 指定时间切换）。用 `1` 时 `SwitchStartTime` / `SwitchEndTime` 的格式是 **`HH:MM:SS`** —— 和 B1 的 `ModifyPGInstanceSpec` **不是同一套格式**。

```json
{
  "EnvId": "<envId>",
  "SwitchTag": 0,
  "SpecCode": "pg.it.small2",
  "Storage": 10
}
```

返回 `TaskId`，用序列 D 回查进度。

### C. 重置 PG 账号密码

| 步 | Action | service / version | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 8 | ResetPGAccountPassword | `tcb` / `2018-06-08` | `{ "EnvId": …, "Password": "<新密码>" }` | 只有 `RequestId` |

```json
{
  "EnvId": "<envId>",
  "Password": "A8b!C2d#E4f&"
}
```

`Password` 的硬性要求：**8 ~ 32 位**，不能以 `/` 开头，且必须**同时**包含小写字母、大写字母、数字、特殊字符四类。改完只返回 `RequestId`，**没有**任何回查接口——生效与否只能用新密码连一次库来确认。

### D. 回查：任务与规格

| 步 | Action | service / version | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 9 | DescribeTaskResult | `tcb` / `2018-06-08` | `{ "EnvId": …, "TaskId": "<B2 的 TaskId>" }` | `Status` / `Phase` / `Reason` / `TaskType` |
| 10 | DescribeDBInstanceAttribute | `postgres` / `2017-03-12` | 同步骤 2 | 规格是否已变成目标值 |

两个回查入口分工不同：

- **升独享（B2）** 有 `TaskId` → 用步骤 9 看 `Status`（`Accepted` / `Running` / `Succeed` / `Failed`）与 `Phase`，失败读 `Reason`。
- **调规格（B1）不返回 `TaskId`** → 用步骤 10 比对 `DBInstanceCpu` / `DBInstanceMemory` / `DBInstanceStorage`，看 `UpdateTime` 是否晚于提交时间。

想用图形界面看这两条，控制台入口是：PG 实例页 `https://tcb.cloud.tencent.com/dev?envId=<envId>#/db/postgres/setting`（规格、账号密码），任务列表 `https://tcb.cloud.tencent.com/dev?envId=<envId>#/db/postgres/tasks`。

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 两个变配接口的时间格式不同 | 照 B1 的格式往 `UpgradePGInstanceToDedicated` 填、或反过来，报参数格式错 | `ModifyPGInstanceSpec` 用 `YYYY-MM-dd HH:mm:ss`，`UpgradePGInstanceToDedicated` 用 `HH:MM:SS`；不确定就用 `SwitchTag: 0` 立即切换，绕开时间参数 |
| 内存单位在两处不一样（实测） | 顺手把 `DescribeClasses.ClassInfoSet[].Memory` 填进 `ModifyPGInstanceSpec.Memory` | 规格表的 `Memory` 是 **MB**（同一规格 `DBInstanceMemory` 是 2、`ClassInfoSet` 里是 2048），要先除以 1024 换算成 GB |
| 提交了不在售的规格 | `spec 3C3G is not available in region ap-shanghai` | 先跑步骤 3 / 6 拿 `ClassInfoSet`，从列表里挑 `SpecCode` / `CPU` / `Memory`；不要凭经验凑核数与内存 |
| 拿 `DescribeTaskResult` 回查变配 | `Task not found.` | `ModifyPGInstanceSpec` 不返回 `TaskId`，变配回查走 `DescribeDBInstanceAttribute`；只有 `UpgradePGInstanceToDedicated` 返回 `TaskId` |
| 漏传 `DescribeTaskResult` 的入参 | 缺 `EnvId` 报 `The request is missing the required parameter \`EnvId\`.`，补齐后又报缺 `TaskId` | 入参只有 `EnvId` + `TaskId` 两个；`TaskType` 是返回字段、不是入参，不要往请求里塞 |
| 用 `TaskType` 做白名单过滤 | 按文档枚举只认 `PGUserMigration`，升独享的任务被当成"查不到" | `TaskType` 的文档枚举不含升级任务；判读只看 `Status` / `Phase` / `Reason`，不要去匹配 `TaskType` 的取值 |
| 在共享实例上直接调调规格接口 | `FailedOperation.InstanceStatusConflict`（Instance status does not match the required status for this operation） | 先看步骤 1 的 `TenantType`：`SHARED` 先走 B2 升独享，变 `DEDICATED` 之后再走 B1 调规格。升独享是单向的 |
| `Region` 传错位置 | `Region is not recognized`（`tcb` 的这几个接口文档注明「本接口不需要传递此参数」） | `tcb` 的变配族把地域交给环境绑定；`postgres` 的读接口要地域，且必须在 `callCloudApi` **顶层** `region` 传，不要写进 `params` |
| 账号级登录仍被拦 | 首个调用返回 `ENV_REQUIRED`（「当前已登录，但尚未绑定环境」） | 先 `auth(action="set_env", envId=…)` 绑定目标环境 |
| 密码不合规 | 只给大小写字母 + 数字，报参数校验失败 | 生成时保证四类字符齐全（小写、大写、数字、特殊字符），长度落在 8 ~ 32 位且首字符不是 `/` |
| 把"提交成功"当成"已完成" | 变配 / 升独享提交后立刻去连库，规格还是旧的 | 两个入口都是异步：升独享按序列 D 步骤 9 轮询 `Status`，调规格按步骤 10 比对规格字段与 `UpdateTime` |
| 找错控制台入口 | 在环境设置页 `#/env/env-setting` 里翻规格与密码 | 规格与账号密码在 PG 实例页 `#/db/postgres/setting`；任务列表在 `#/db/postgres/tasks`。`#/db/mysql/setting` 是 MySQL 的页，两者不通用 |

## 验证步骤

1. **序列 A**：`DescribeEnvInfo` 返回的 `EnvBaseInfo.PostgreSQL` 非空，取到 `InstanceName`；`DescribeDBInstanceAttribute` 能按它查到 `DBInstanceStatus = running`。查不到就先确认环境是否真的开通了 PG。
2. **序列 B 选规格**：目标 CPU / 内存能在 `ClassInfoSet` 里找到同一行，`State = 1`，且目标存储落在该行 `MinStorage` ~ `MaxStorage` 之间。找不到就别提交。
3. **序列 B 预检**：步骤 4 的 `DryRun: true` **没有报错**即为通过；返回的 `DealName` / `BillId` 为空串表示没有产生订单。报错就改参数重来。
4. **序列 B 正式提交后回查**：步骤 10 返回的 `DBInstanceCpu` / `DBInstanceMemory` / `DBInstanceStorage` 等于目标值，且 `UpdateTime` 晚于提交时间。三项都对上才算变配完成。
5. **序列 B2**：`UpgradePGInstanceToDedicated` 返回的 `TaskId` 非空；步骤 9 轮询到 `Status = Succeed` 即为完成，`Failed` 时读 `Reason` 定位。完成后步骤 1 的 `TenantType` 应变为 `DEDICATED`。
6. **序列 C**：`ResetPGAccountPassword` 返回 `RequestId`；用新密码连一次库（应用连接串、`psql` 或 SQL 编辑器均可）确认能连上，旧密码应连不上。
7. 全链路的读步骤只调用 `Describe*`；只有 B1 / B2 / C 三处是写操作，各自提交前先确认真实目标环境。
