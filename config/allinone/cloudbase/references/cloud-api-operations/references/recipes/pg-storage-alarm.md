# Recipe 1 — PostgreSQL 存储空间使用率 ≥ 80% 告警

## When to use

要给 CloudBase PostgreSQL 实例配存储空间（磁盘）使用率告警时：

- 新建使用率阈值告警策略，并绑定到指定实例
- 已有策略但不生效：需要回查绑定维度（`resourceId` / `uid` 为 null、策略被 `alarm_disabled` 禁用）

本篇只覆盖告警策略的创建 / 绑定 / 回查；查监控数据（`GetMonitorData`）或控制台可视化不在这里。

## 前置权限

需要 `monitor` 告警策略族的**写**权限 + `postgres` 读实例权限。

权限来自哪种凭据身份，见 [calling-methods.md §3](../calling-methods.md)：账号级登录取该身份自身策略，服务角色发起的调用取角色挂载的策略，环境级 API Key 没有追加 CAM 策略的通道。**先直接往下做**，只有写操作真的返回 `UnauthorizedOperation` 时才回来补：

- 告警策略族：`QcloudMonitorFullAccess`（`QcloudMonitorReadOnlyAccess` 对「告警策略」只有访问权、没有操作权，写操作挂它没用）
- postgres 读实例：`QcloudPostgreSQLReadOnlyAccess`

补权限的一键链接（`TCB_QcsRole` 为例，角色名与 `principal` 按实际角色替换）：

- `https://console.cloud.tencent.com/cam/role/grant?roleName=TCB_QcsRole&policyName=QcloudMonitorFullAccess&principal=eyJzZXJ2aWNlIjoidGNiLmNsb3VkLnRlbmNlbnQuY29tIn0%3D`
- `https://console.cloud.tencent.com/cam/role/grant?roleName=TCB_QcsRole&policyName=QcloudPostgreSQLReadOnlyAccess&principal=eyJzZXJ2aWNlIjoidGNiLmNsb3VkLnRlbmNlbnQuY29tIn0%3D`

账号级身份（腾讯云密钥 / 子账号 / device 登录）缺权限时，由主账号给**这个身份**追加策略，别去点角色的链接。

链接的拼法与角色载体的读法见 [calling-methods.md §3](../calling-methods.md)。

官方 API 文档：监控告警 API 概览 https://cloud.tencent.com/document/product/649/30343（单个 Action 详细文档在 `document/api/248/` 下）。

## 接口序列

| 步 | Action | service / version | 关键参数 |
| --- | --- | --- | --- |
| 1 | DescribeAllNamespaces | monitor / 2018-07-24 | `{ "Module": "monitor", "SceneType": "ST_ALARM" }`，从 `QceNamespacesNew` 取策略命名空间（PG = `POSTGRESQL`） |
| 2 | DescribeAlarmMetrics | monitor / 2018-07-24 | `{ "Module": "monitor", "MonitorType": "MT_QCE", "Namespace": "POSTGRESQL" }`，确认指标与可选值：StorageRate（Period 60/300，ContinuePeriod 1-5） |
| 3 | DescribeDBInstances | **postgres / 2017-03-12** | `{ "Limit": 100, "Offset": 0 }`，按地域逐次调用；取实例 `DBInstanceId` 与 **`Uid`** |
| 4 | DescribeAlarmNotices | monitor / 2018-07-24 | 复用已有通知模板（系统预设即可），或 CreateAlarmNotice 新建 |
| 5 | CreateAlarmPolicy | monitor / 2018-07-24 | 见下方完整请求 |
| 6 | BindingPolicyObject | monitor / 2018-07-24 | 顶层 region 必传 + 双维度绑定，见坑 3/4 |
| 7 | DescribeAlarmPolicies / DescribeBindingPolicyObjectList | monitor / 2018-07-24 | 回查验证 |

CreateAlarmPolicy 实测可用的请求体：

```json
{
  "Module": "monitor",
  "PolicyName": "PostgreSQL磁盘使用率80%告警",
  "Remark": "磁盘(存储空间)使用率>=80%告警",
  "MonitorType": "MT_QCE",
  "Enable": 1,
  "ProjectId": 0,
  "Namespace": "POSTGRESQL",
  "Condition": {
    "IsUnionRule": 0,
    "Rules": [{
      "MetricName": "StorageRate", "Period": 60, "Operator": "ge",
      "Value": "80", "ContinuePeriod": 1, "NoticeFrequency": 3600, "IsPowerNotice": 0
    }]
  },
  "NoticeIds": ["notice-xxxxxxxx"]
}
```

返回 `PolicyId`（策略 ID）与 `OriginId`（数字，即后续绑定接口的 **GroupId**）；维度里的 `uid` 取自步骤 3 的实例返回。

绑定请求（步骤 6）：

```json
{
  "Module": "monitor",
  "PolicyId": "policy-xxxxxxxx",
  "Dimensions": [{
    "Region": "sh",
    "Dimensions": "{\"uid\":<实例Uid>,\"resourceId\":\"<PostgreSQL实例ID>\"}"
  }]
}
```

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| Namespace 用错 | `QCE/POSTGRES` / `postgres` 查指标返回空 | 策略族接口用 `DescribeAllNamespaces` 返回的 `QceNamespacesNew.N.Id`（PG = `POSTGRESQL`）；`QCE/POSTGRES` 只是监控数据命名空间 |
| CreateAlarmPolicy 缺 ProjectId | `InvalidParameter: this namespace requires projectID: -1` | 显式传 `ProjectId=0`（默认项目，与实例一致；不要传 -1） |
| 绑定缺 X-TC-Region | `MissingParameter: Region` | 顶层 region 传完整码（如 `ap-shanghai`）；同时 `Dimensions[].Region` 用**短码**（如 `sh`），两个字段不同 |
| 绑定维度缺 uid | 表面成功，回查 `resourceId:null,uid:null`，告警被 alarm_disabled 禁用 | `Dimensions` 内 JSON 必须同时含 `uid`（来自 DescribeDBInstances）与 `resourceId` |
| 回查绑定用错参数 | 传 PolicyId 或 PageNumber 均报错 | DescribeBindingPolicyObjectList 传 `Module="monitor"` + `GroupId`（= OriginId），不传分页 |
| 解绑残留 | MissingParameter GroupId / UniqueId 类型错 | UnBindingPolicyObject 传 `GroupId` + `UniqueId`（**数组**，从绑定列表取） |
| DescribeAlarmNotices 参数 | 缺 `Order` 报 MissingParameter；小写 `asc` 报 invalid input param | 必传 `Module` + `Order="ASC"`（大写）+ `PageNumber/PageSize`；响应字段是 `Id`（不是 NoticeId） |
| 服务端报错吞首字母 | `RojectId` / `RderType` / `SUnionRule` / `Egion` 等未定义参数报错 | 这是服务端报错**显示**怪癖（首字母被吞），实际核对的是完整参数名；先对照 SDK models 的字段定义，别被报错带偏 |
| SDK 类名陷阱（Python） | `ConditionTemplate`/`AlertRule`/`Dimension` 不存在或形状不对 | Condition 用 `AlarmPolicyCondition`、规则用 `AlarmPolicyRule`、绑定维度用 `BindingPolicyObjectDimension`（`Dimension` 是别的接口的，只有 Name/Value） |
| 以为只能 HTTP 直调 | 目标 service 不在 `callCloudApi` 支持的范围内，以为做不了 | 同序列可走官方 SDK 直调（[calling-methods.md §3](../calling-methods.md) 取临时密钥），两条路径结论一致、可互换 |

## 验证步骤

1. `DescribeAlarmPolicies` 按 PolicyName 回查：确认 Enable=1、Condition 规则、NoticeIds。
2. `DescribeBindingPolicyObjectList`（Module + GroupId）：确认 Total=1 且 Dimensions 双字段非 null。
3. 若出现 null 维度残留记录，用 UnBindingPolicyObject 清理。
