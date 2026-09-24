# Recipe 3 — PostgreSQL 实例变配、升级独享与账号密码

## When to use

要让云开发环境的 PostgreSQL 实例改变**租户形态或规格**、或要**重置它的账号密码**时：

- 规格撑不住：CPU / 内存打满、慢查询变多，要调大（或调小）实例规格
- 环境用的是**共享** PG，要升级成**独享**实例
- 要**重置 PG 账号密码**（密码泄露、忘了密码、交付前轮换）
- 已经提交了变配 / 升独享，要知道**任务跑完没有、跑到哪、失败原因是什么**
- 变配 / 升独享**还没提交或刚提交**，用户先问「要多久、业务会不会断」—— 这类「给用户的预期」按序列 E 的口径回答，不要自己估

本篇管 PG 的**实例管控面**：租户形态、规格、存储、账号密码、异步任务。

- 数据面（建表、跑 SQL、schema、migration）转 `queryPgDatabase` / `managePgDatabase`
- 存储空间告警转 [Recipe 1](./pg-storage-alarm.md)
- 环境套餐（`baas_personal` 这类）的续费 / 升级转 `tcb/ModifyEnvPlan`

## 前置权限

| service | version | 用途 |
| --- | --- | --- |
| `tcb` | `2018-06-08` | 环境的 PG 实例管控面：变配 / 升独享 / 查任务 / 重置账号密码（写） |
| `postgres` | `2017-03-12` | 读实例现状与可售规格；**重置账号密码（写）** |

**凭据身份：账号级。** 实例挂在云开发环境上，但读它的现状要走 `postgres` 产品接口。`callCloudApi` 有环境绑定门禁，账号级登录后先 `auth(action="set_env", envId=…)` 绑到目标环境；实例不在默认地域时，`postgres` 的读接口要在顶层传 `region`。

权限按凭据身份分开补：

- **账号级身份**（腾讯云密钥 / 子账号 / device 登录）：读实例现状与规格表需要 `QcloudPostgreSQLReadOnlyAccess`；`tcb` 的这几个 Action 属云开发自身能力，一般不额外要策略。**先直接往下做**，只有真的返回 `UnauthorizedOperation` 时才回来补。
- **CLI / MCP 用 TCB 服务角色换临时密钥**：权限挂在角色上，给角色追加同一条策略。

一键授权链接（以 `TCB_QcsRole` 为例，`principal` 是该角色载体的 base64）：

- `https://console.cloud.tencent.com/cam/role/grant?roleName=TCB_QcsRole&policyName=QcloudPostgreSQLReadOnlyAccess&principal=eyJzZXJ2aWNlIjpbInRjYi5jbG91ZC50ZW5jZW50LmNvbSJdfQ%3D%3D`

账号级身份缺权限时，由主账号给**这个身份**追加策略，别去点角色的链接。链接拼法、`principal` 的固定取值与使用边界见 [calling-methods.md §3.2](../calling-methods.md)。

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

**前置条件是硬门槛，不满足会被直接拒掉**（实测 2026-09-24）：这个接口只接受 **`shared`（多租户共享）** 形态的实例，其它形态报错且不产生任何任务：

```
only shared (multi-tenant) instance can be upgraded to dedicated, current form: small_tenant
```

要注意**「云开发侧写着独享」和「PG 侧是什么形态」是两套话**：实测一个 `DescribeEnvInfo` 里 `TenantType: DEDICATED` 的实例，PG 侧形态是 `small_tenant`，调这个接口就被上面那句拒了。所以动手前先看 `TenantType` —— 只有 `SHARED` 才走 B2，`DEDICATED` 走 B1 调规格。

能升独享的是**早期环境遗留的共享形态**；新开的云开发 PG 基本已经是独享。手上只有 `DEDICATED` 实例时，这条链路的正确动作是**不要调**，直接告诉用户当前实例不需要升独享 —— 别把「接口报错」讲成「升级失败」。

返回 `TaskId`，用序列 D 回查进度。

这个接口是**云开发侧对 PG 云 API 的封装**（比 PG 原生多一个 `EnvId` 入参、少一个实例 ID）。控制台代码里把这个接口的两条边界写得很明确，照它做：

- 返回的 `TaskId` **只能**给云开发的 `tcb/DescribeTaskResult`，**不能**拿去调 PG 的 `postgres/DescribeTasks`（两个任务体系不互通）；
- **云开发任务成功 ≠ PG 升级完成** —— 数据库侧的信息以 `postgres/DescribeDBInstanceAttribute` 为准。

所以序列 D 里步骤 9 看到 `Succeed` **不是终点**，还要用步骤 11 确认规格真的变了，别把 `Succeed` 直接当成「升级完成」报给用户。

迁移过程中实例状态会走到 `migrated`，控制台对这个状态的注释是「**当前共享 pgdb 实例信息已过时，需重新 `DescribeEnvs` 拿迁移后的新独享实例 ID 再查**」—— 也就是说升独享**可能换实例 ID**，此时用旧 ID 查会拿到过期信息，要重走序列 A。

### C. 重置 PG 账号密码

有**两个入口**，参数不同、「能确认到什么程度」也不同：

| 步 | Action | service / version | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 8 | ResetAccountPassword | `postgres` / `2017-03-12` | `{ "DBInstanceId": "<A2 的 DBInstanceId>", "UserName": "<账号名>", "Password": "<新密码>" }`，地域走顶层 `region` | 只有 `RequestId` |
| 8b | ResetPGAccountPassword | `tcb` / `2018-06-08` | `{ "EnvId": …, "Password": "<新密码>" }` | 只有 `RequestId` |

```json
{
  "DBInstanceId": "postgres-l4xa5uq4",
  "UserName": "admin",
  "Password": "A8b!C2d#E4f&"
}
```

**要指定账号改**（`DescribeAccounts` 里列出的那个，通常是 `admin`、`UserType` 是 `tencentDBSuper`）**就用步骤 8** —— 它带 `UserName`，指哪个改哪个，改完 `PasswordUpdateTime` 立刻更新。

**步骤 8b 是控制台在用的那个接口**，PG 实例页的「重置数据库密码」弹窗调的就是它（提交 `{ envId, password }`）。控制台代码注释写明「共享集群和独享集群通用，参数只需 `EnvId` + `Password`」。但它返回 `RequestId` 之后，`DescribeAccounts` 的 `PasswordUpdateTime` **一直没动**。

实测对照（2026-09-24，同一实例 `postgres-l4xa5uq4`，该实例账号只有 `admin` 一个，两条路用**同一个密码值**）：

| 调用 | 返回 | `DescribeAccounts[].PasswordUpdateTime` |
| --- | --- | --- |
| 步骤 8b，先后三次（含间隔 30 秒与 2 分钟后的复查） | 每次都是 `RequestId`；账号 `Status` 始终是 `2`（正常），没出现过「密码重置中」 | **始终不动**（停在 `2026-09-24 18:10:59`） |
| 步骤 8 | `RequestId` | 立刻变成调用时刻：`2026-05-27 15:19:37` → **`2026-09-24 20:39:36`** |

两个可观测面放在一起，能说清的只有一件事：**「返回 `RequestId`」不等于改成功了，而 `PasswordUpdateTime` 只跟步骤 8 对齐**。8b 到底有没有真把密码改掉，这两个面都回答不了（这类实例通常只有内网地址、外网访问默认关闭，连库验证在环境外做不了）—— **不要替它下「生效」或「不生效」的结论**，尤其别对用户说「密码已经改好了」。需要一个能被验证的结果，就走步骤 8。

账号 `Status` 的取值（控制台映射）：`1` 创建中 / `2` 正常 / `3` 修改中 / `4` 密码重置中 / `5` 锁定中 / `-1` 删除中。不在 `2` 时先等它回到 `2` 再判断结果。

`Password` 的硬性要求：**8 ~ 32 位**，不能以 `/` 开头，且必须**同时**包含小写字母、大写字母、数字、特殊字符四类。控制台里其实有**两套松紧不一**的前端校验（主账号那个弹窗松一点：8~30 位、四类里满足三类即可；另一个弹窗严：8~32 位、四类必须齐全），**以接口的要求为准**，别照抄宽松的那套。

**改完怎么确认**：读 `postgres/DescribeAccounts` 的 `PasswordUpdateTime`。这类实例通常只有内网地址（外网访问默认关闭），拿新密码连库这条常规验证在环境外做不了 —— 别因为连不上就断定改密失败。

### D. 回查：任务、进度与规格

| 步 | Action | service / version | 关键参数 | 取什么 |
| --- | --- | --- | --- | --- |
| 9 | DescribeTaskResult | `tcb` / `2018-06-08` | `{ "EnvId": …, "TaskId": "<B2 的 TaskId>" }` | `Status` / `Phase` / `Reason` / `CreatedAt` / `UpdatedAt` |
| 10 | DescribeTasks | `postgres` / `2017-03-12` | `{ "DBInstanceId": "<A2 的 DBInstanceId>", "Limit": 20, "OrderBy": "StartTime", "OrderByType": "desc" }` | `TaskSet[]` 每条任务的 `TaskType` / `Status` / `Progress` / `StartTime` / `EndTime` / `TaskDetail.AllSteps` / `.CurrentStep` |
| 11 | DescribeDBInstanceAttribute | `postgres` / `2017-03-12` | 同步骤 2 | 规格是否已变成目标值 |

三个入口的分工：

- **升独享（B2）** 返回 `TaskId` → 用步骤 9 看 `Status`（`Accepted` / `Running` / `Succeed` / `Failed`）与 `Phase`，失败读 `Reason`。**这个接口没有进度百分比、也没有预计完成时间。**
- **调规格（B1）不返回任何任务号** → 进度用步骤 10：`TaskSet` 是混排的，先按 `TaskType = "ModifyInstanceSpec"` 且 `StartTime` 最晚的那条定位到本次变配，读它的 `Progress`（0–100）与 `TaskDetail.CurrentStep`。任务结束后再用步骤 11 比对 `DBInstanceCpu` / `DBInstanceMemory` / `DBInstanceStorage`。
- `TaskSet` 里都是**这个实例自己**的任务（含改参、SSL、外网、备份回档等），`TotalCount` 是总数，分页靠 `Limit` / `Offset`。

步骤 10 的 `Limit` 上限 100；不传 `MinStartTime` 时**默认只展示 180 天内**的任务。

想用图形界面看这两条，控制台入口是：PG 实例页 `https://tcb.cloud.tencent.com/dev?envId=<envId>#/db/postgres/setting`（规格、账号密码），任务列表 `https://tcb.cloud.tencent.com/dev?envId=<envId>#/db/postgres/tasks`。

### E. 给用户的预期提示

用户真正关心的是两件事：**要多久**、**业务会不会断**。这两件事的答案都在控制台已有的口径里，照下面说就行 —— 不要自己估一个数。

#### E1. 会不会断：分三段，只有中间一段有问题

| 阶段 | 业务可访问性 |
| --- | --- |
| 改配 / 数据迁移（`DBInstanceStatus` 为 `expanding` 或 `migrating`） | **正常**。数据库连接不断，SQL 照跑 |
| 最终切换（`waitSwitch` → `switching`） | **一次秒级闪断**。所有连接会被断开一次，客户端重连即可 |
| 完成后 | 正常。**独享调规格后访问地址不变**（IP、端口、连接串都不变） |

控制台在提交前给的告警口径（可以直接转述给用户）：

- **共享升独享**：升级为独享实例后**无法回退**；升级后按独享实例的计费规则计量计费；升级过程中存在**一次秒级的连接中断**，需要确保数据库客户端具备重连能力；建议在**低峰期**执行；实例在调整配置过程中可能会进行数据迁移，**期间实例访问不受影响**。
- **独享调规格**：升级后按新规格计费；同样**一次秒级闪断**；**升级后实例访问地址不会变化**；建议低峰期执行；迁移期间访问不受影响；**存储空间仅支持调大，不支持调小**。

#### E2. 要多久：没有 ETA 字段，用 `Progress` + 历史同类任务实测耗时

云 API 里**没有「预计完成时间」这个字段**，两个任务接口都没有。能给的可靠预期只有两个来源：

1. **当前进度**：步骤 10 的 `Progress`（0–100）与 `TaskDetail.CurrentStep` / `AllSteps`。报「进行到 65%，当前步骤 Execute Switch」远比「应该快好了」有用。
2. **上一轮的真实耗时**：在步骤 10 的 `TaskSet` 里找**同一实例、`TaskType = ModifyInstanceSpec`、`Status = Success`** 的历史记录，`EndTime - StartTime` 就是上次的真实耗时。

同一实例、只改 CPU / 内存、`SwitchTag: 0` 的实测样本（可直接作为量级参考）：

| 方向 | `TaskDetail.AllSteps` | 耗时 |
| --- | --- | --- |
| 1 核 2 GiB → 2 核 4 GiB（升配） | Pre-check → Node configuration change → **Data Synchronization** → **Execute Switch** → Task Complete | **174 秒**（约 3 分钟） |
| 2 核 4 GiB → 1 核 2 GiB（降配） | Pre-check → Node configuration change → **Wait for Restart Completion** → Wait for configuration change to complete → Task Complete | **67 秒**（约 1 分钟） |

两个可复用结论：**升配走「数据同步 + 切换」，降配走「重启」，升配明显更慢**；`AllSteps` 会随任务推进**动态增加**（同一个任务先返回 4 步、中途变成 5 步），不要把它当固定清单。

进度是异步刷新的，报给用户时给区间而不是精确时刻：一分钟量级的变配按「几分钟内」说，迁移型的升独享只报「已提交，正在迁移」并持续轮询。

#### E3. 变配期间不要重复提交

`DBInstanceStatus` 回到 `running`（或 `limited run`）之前，第二次变配会被拒。控制台自己用的是「提交后最长跟踪 30 分钟」：超过 30 分钟还没等到规格变化就不再视为进行中。给用户的说法统一成：**在实例状态回到运行中之前，不要重复发起，也不要手动重启**。

#### E4. 状态判读表

| `DBInstanceStatus` | 含义 | 用户侧影响 |
| --- | --- | --- |
| `running` | 运行中 | 无。可以发起变配 / 升独享 |
| `expanding` | 变配中（含数据迁移阶段） | 连接正常、SQL 可跑；不要重复提交 |
| `migrating` | 共享升独享迁移中 | 连接正常、SQL 可跑 |
| `migrated` | 迁移完成，实例信息需要重新读取 | 重新走序列 A 拿新的实例信息 |
| `waitSwitch` | 等待切换（预约了指定时间的正常预约态） | 实例完全正常运行 |
| `switching` | 切换中 | 秒级闪断，客户端要能重连 |
| `restarting` / `upgrading` | 重启中 / 内核版本升级中 | **连接会断**，SQL 会失败，等待即可 |

#### E5. 用 `SwitchTag: 1`（指定时间）时的输入约束

- 起止时间必须**同一天**（`00:00:00` ~ `23:59:59`），**不支持跨天**
- 起止间隔要**大于 30 分钟**、且**不超过 2 小时**
- 到点前实例处于 `waitSwitch`（完全正常）；到点后进入 `switching`，同样是一次闪断

按这个范围给时间参数最稳；拿不准就用 `SwitchTag: 0` 立即切换，绕开时间参数。

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 两个变配接口的时间格式不同 | 照 B1 的格式往 `UpgradePGInstanceToDedicated` 填、或反过来，报参数格式错 | `ModifyPGInstanceSpec` 用 `YYYY-MM-dd HH:mm:ss`，`UpgradePGInstanceToDedicated` 用 `HH:MM:SS`；不确定就用 `SwitchTag: 0` 立即切换，绕开时间参数 |
| 内存单位在两处不一样 | 顺手把 `DescribeClasses.ClassInfoSet[].Memory` 填进 `ModifyPGInstanceSpec.Memory` | 规格表的 `Memory` 是 **MB**，要先除以 1024 换算成 GB（同一规格两处实测为 2048 与 2） |
| 提交了不在售的规格 | `spec 3C3G is not available in region ap-shanghai` | 先跑步骤 3 / 6 拿 `ClassInfoSet`，从列表里挑 `SpecCode` / `CPU` / `Memory`；不要凭经验凑核数与内存 |
| 把 `DescribeTaskResult` 回查变配 | `Task not found.` | `ModifyPGInstanceSpec` 不返回任何任务号；变配的进度走步骤 10 的 `postgres/DescribeTasks`，规格是否生效走步骤 11。只有 `UpgradePGInstanceToDedicated` 返回 `TaskId`，也只用步骤 9 查它 |
| `SwitchTag` 在「入参」与「任务详情」里是两套枚举 | 入参传 `SwitchTag: 0`（立即切换），回来在 `DescribeTasks` 里看到 `TaskDetail.SwitchTag: 1`（实测），据此以为自己传错了 | 入参：`ModifyPGInstanceSpec` 是 `0` 立即 / `1` 指定时间 / `2` 维护窗口，`UpgradePGInstanceToDedicated` 是 `0` 立即 / `1` 指定时间（**没有 2**）；PG 任务详情里的 `TaskDetail.SwitchTag` 是另一套：`0` 不需要切换 / `1` 立即 / `2` 指定时间 / `3` 维护窗口。两套不要互相校验 |
| 把 `TaskDetail.AllSteps` 当固定清单 | 第一次读到 4 步、过一会儿读到 5 步，以为数据错乱 | `AllSteps` / `CurrentStep` 随任务推进动态生成。判断完成只看 `Status` 与 `Progress` |
| 拿别的任务的 `Progress` 当变配进度 | 读到 `ModifyInstanceParams` 那条的 `Progress: 100`，误判变配已完成 | `TaskSet` 是混排的，先按 `TaskType = "ModifyInstanceSpec"` 且 `StartTime` 最晚筛出本次任务，再读 `Progress` |
| 以为有人能给出「预计完成时间」 | 在 `DescribeTaskResult` / `DescribeTasks` 里找 ETA 字段，找不到 | 没有这个字段。按序列 E2 给：当前 `Progress` + 同实例历史同类任务的 `EndTime - StartTime`；别自己估一个分钟数报给用户 |
| 变配后主备角色会互换 | 变配完成后 `DBNodeSet` 里的 `Primary` 与 `Zone` 跟变配前不同，被当成"变配没生效"或"实例换了" | 变配过程会临时多出一个备节点、完成后主备互换。判断生效只看 `DBInstanceCpu` / `DBInstanceMemory` / `DBInstanceStorage` 与 `UpdateTime`，不要拿 `Zone` / 主备角色当判据 |
| 把变配期间当「不可用」 | 提前告诉用户"数据库会中断几分钟"，用户白等 | 只有最终切换是**秒级闪断**，迁移期间连接正常、SQL 照跑。按序列 E1 的三段口径说 |
| 想从 `switching` 分辨是升配还是升独享 | 看到实例处于 `switching`，据此推断"在做哪一种变更" | 控制台代码里注明：`switching` 被**升配（独享）与升独享（共享）共用，且新旧实例可能共用 ID，前端无法可靠区分**，所以一律按"不可操作"处理。要分辨就回查 `DescribeTasks` 里那条任务的类型与起点时间，别猜 |
| 翻不到更早的变配记录 | `DescribeTasks` 里只有近期任务 | 不传 `MinStartTime` 时默认只回 **180 天内**；`Limit` 上限 `100`，要更多就翻页 |
| 漏传 `DescribeTaskResult` 的入参 | 缺 `EnvId` 报 `The request is missing the required parameter \`EnvId\`.`，补齐后又报缺 `TaskId` | 入参只有 `EnvId` + `TaskId` 两个；`TaskType` 是返回字段、不是入参，不要往请求里塞 |
| 用 `TaskType` 做白名单过滤 | 按文档枚举只认 `PGUserMigration`，升独享的任务被当成"查不到" | `TaskType` 的文档枚举不含升级任务；判读只看 `Status` / `Phase` / `Reason`，不要去匹配 `TaskType` 的取值 |
| 在共享实例上直接调调规格接口 | `FailedOperation.InstanceStatusConflict`（Instance status does not match the required status for this operation） | 先看步骤 1 的 `TenantType`：`SHARED` 先走 B2 升独享，变 `DEDICATED` 之后再走 B1 调规格。升独享是单向的 |
| `Region` 传错位置 | `Region is not recognized`（`tcb` 的这几个接口文档注明「本接口不需要传递此参数」） | `tcb` 的变配族把地域交给环境绑定；`postgres` 的读接口要地域，且必须在 `callCloudApi` **顶层** `region` 传，不要写进 `params` |
| 账号级登录仍被拦 | 首个调用返回 `ENV_REQUIRED`（「当前已登录，但尚未绑定环境」） | 先 `auth(action="set_env", envId=…)` 绑定目标环境 |
| 密码不合规 | 只给大小写字母 + 数字，报参数校验失败 | 生成时保证四类字符齐全（小写、大写、数字、特殊字符），长度落在 8 ~ 32 位且首字符不是 `/` |
| 拿 `RequestId` 当改密成功 | 调完改密接口看到返回了 `RequestId`，就回用户「密码已重置」 | **返回 `RequestId` 不等于改成功。** 要一个能被验证的结果就用 `postgres/ResetAccountPassword`（带 `UserName`），改完 `PasswordUpdateTime` 立刻更新；实测 `tcb/ResetPGAccountPassword`（控制台在用的那个）连调三次都不动该字段，它到底改没改从接口看不出来 —— 别对用户打包票 |
| 在独享实例上试升独享 | `only shared (multi-tenant) instance can be upgraded to dedicated, current form: small_tenant` | 这是「不适用」，不是「升级失败」。先用步骤 1 的 `TenantType` 判断：`DEDICATED` 的实例根本没有升独享这回事，如实告诉用户不需要升 |
| 把"提交成功"当成"已完成" | 变配 / 升独享提交后立刻去连库，规格还是旧的 | 两个入口都是异步：升独享按序列 D 步骤 9 轮询 `Status`，调规格先按步骤 10 看 `Progress`、再按步骤 11 比对规格字段与 `UpdateTime` |
| 找错控制台入口 | 在环境设置页 `#/env/env-setting` 里翻规格与密码 | 规格与账号密码在 PG 实例页 `#/db/postgres/setting`；任务列表在 `#/db/postgres/tasks`。`#/db/mysql/setting` 是 MySQL 的页，两者不通用 |

## 验证步骤

1. **序列 A**：`DescribeEnvInfo` 返回的 `EnvBaseInfo.PostgreSQL` 非空，取到 `InstanceName`；`DescribeDBInstanceAttribute` 能按它查到 `DBInstanceStatus = running`。查不到就先确认环境是否真的开通了 PG。
2. **序列 B 选规格**：目标 CPU / 内存能在 `ClassInfoSet` 里找到同一行，`State = 1`，且目标存储落在该行 `MinStorage` ~ `MaxStorage` 之间。找不到就别提交。
3. **序列 B 预检**：步骤 4 的 `DryRun: true` **没有报错**即为通过；返回的 `DealName` / `BillId` 为空串表示没有产生订单。报错就改参数重来。
4. **序列 B 正式提交后看进度**：返回 `DealName` / `BillId` 非空只代表订单已受理。立刻用步骤 10 查一次 —— `TaskSet` 里应出现一条新的 `TaskType = "ModifyInstanceSpec"`、`StartTime` 最晚的任务，且 `Status` 为运行中。一分钟后再查，`Progress` 应向前推进。查不到新任务就先确认 `DBInstanceId` 与地域传对。
5. **序列 B 正式提交后回查规格**：步骤 11 返回的 `DBInstanceCpu` / `DBInstanceMemory` / `DBInstanceStorage` 等于目标值，且 `UpdateTime` 晚于提交时间，**这三项都对上才算变配完成**（不要拿 `Zone` 或主备角色当判据）。同时步骤 10 里那条任务的 `Status` 应为 `Success`、`Progress = 100`、`EndTime` 非空。
6. **序列 B2（先确认前提）**：步骤 1 的 `TenantType` 必须是 `SHARED`，不是就直接停手（实测 `DEDICATED` 的实例会报 `current form: small_tenant`）。满足时 `UpgradePGInstanceToDedicated` 返回的 `TaskId` 非空；步骤 9 轮询到 `Status = Succeed` **还不是终点** —— 再按步骤 11 确认 CPU / 内存已是目标规格（云开发任务成功不等于 PG 升级完成），`Failed` 时读 `Reason` 定位。完成后重走步骤 1，`TenantType` 应变为 `DEDICATED`；期间若实例状态是 `migrated`，旧实例 ID 可能已过时，要重新 `DescribeEnvInfo` 取新 ID 再查。
7. **序列 C**：`ResetAccountPassword` 返回 `RequestId` **不算完成** —— 紧接着读 `DescribeAccounts`，`PasswordUpdateTime` 应晚于提交时间，这才是生效判据。走 8b（`tcb/ResetPGAccountPassword`）时这个判据用不上（实测它不改该字段）：要么改用步骤 8，要么如实告诉用户「已提交，但无法从接口确认是否生效」。实例通常只有内网地址（外网访问默认关闭），连库验证在环境外做不了，不要因为连不上就断定改密失败。
8. 全链路的读步骤只调用 `Describe*`；写操作只有 B1 / B2 / C 三处，各自提交前先确认真实目标环境。
