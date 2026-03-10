## 集群回档

最近更新时间：2026-02-03 01:37:14

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： cynosdb.tencentcloudapi.com 。

本接口（RollBackCluster）用于集群回档。

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=cynosdb&Version=2019-01-07&Action=RollBackCluster)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/1003/48100) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/1003/48100) ，本接口取值：RollBackCluster。 |
| Version | 是 | String | [公共参数](/document/api/1003/48100) ，本接口取值：2019-01-07。 |
| Region | 是 | String | [公共参数](/document/api/1003/48100) ，详见产品支持的 [地域列表](/document/api/1003/48100#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8) ，本接口仅支持其中的: ap-bangkok, ap-beijing, ap-chengdu, ap-chongqing, ap-guangzhou, ap-hongkong, ap-jakarta, ap-nanjing, ap-seoul, ap-shanghai, ap-shenzhen-fsi, ap-singapore, ap-tokyo, eu-frankfurt, na-ashburn, na-siliconvalley, sa-saopaulo 。 |
| ClusterId | 是 | String | 集群ID  
示例值：cynosdbpg-bzxxrmtq |
| RollbackStrategy | 是 | String | 回档策略 timeRollback-按时间点回档 snapRollback-按备份文件回档  
示例值：snapRollback |
| RollbackId | 是 | Integer | 备份文件ID。  
回档策略为按备份文件回档时必填。  
示例值：1 |
| ExpectTime | 否 | String | 期望回档时间。  
回档策略为timeRollback按时间点回档时必填。  
示例值：2022-01-20 00:00:00 |
| ExpectTimeThresh | 否 | Integer | 期望阈值（已废弃）  
示例值：1 |
| RollbackDatabases.N | 否 | Array of [RollbackDatabase](/document/api/1003/48097#RollbackDatabase) | 回档数据库列表 |
| RollbackTables.N | 否 | Array of [RollbackTable](/document/api/1003/48097#RollbackTable) | 回档数据库表列表 |
| RollbackMode | 否 | String | 按时间点回档模式，full: 普通; db: 快速; table: 极速 （默认是普通）  
示例值：full |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| FlowId | Integer | 任务流ID  
示例值：147283 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 集群回档

集群回档

#### 输入示例

```
POST / HTTP/1.1
Host: cynosdb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: RollBackCluster
<公共请求参数>

{
    "RollbackId": 1,
    "ClusterId": "cynosdbmysql-j9i41hff",
    "ExpectTimeThresh": 1,
    "RollbackStrategy": "snapRollback",
    "RollbackTables": [
        {
            "Tables": [
                {
                    "OldTable": "old_table",
                    "NewTable": "new_table"
                }
            ],
            "Database": "old_db1"
        }
    ],
    "ExpectTime": "2022-01-20 00:00:00",
    "RollbackDatabases": [
        {
            "NewDatabase": "new_db2",
            "OldDatabase": "old_db2"
        }
    ]
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "347698da-03e4-4078-8d96-9a8b219c01a5",
        "FlowId": 147283
    }
}
```

## 5\. 开发者资源

### 腾讯云 API 平台

[腾讯云 API 平台](https://cloud.tencent.com/api) 是综合 API 文档、错误码、API Explorer 及 SDK 等资源的统一查询平台，方便您从同一入口查询及使用腾讯云提供的所有 API 服务。

### API Inspector

用户可通过 [API Inspector](https://cloud.tencent.com/document/product/1278/49361) 查看控制台每一步操作关联的 API 调用情况，并自动生成各语言版本的 API 代码，也可前往 [API Explorer](https://cloud.tencent.com/document/product/1278/46697) 进行在线调试。

### SDK

云 API 3.0 提供了配套的开发工具集（SDK），支持多种编程语言，能更方便的调用 API。

-   Tencent Cloud SDK 3.0 for Python: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-python/-/blob/master/tencentcloud/cynosdb/v20190107/cynosdb_client.py), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/cynosdb/v20190107/cynosdb_client.py), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/cynosdb/v20190107/cynosdb_client.py)
-   Tencent Cloud SDK 3.0 for Java: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-java/-/blob/master/src/main/java/com/tencentcloudapi/cynosdb/v20190107/CynosdbClient.java), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/cynosdb/v20190107/CynosdbClient.java), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/cynosdb/v20190107/CynosdbClient.java)
-   Tencent Cloud SDK 3.0 for PHP: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-php/-/blob/master/src/TencentCloud/Cynosdb/V20190107/CynosdbClient.php), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Cynosdb/V20190107/CynosdbClient.php), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Cynosdb/V20190107/CynosdbClient.php)
-   Tencent Cloud SDK 3.0 for Go: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-go/-/blob/master/tencentcloud/cynosdb/v20190107/client.go), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/cynosdb/v20190107/client.go), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/cynosdb/v20190107/client.go)
-   Tencent Cloud SDK 3.0 for Node.js: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-nodejs/-/blob/master/src/services/cynosdb/v20190107/cynosdb_client.ts), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/cynosdb/v20190107/cynosdb_client.ts), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/cynosdb/v20190107/cynosdb_client.ts)
-   Tencent Cloud SDK 3.0 for.NET: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-dotnet/-/blob/master/TencentCloud/Cynosdb/V20190107/CynosdbClient.cs), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Cynosdb/V20190107/CynosdbClient.cs), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Cynosdb/V20190107/CynosdbClient.cs)
-   Tencent Cloud SDK 3.0 for C++: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-cpp/-/blob/master/cynosdb/src/v20190107/CynosdbClient.cpp), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/cynosdb/src/v20190107/CynosdbClient.cpp), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/cynosdb/src/v20190107/CynosdbClient.cpp)
-   Tencent Cloud SDK 3.0 for Ruby: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-ruby/-/blob/master/tencentcloud-sdk-cynosdb/lib/v20190107/client.rb), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-cynosdb/lib/v20190107/client.rb), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-cynosdb/lib/v20190107/client.rb)

### 命令行工具

-   [Tencent Cloud CLI 3.0](https://cloud.tencent.com/document/product/440/6176)

## 6\. 错误码

以下仅列出了接口业务逻辑相关的错误码，其他错误码详见 [公共错误码](/document/api/1003/48104#.E5.85.AC.E5.85.B1.E9.94.99.E8.AF.AF.E7.A0.81) 。

| 错误码 | 描述 |
| --- | --- |
| FailedOperation.FlowCreateError | 创建流程失败，请稍后重试。如果持续不成功，请联系客服进行处理。 |
| FailedOperation.OperationFailedError | 操作失败，请稍后重试。如果持续不成功，请联系客服进行处理。 |
| InternalError.DbOperationFailed | 查询数据库失败。 |
| InvalidParameterValue | 参数取值错误。 |
| InvalidParameterValue.InvalidParameterValueError | 参数值无效。 |
| ResourceNotFound.ClusterNotFoundError | 集群不存在。 |
| ResourceUnavailable.InstanceLockFail | 锁定实例失败，暂时不可操作。 |
| ResourceUnavailable.InstanceStatusAbnormal | 实例状态异常，暂时不可操作。 |
| UnauthorizedOperation.PermissionDenied | CAM鉴权不通过。 |

目录