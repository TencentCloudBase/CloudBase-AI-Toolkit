## 查询备份下载地址

最近更新时间：2025-09-12 01:53:44

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： cynosdb.tencentcloudapi.com 。

本接口（DescribeBackupDownloadUrl）用于查询集群备份文件下载地址。

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=cynosdb&Version=2019-01-07&Action=DescribeBackupDownloadUrl)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/1003/48100) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/1003/48100) ，本接口取值：DescribeBackupDownloadUrl。 |
| Version | 是 | String | [公共参数](/document/api/1003/48100) ，本接口取值：2019-01-07。 |
| Region | 是 | String | [公共参数](/document/api/1003/48100) ，详见产品支持的 [地域列表](/document/api/1003/48100#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8) ，本接口仅支持其中的: ap-bangkok, ap-beijing, ap-chengdu, ap-chongqing, ap-guangzhou, ap-hongkong, ap-jakarta, ap-nanjing, ap-seoul, ap-shanghai, ap-shenzhen-fsi, ap-singapore, ap-tokyo, eu-frankfurt, na-ashburn, na-siliconvalley, sa-saopaulo 。 |
| ClusterId | 是 | String | 集群ID  
示例值：cynosdbmysql-mwg7121e |
| BackupId | 是 | Integer | 备份ID  
示例值：1883726 |
| DownloadRestriction | 否 | [BackupLimitRestriction](/document/api/1003/48097#BackupLimitRestriction) | 备份下载来源限制条件 |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| DownloadUrl | String | 备份下载地址  
示例值：https://ncdb-bj-pitr-1258\*\*\*699.cos.ap-beijing.myqcloud.com/cynosdb/data/mysqldump/\*\*\*\*9fd2-691a-11ef-b99a-b02628437590/2024-10-28/1879681/data\_backup\_1879681\_20241028022147.xb?q-sign-algorithm=sha1&q-ak=\*\*\*\*\*\*\*\*\*\*\*\*&q-sign-time=1730079993%3B1730123193 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 查询集群备份文件下载地址

#### 输入示例

```
POST / HTTP/1.1
Host: cynosdb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DescribeBackupDownloadUrl
<公共请求参数>

{
    "ClusterId": "cynosdbmysql-dnofdr2d",
    "BackupId": 1879681
}
```

#### 输出示例

```json
{
    "Response": {
        "DownloadUrl": "https://ncdb-bj-pitr-1258***699.cos.ap-beijing.myqcloud.com/cynosdb/data/mysqldump/****9fd2-691a-11ef-b99a-b02628437590/2024-10-28/1879681/data_backup_1879681_20241028022147.xb?q-sign-algorithm=sha1&q-ak=************&q-sign-time=1730079993%3B1730123193&q-key-time=1730079993%3B1730123193&q-header-list=host&q-url-param-list=&q-signature=*****************",
        "RequestId": "9e56617c-c7cc-44e1-a967-6beb418ad5e7"
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
| FailedOperation.OperationFailedError | 操作失败，请稍后重试。如果持续不成功，请联系客服进行处理。 |
| InternalError.InternalHttpServerError | http请求执行异常。 |
| ResourceNotFound.ClusterNotFoundError | 集群不存在。 |
| UnauthorizedOperation.PermissionDenied | CAM鉴权不通过。 |