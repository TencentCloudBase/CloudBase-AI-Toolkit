# Recipe 1 — PostgreSQL 存储空间使用率 ≥ 80% 告警

**实证来源**：2026-09-08 主账号 AppId 1259548930 全链路实测，policy-b2lti7cg 已生效。

## 前置权限

`monitor` 告警策略族 + `postgres` DescribeDBInstances。默认凭据（API Key / TCB 角色族）均无此权限，先走 [calling-methods.md §3](../calling-methods.md) 追加授权。

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
  "NoticeIds": ["notice-q5jl62uv"]
}
```

返回 `PolicyId`（策略 ID）与 `OriginId`（数字，即后续绑定接口的 **GroupId**）。

绑定请求（步骤 6）：

```json
{
  "Module": "monitor",
  "PolicyId": "policy-b2lti7cg",
  "Dimensions": [{
    "Region": "sh",
    "Dimensions": "{\"uid\":425810,\"resourceId\":\"postgres-pdkup8by\"}"
  }]
}
```

## 踩坑清单（全部实测）

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

## 验证步骤

1. `DescribeAlarmPolicies` 按 PolicyName 回查：确认 Enable=1、Condition 规则、NoticeIds。
2. `DescribeBindingPolicyObjectList`（Module + GroupId）：确认 Total=1 且 Dimensions 双字段非 null。
3. 若出现 null 维度残留记录，用 UnBindingPolicyObject 清理。

## 二次实测记录（2026-09-08，账号 Uin 100046919896 / 环境 mcp-pg-ky5u9q）

全链路二次打通：policy `policy-qnnip178`（GroupId 15961728）绑定 `postgres-l4xa5uq4`（uid 424521），回查双维度非 null、Enable=1。本次执行路径为 **SDK 直调**（monitor/postgres 未在 callCloudApi 白名单时，取 `auth get_temp_credentials` 临时密钥走官方 SDK，即 skill §2 代码管控路径），与首次 HTTP 直调结论一致。
