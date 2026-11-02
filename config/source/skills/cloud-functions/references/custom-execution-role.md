# 自定义运行角色（Custom Execution Role）

> **默认不要用。** 这一页帮确实需要的人判断和落地，不是推荐使用。

## 先判断需不需要

| 你的场景 | 要不要自定义运行角色 |
|---|---|
| 单环境、自有小程序、自有账号 | **不要**。默认 `TCB_QcsRole` 就够，`manageFunctions` 会自动用它 |
| 函数要访问 VPC 内的 MySQL / Redis | **不要**。VPC 是函数配置（`func.vpc`），跟运行角色无关 |
| 函数要调用其他云 API | **多数情况不要**。先用环境级凭据或 `callCloudApi`，它自带身份 |
| 想“最小权限”，怕 `TCB_QcsRole` 权限太大 | **不要用角色解决**。数据权限用集合安全规则，见本文末「替代方案」 |
| 集成版 / 平台版多租户，要给每个租户隔离资源权限 | 这才是唯一成立的理由。继续读下面 |

一句话判据：**只有当“同一个账号下有多个租户环境，且要阻止 A 租户的函数读 B 租户的资源”时才需要。** 其他理由都应该换别的机制。

## 用了会失去什么

| 代价 | 说明 |
|---|---|
| **可能没有日志** | 换成自定义运行角色后，函数可以建成功（`Active`），但日志为空。把日志写权限的资源范围放宽到 `*` 也不改变这一点 |
| **必须自己确认创建结果** | 走 `callCloudApi` 建函数是异步的：`SCFErrorCode` 在异步失败时是空字符串，同步响应看着像成功。必须自己轮询 `DescribeFunctions` 的 `Status` |
| **`manageFunctions` 用不了** | 它的 schema 里没有 `role` 字段，SDK 还会强制注入 `TCB_QcsRole`（除非设 `DISABLE_DEFAULT_TCB_ROLE`）。这条路只能走 `callCloudApi` / CLI |
| **补 CAM 策略不保证能修复** | 补 `QcloudCLSFullAccess` 或“仅限该主题的写日志权限”之后，仍可能报同一个错误。若补完依旧失败，说明这条路在当前环境不通，改用下面的自有主题方案 |

## 日志为空时：换用自己的 CLS 主题

TB 有两条日志落点，它们对运行角色的要求不一样：

| 类型 | 标识 | 谁能写入 |
|---|---|---|
| TCB 托管主题 | `DescribeEnvs.LogServices[].TopicName` 形如 `tcb-topic-<envId>`，CLS 侧 `AssumerName=TCB` | 换成自定义运行角色后投递不到，日志为空 |
| 用户自有主题 | CLS 侧 `AssumerName` 为空 | 函数运行角色。所以自定义角色需要有写权限 |

`tcb:BindCls` 的接口说明是：「仅筛选 `AssumerName` 为空的自有主题」。托管主题不在这个接口的可绑范围内。自定义角色需要日志时，可行路径是自建 CLS 主题再走 `tcb:BindCls` 绑定。

绑定参数：`EnvId` / `ClsRegion` / `ClsLogsetId` / `ClsTopicId`。

## 更新已有函数时（和创建不是一回事）

创建和更新是两条不同的校验路径，混起来会把排查带偏：

| | 请求里的 `Role` | 表现 |
|---|---|---|
| 创建 `CreateFunction` | SDK 默认注入 `TCB_QcsRole`，除非显式传 `func.role` | 角色名不合法会**同步**报 `ResourceNotFound.Role`，函数根本不会创建 |
| 更新 `UpdateFunctionConfiguration` | **不传**，SCF 沿用函数身上原有的角色 | 角色不会因为「没传」而报错，但会被继续沿用 |

结论：**用自定义角色建好的函数，可以继续用 `manageFunctions(action="updateFunctionConfig")` 更新**，不需要退回 `callCloudApi`。

但有一个前提：MCP 2.36.2 及之前，SDK 的 `updateFunctionConfig` 会把环境级的 CLS 对（`getClsServiceConfig()`）一并写进请求体。只要这个角色对日志目的地没有写入能力，**只改一个环境变量也会报 `InvalidParameter.Cls`** —— 报错说的是日志配对，实际动作只想改变量。遇到这种情况有两条路：把函数日志改绑到自有主题，或升级到不再提交日志字段的版本。

## 如果确定要用：执行顺序

1. **建角色**，信任主体 `scf.qcloud.com`（函数服务要扮演它）。
2. **挂策略**。先分清两件事：读日志元数据（`DescribeTopics` / `DescribeLogsets`）是按 `topic/*` 调，只授单个 `topicId` 不够；写日志是另一组 action，而**托管主题本来就不接收自定义角色的写入**（见上一节）。所以策略补到「能读到元数据」为止，不要为了日志把资源放宽到 `*` —— 那既解决不了投递，也失去了最小权限的意义。
3. **建函数**，走 `callCloudApi(action="CreateFunction", service="tcb")`，显式传 `Role`，**不要传 `ClsLogsetId` / `ClsTopicId`**（让它用环境默认；传错值会直接失败）。
4. **轮询确认**：`tcb:DescribeFunctions` 或 `GetFunction`，等到 `Status` 不是 `Creating`。`CreateFailed` 时读 `StatusReasons` **全文**，可能有多条并列。
5. **验证日志**：`invokeFunction` 一次，然后 `queryFunctions(action="listFunctionLogs")`。**如果函数 `Active` 但日志为空，换第上面那节的自有主题方案。**

## 常见失败怎么读

| 现象 | 含义 | 别做什么 |
|---|---|---|
| 审计日志里调用主体是 `TCB_QcsRole`，于是认为“角色没问题” | 审计主体是**调用身份**（谁在调这个 API），不是函数运行角色。`GetFunction` 返回的 `Role` 字段才是函数运行角色，两者默认值相同但不是一回事 | 别因为审计主体是它就去查日志配置 |
| `ResourceNotFound.Role：未找到指定的Role` | 角色名写错或还没建好。这是**同步**错误，函数根本没创建 | 别去查日志配置 |
| `InvalidParameter.Cls: ClsLogSetId & ClsTopicId not matched` | 日志绑定失败。**这个码不专指“ID 不匹配”**，它同时可能表示：环境默认日志对失配、角色权限不足、入参传了别的环境的值 | 别只改 ID，也别只补 CAM 权限 |
| 同上一条，但发生在**更新已有函数**时 | 更新请求本身不带 `Role`，SCF 沿用函数原有角色；但 SDK 会把环境级 CLS 对一并写进请求体，角色对日志无写入能力时，只改一个环境变量也会报这个码 | 别以为是“更新链路有 bug”，先看函数角色 |
| `AuthFailure.UnauthorizedOperation` + `cls:DescribeTopics` 对 `topic/*` | 资源粒度不够，不是 action 缺失 | 别再去加 action，改 resource |
| 函数 `Active` 但日志 0 条 | 运行角色投递不到托管主题 | 别放宽策略，换自有主题 |
| 角色策略补了但仍然失败 | 先看两件事：补的是**读**还是**写**（读元数据不影响写入）；以及日志主题是不是**托管**的（CLS 侧 `AssumerName=TCB`）——托管主题不接收自定义角色的写入，补任何权限都不生效 | 别在权限上继续加码，换自有主题或改回默认角色 |

## 三条不要相信

1. **“关联 `QcloudCLSFullAccess` 就能用”** — 官方 API 概览页确实这么写，但补完之后仍可能报同一错误。别把它当通用解法反复试；补完不通就换自有主题。
2. **“补信任等于补权限”** — 信任策略和权限策略是两件事，只补前者不会让函数获得访问资源的权限。
3. **“改 LogSetId / TopicId 就能好”** — 只有当那一对真的错时才有用；如果函数 `Active` 但没日志，改 ID 毫无作用。

## 替代方案（按你的真实目的选）

| 目的 | 正确做法 |
|---|---|
| 限制只能读某些数据（如只读 `status = "test"` 的订单） | 集合安全规则：`managePermissions(action="updateResourcePermission", resourceType="noSqlDatabase", resourceId="<集合名>", permission="CUSTOM", securityRule='{"read":"doc.status == \"test\"","write":false}')` |
| 限制函数只能调某些 API | 环境级凭据 + 云 API 侧的策略；不需要动运行角色 |
| 隔离不同租户 | 拆环境，而不是拆角色 |
| 只要“看起来更安全” | 没有收益。默认角色 + 数据层规则才是能审计的做法 |

安全规则有两个容易踩的点：

1. **查询条件必须是规则的子集。** 规则里用了 `doc.status`，客户端查询就必须带 `status` 条件，否则直接被拒。规则写 `doc._openid == auth.openid` 时，查询要带 `_openid: '{openid}'`。
2. **只在 NoSQL 传统模式下存在。** PG 环境没有安全规则，表级权限用 `GRANT`、行级用 RLS（`managePgDatabase(action="execute", confirm=true)` 跑 `CREATE POLICY`）。

