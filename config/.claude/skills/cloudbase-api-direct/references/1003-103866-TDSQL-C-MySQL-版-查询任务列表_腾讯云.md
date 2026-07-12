## 查询任务列表

最近更新时间：2025-10-30 16:50:11

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： cynosdb.tencentcloudapi.com 。

本接口（DescribeTasks）用于查询任务列表。

默认接口请求频率限制：1000次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=cynosdb&Version=2019-01-07&Action=DescribeTasks)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/1003/48100) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/1003/48100) ，本接口取值：DescribeTasks。 |
| Version | 是 | String | [公共参数](/document/api/1003/48100) ，本接口取值：2019-01-07。 |
| Region | 是 | String | [公共参数](/document/api/1003/48100) ，详见产品支持的 [地域列表](/document/api/1003/48100#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8) ，本接口仅支持其中的: ap-bangkok, ap-beijing, ap-chengdu, ap-chongqing, ap-guangzhou, ap-hongkong, ap-jakarta, ap-nanjing, ap-seoul, ap-shanghai, ap-shenzhen-fsi, ap-singapore, ap-tokyo, eu-frankfurt, na-ashburn, na-siliconvalley, sa-saopaulo 。 |
| StartTimeBegin | 否 | String | 任务开始时间起始值  
示例值：2021-06-23 20:31:57 |
| StartTimeEnd | 否 | String | 任务开始时间结束值  
示例值：2021-06-23 21:31:57 |
| Filters.N | 否 | Array of [QueryFilter](/document/api/1003/48097#QueryFilter) | 过滤条件，支持的搜索字段："ClusterId"、"ClusterName"、"InstanceId"、"InstanceName"、"Status"、"TaskId"、"TaskType" |
| Limit | 否 | Integer | 查询列表长度  
示例值：10 |
| Offset | 否 | Integer | 查询列表偏移量  
示例值：0 |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| TotalCount | Integer | 任务列表总条数  
示例值：153 |
| TaskList | Array of [BizTaskInfo](/document/api/1003/48097#BizTaskInfo) | 任务列表 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 查询任务列表

查询任务列表

#### 输入示例

```
POST / HTTP/1.1
Host: cynosdb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DescribeTasks
<公共请求参数>

{
    "Limit": 1,
    "Offset": 0
}
```

#### 输出示例

```json
{
    "Response": {
        "TotalCount": 0,
        "TaskList": [
            {
                "ID": 1,
                "AppId": 23623651237,
                "ClusterId": "cynoadbmysql-ydtwlxig",
                "CreateTime": "2024-10-01 23:22:54",
                "DelayTime": "2024-10-12 17:52:19",
                "ErrMsg": "",
                "FlowId": 6521,
                "Input": "{\"AppId\":251232125,\"uin\":\"700000433509\",\"operateUin\":\"700000433509\",\"region\":1,\"zoneId\":100007,\"dealName\":\"20240627509001289127581\",\"bigDealId\":\"20240627509001289141381\",\"tranId\":\"20240627509001289127591\",\"productCode\":\"p_cynosdb\",\"subProductCode\":\"sp_cynosdb_mysql\",\"payMode\":0,\"projectId\":0,\"goodsDetail\":{\"requestId\":\"3d56fe0b-f839-42c6-b84e-1d5fbc874cba\",\"Action\":\"CreateMultiSpecClusters\",\"pid\":1001166,\"extparam\":{\"token\":\"\"},\"timeSpan\":3600,\"timeUnit\":\"s\",\"productCode\":\"p_cynosdb\",\"subProductCode\":\"sp_cynosdb_mysql\",\"goodsNum\":1,\"sv_cynosdb_cpu_mysql\":1,\"sv_cynosdb_memory_mysql\":1,\"sv_cynosdb_cpu_smallcommoncpu\":0,\"sv_cynosdb_memory_smallcommonmem\":0,\"sv_cynosdb_cpu_largecommoncpu\":0,\"sv_cynosdb_memory_largecommonmem\":0,\"sv_cynosdb_storage_mysql\":0,\"sv_cynosdb_ccu_mysql\":0,\"resourceTags\":[{\"tagKey\":\"mockTagKey\",\"tagValue\":\"mockTagValue\"}],\"productInfo\":[{\"name\":\"配置\",\"value\":\"1核,1GB内存\"},{\"name\":\"地域\",\"value\":\"ap-guangzhou\"},{\"name\":\"可用区\",\"value\":\"ap-guangzhou-7\"}],\"zone\":\"ap-guangzhou-7\",\"source\":\"API\",\"slaveZone\":\"\",\"businessType\":\"\",\"vpcId\":\"vpc-rhfuibtt\",\"subnetId\":\"subnet-87qviva4\",\"dbType\":\"MYSQL\",\"dbVersion\":\"5.7\",\"cynosVersion\":\"\",\"clusterName\":\"后付费集群\",\"adminPassword\":\"Abcde@123\",\"port\":3306,\"count\":1,\"haCount\":0,\"instanceCount\":1,\"storageTraceId\":\"\",\"storagePayMode\":0,\"rollbackStrategy\":\"noneRollback\",\"OrderSource\":\"go_test\",\"isLhdb\":\"no\",\"lhdbAppId\":0,\"isDisableConsole\":\"no\",\"sourcePlatform\":\"\",\"clusterParams\":[{\"ParamName\":\"character_set_server\",\"CurrentValue\":\"utf8\",\"OldValue\":\"\"},{\"ParamName\":\"collation_server\",\"CurrentValue\":\"utf8_general_ci\",\"OldValue\":\"\"}],\"ParamTemplateId\":0,\"instanceType\":\"rw\",\"clusterTraceId\":\"9642a74e-fa27-4f8f-b854-653b3083c4cb\",\"outside_invisible_is_skip_trade\":\"\",\"ClusterInstanceCount\":1}}",
                "InstanceGrpId": "cynosdbmysql-grp-ywnxpisy",
                "InstanceGroupId": "cynosdbmysql-grp-ywnxpisy",
                "InstanceId": "cynosdbmysql-qjuxpows",
                "ObjectId": "cynosdbmysql-grwlskip",
                "ObjectType": "taskCreateCluster",
                "Operator": "700000433509",
                "Output": "{\"Storage\":3000}",
                "Status": "success",
                "TaskType": "taskCreateCluster",
                "TriggerTaskId": 0,
                "UpdateTime": "2024-06-27 16:18:12",
                "StartTime": "2024-06-27 16:18:07",
                "EndTime": "2024-06-27 16:18:12",
                "ClusterName": "MyClusterName",
                "InstanceName": "MyInstanceName",
                "Process": 100,
                "ModifyParamsData": [
                    {
                        "Name": "sql_auto_is_null",
                        "OldValue": "OFF",
                        "CurValue": "ON"
                    }
                ],
                "CreateClustersData": {
                    "Cpu": 1,
                    "Memory": 2,
                    "StorageLimit": 200
                },
                "RollbackData": {
                    "Cpu": 1,
                    "Memory": 2,
                    "StorageLimit": 200,
                    "OriginalClusterId": "cynosdbmysql-tiwgxyts",
                    "OriginalClusterName": "MyOriginalClusterName",
                    "RollbackStrategy": "timeRollback",
                    "SnapshotTime": "2024-05-12 11:28:55",
                    "MinCpu": 2,
                    "MaxCpu": 8,
                    "SnapShotId": 5562,
                    "RollbackDatabases": [
                        {
                            "OldDatabase": "test_database",
                            "NewDatabase": "new_test_database"
                        }
                    ],
                    "RollbackTables": [
                        {
                            "Database": "test-database",
                            "Tables": [
                                {
                                    "OldTable": "test-table-1",
                                    "NewTable": "new-test-table-1"
                                }
                            ]
                        }
                    ],
                    "BackupFileName": "cynosdbmysql-oaj6te97_20240610111357"
                },
                "ModifyInstanceData": {
                    "Cpu": 2,
                    "Memory": 4,
                    "StorageLimit": 400,
                    "OldCpu": 1,
                    "OldMemory": 2,
                    "OldStorageLimit": 200,
                    "UpgradeType": "upgradeInMaintain"
                },
                "ManualBackupData": {
                    "BackupType": "snapshot",
                    "BackupMethod": "manual",
                    "SnapshotTime": "2023-11-03 15:27:22"
                },
                "ModifyDbVersionData": {
                    "OldVersion": "3.1.11",
                    "NewVersion": "3.1.13",
                    "UpgradeType": "upgradeInMaintain"
                },
                "ClusterSlaveData": {
                    "OldMasterZone": "ap-guangzhou-4",
                    "OldSlaveZone": [
                        "ap-guangzhou-7"
                    ],
                    "NewMasterZone": "ap-guangzhou-7",
                    "NewSlaveZone": [
                        "ap-guangzhou-4"
                    ],
                    "NewSlaveZoneAttr": [
                        {
                            "Zone": "ap-guangzhou-4",
                            "BinlogSyncWay": "sync",
                            "SemiSyncTimeout": 10000
                        }
                    ],
                    "OldSlaveZoneAttr": [
                        {
                            "Zone": "ap-guangzhou-7",
                            "BinlogSyncWay": "async",
                            "SemiSyncTimeout": 10000
                        }
                    ]
                },
                "SwitchClusterLogBin": {
                    "Status": "OFF"
                },
                "ModifyInstanceParamsData": {
                    "ClusterId": "cynosdbmysql-tiwgxyts",
                    "ClusterParamList": [
                        {
                            "ParamName": "innodb_backquery_history_limit",
                            "CurrentValue": "1100",
                            "OldValue": "1000"
                        }
                    ],
                    "ModifyInstanceParams": [
                        {
                            "InstanceId": "cynosdbmysql-ins-twpmnatl",
                            "ModifyInstanceParamList": [
                                {
                                    "ParamName": "innodb_secondary_evict_only_lru",
                                    "CurrentValue": "ON",
                                    "OldValue": "OFF"
                                }
                            ]
                        }
                    ]
                },
                "TaskMaintainInfo": {
                    "MaintainStartTime": 10800,
                    "MaintainDuration": 3600,
                    "MaintainWeekDays": [
                        "Mon",
                        "Tue",
                        "Wed",
                        "Thu",
                        "Fri"
                    ]
                }
            }
        ],
        "RequestId": "3d56fe0b-f839-42c6-b84e-1d5fbc874cba"
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
| FailedOperation.DatabaseAccessError | 数据库访问失败，请稍后重试。如果持续不成功，请联系客服进行处理。 |
| InternalError.DbOperationFailed | 查询数据库失败。 |
| InvalidParameter | 参数错误。 |
| InvalidParameterValue.InvalidParameterValueError | 参数值无效。 |
| UnauthorizedOperation.PermissionDenied | CAM鉴权不通过。 |