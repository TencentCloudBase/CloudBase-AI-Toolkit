## 修改备份配置

最近更新时间：2026-01-28 01:37:01

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： cynosdb.tencentcloudapi.com 。

本接口（ModifyBackupConfig）用于修改指定集群的备份配置。

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=cynosdb&Version=2019-01-07&Action=ModifyBackupConfig)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/1003/48100) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/1003/48100) ，本接口取值：ModifyBackupConfig。 |
| Version | 是 | String | [公共参数](/document/api/1003/48100) ，本接口取值：2019-01-07。 |
| Region | 是 | String | [公共参数](/document/api/1003/48100) ，详见产品支持的 [地域列表](/document/api/1003/48100#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8) ，本接口仅支持其中的: ap-bangkok, ap-beijing, ap-chengdu, ap-chongqing, ap-guangzhou, ap-hongkong, ap-jakarta, ap-nanjing, ap-seoul, ap-shanghai, ap-shenzhen-fsi, ap-singapore, ap-tokyo, eu-frankfurt, na-ashburn, na-siliconvalley, sa-saopaulo 。 |
| ClusterId | 是 | String | 集群ID  
示例值：cynosdbmysql-45knmnra |
| BackupTimeBeg | 否 | Integer | 表示全备开始时间，\[0-24\*3600\]， 如0:00, 1:00, 2:00 分别为 0，3600， 7200  
示例值：7200 |
| BackupTimeEnd | 否 | Integer | 表示全备结束时间，\[0-24\*3600\]， 如0:00, 1:00, 2:00 分别为 0，3600， 7200  
示例值：21600 |
| ReserveDuration | 否 | Integer | 表示保留备份时长, 单位秒，超过该时间将被清理, 七天表示为3600 _24_ 7=604800，最大为158112000  
示例值：604800 |
| BackupFreq.N | 否 | Array of String | 该参数目前不支持修改，无需填写。备份频率，长度为7的数组，分别对应周一到周日的备份方式，full-全量备份，increment-增量备份  
示例值：\["full","full","full","full","full","full","full"\] |
| BackupType | 否 | String | 该参数目前不支持修改，无需填写。  
示例值：logic |
| LogicBackupConfig | 否 | [LogicBackupConfigInfo](/document/api/1003/48097#LogicBackupConfigInfo) | 逻辑备份配置 |
| DeleteAutoLogicBackup | 否 | Boolean | 是否删除自动逻辑备份  
示例值：false |
| SnapshotSecondaryBackupConfig | 否 | [SnapshotBackupConfig](/document/api/1003/48097#SnapshotBackupConfig) | 二级快照备份参数 |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 修改集群备份配置

修改备份配置

#### 输入示例

```
POST / HTTP/1.1
Host: cynosdb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: ModifyBackupConfig
<公共请求参数>

{
    "BackupTimeBeg": 7200,
    "ReserveDuration": 604800,
    "ClusterId": "cynosdbmysql-45knmnra",
    "BackupTimeEnd": 21600
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "6EF60BEC-0242-43AF-BB20-270359FB54A7"
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
| FailedOperation.CynosdbMysqlSetBackupStrategy | 设置备份策略失败，请稍后重试。如果持续不成功，请联系客服进行处理。 |
| FailedOperation.DatabaseAccessError | 数据库访问失败，请稍后重试。如果持续不成功，请联系客服进行处理。 |
| FailedOperation.OperationFailedError | 操作失败，请稍后重试。如果持续不成功，请联系客服进行处理。 |
| InternalError.InternalHttpServerError | http请求执行异常。 |
| InvalidParameterValue.InvalidParameterValueError | 参数值无效。 |
| InvalidParameterValue.ParamError | 参数错误。 |
| ResourceNotFound.ClusterNotFoundError | 集群不存在。 |
| UnauthorizedOperation.PermissionDenied | CAM鉴权不通过。 |