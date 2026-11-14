# Recipe 12 — 拉取 PostgreSQL 监控数据（GetMonitorData）

## When to use

要**程序化读** PG 实例的时序指标（CPU / 磁盘 / 内存 / 慢查询 / 连接 / 死锁 / TPS 等）时：

- 定时巡检、告警归因要看曲线和峰值，不是只看当前瞬时值
- `queryEnv` 的指标清单**不含任何 PostgreSQL 指标**，别在它里面找；`queryPgDatabase(action="sql")` 只能给连接数（`pg_stat_activity`）和库大小（`pg_database_size()`）的瞬时值，给不了历史曲线

本篇不管：配告警策略（→ [Recipe 1](./pg-storage-alarm.md)）；实例变配（→ [Recipe 3](./pg-instance-spec.md)）；查库内明细数据（→ `queryPgDatabase`）。

## 前置权限

`GetMonitorData` 是读接口，需要 `QcloudMonitorReadOnlyAccess`（`QcloudMonitorFullAccess` 也行，但读不需要写）。

权限来自哪种凭据身份，见 [calling-methods.md §3](../calling-methods.md)。`callCloudApi` 有环境绑定门禁：先 `auth(action="set_env", envId=…)` 绑到目标环境；实例不在默认地域时，顶层传 `region`。

## 接口序列

只有一个接口，靠参数换指标：

| # | Action | 产品 / Version | 参数要点 |
| --- | --- | --- | --- |
| 1 | GetMonitorData | `monitor` / `2018-07-24` | `Namespace="QCE/POSTGRES"`、`MetricName`、`Instances[{Dimensions}]`、`Period`、`StartTime` / `EndTime` |

返回 `DataPoints[0]` 下的 `Timestamps` + `Values` 数组，以及回显的 `Period` / `StartTime` / `EndTime`。一次一个指标，要多条曲线就循环调。

### 维度分两套，别混

| 实例形态 | Dimensions | 定位值来源 |
| --- | --- | --- |
| 独享（DEDICATED） | `resourceId` | = `DescribeDBInstanceAttribute` 的 `DBInstanceId`，也 = `tcb` / `DescribeEnvInfo` 返回的 `PostgreSQL[].InstanceName`（→ Recipe 3 步骤 1/2） |
| 共享（SHARED） | `DBName` + `AppId` | `DBName` 缺省 `postgres`；`AppId` 是租户账号 AppId |

### 指标清单

独享（21 个，全部驼峰）：

| 分类 | MetricName |
| --- | --- |
| 计算 | `Cpu`、`MemoryRate`、`StorageRate`、`SqlRuntimeAvg` / `SqlRuntimeMax` / `SqlRuntimeMin` |
| 存储 | `Storage`（GB）、`Memory`（MB） |
| 调用请求 | `Qps`、`Connections`、`ReadWriteCalls`、`ReadCalls`、`WriteCalls` |
| 性能 | `SlowQueryCnt`、`Deadlocks`、`Tps` |
| 连接与会话 | `ActiveConns`、`IdleConns`、`LongQuery`、`LongXact`、`LongWaiting` |

共享（6 个，首字母大写其余小写）：`Dbcpuusage`、`Dbmemorybytes`（MB）、`Dbsizebytes`（MB）、`Activeconnections`、`Idleconnections`、`Totalconnections`。

指标含义与单位以云监控官方指标文档为准：https://cloud.tencent.com/document/product/248/45104

### Period 与时间格式

- `Period` 按秒传，**必须在指标支持列表内**。独享：`Cpu` / `Memory` / `MemoryRate` / `SlowQueryCnt` / `ActiveConns` / `IdleConns` / `LongQuery` / `LongXact` / `Deadlocks` / `LongWaiting` / `Tps` 支持 `5` / `60` / `300` / `3600`；其余（`Storage` / `Qps` / `Connections` / `ReadWriteCalls` / `ReadCalls` / `WriteCalls` / `SqlRuntime*` / `StorageRate`）另有 `86400`。共享：统一 `60` / `300` / `3600` / `86400`。不传时服务端默认 `300`。
- `StartTime` / `EndTime` 要 **ISO8601 带时区**，如 `2026-09-08T14:04:29+08:00`；秒级精度。

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 命名空间混用 | 拿策略族的 `POSTGRESQL` 当 `Namespace` 查数据，返回空 | 策略族接口（Recipe 1）用 `POSTGRESQL`；**监控数据**用 `QCE/POSTGRES`，共享/独享一致 |
| 共享维度缺 `AppId` | `DataPoints` 空数组、不报错 | 共享必须 `DBName` + `AppId` 成对传；独享才用 `resourceId` |
| 时间格式不对 | 报错或返回空 | ISO8601 带时区（`+08:00`），别传 epoch、别传不带时区的本地时间串 |
| `Period` 越界 | 返回空 | 对照上面的支持列表；查天级趋势用 `86400`（仅部分独享指标和共享支持） |
| 指标名拼错 | 返回空 | 大小写敏感：独享驼峰（`Qps` 不是 `QPS`、`Cpu` 不是 `CPU`）；共享是 `Dbcpuusage` 这种形态。照清单抄，别自己拼 |
| `resourceId` 传成环境 ID | 返回空 | `resourceId` 是 PG 实例 ID（`DBInstanceId`），从 Recipe 3 步骤 1/2 取，不是 `envId` |

## 验证步骤（只读自检）

1. 用目标实例的维度拉一个短窗口（10 分钟、`Period=60`）的 `Qps`（独享）或 `Dbcpuusage`（共享），确认 `DataPoints[0].Values` 非空且点数符合窗口长度。
2. 打开控制台「运维监控 → PostgreSQL 数据库」，选同实例、同指标、同窗口，曲线形态应一致（控制台展示的就是这套接口的数据）。
3. 换一个 `Period` 越界值（如独享 `Tps` 传 `86400`），确认返回空——验证周期校验在生效。
