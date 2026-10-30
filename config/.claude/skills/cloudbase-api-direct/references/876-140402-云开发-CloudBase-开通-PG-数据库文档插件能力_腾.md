[API 中心](/document/api)

## 开通 PG 数据库文档插件能力

最近更新时间：2026-10-30 02:36:06

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

当前环境下开启 Postgresql 数据库文档插件能力，开启后会在指定 EnvId 的 PostgreSQL 实例下自动生成 pgdoc schema 以提供文档能力，不会额外产生费用，可以云开发控制或云 API 开启使用。  
当前支持地域已环境开通时所在地域为准。

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=EnablePGDocumentExt)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：EnablePGDocumentExt。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| EnvId | 是 | String | 
环境 id，租户级标识信息，开通环境时产生，全局唯一

参数格式：用户自定义小写英文命名 + 随机雪花字符

  
示例值：env-demo-xxxyyyzzz |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| Enabled | Boolean | 
是否开启成功标记

枚举值：

-   true： 开启成功
-   false： 开启失败

  
示例值：true |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 开启文档插件能力

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: EnablePGDocumentExt
<公共请求参数>

{
    "EnvId": "env-demo-xxxyyyzzz"
}
```

#### 输出示例

```json
{
    "Response": {
        "Enabled": true,
        "RequestId": "9b94b78e-eb60-4986-9b57-8b9d7a48dd61"
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

-   Tencent Cloud SDK 3.0 for Python: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-python/-/blob/master/tencentcloud/tcb/v20180608/tcb_client.py), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/tcb/v20180608/tcb_client.py), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/tcb/v20180608/tcb_client.py)
-   Tencent Cloud SDK 3.0 for Java: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-java/-/blob/master/src/main/java/com/tencentcloudapi/tcb/v20180608/TcbClient.java), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/tcb/v20180608/TcbClient.java), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/tcb/v20180608/TcbClient.java)
-   Tencent Cloud SDK 3.0 for PHP: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-php/-/blob/master/src/TencentCloud/Tcb/V20180608/TcbClient.php), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Tcb/V20180608/TcbClient.php), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Tcb/V20180608/TcbClient.php)
-   Tencent Cloud SDK 3.0 for Go: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-go/-/blob/master/tencentcloud/tcb/v20180608/client.go), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/tcb/v20180608/client.go), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/tcb/v20180608/client.go)
-   Tencent Cloud SDK 3.0 for Node.js: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-nodejs/-/blob/master/src/services/tcb/v20180608/tcb_client.ts), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/tcb/v20180608/tcb_client.ts), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/tcb/v20180608/tcb_client.ts)
-   Tencent Cloud SDK 3.0 for.NET: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-dotnet/-/blob/master/TencentCloud/Tcb/V20180608/TcbClient.cs), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Tcb/V20180608/TcbClient.cs), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Tcb/V20180608/TcbClient.cs)
-   Tencent Cloud SDK 3.0 for C++: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-cpp/-/blob/master/tcb/src/v20180608/TcbClient.cpp), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/tcb/src/v20180608/TcbClient.cpp), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/tcb/src/v20180608/TcbClient.cpp)
-   Tencent Cloud SDK 3.0 for Ruby: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-ruby/-/blob/master/tencentcloud-sdk-tcb/lib/v20180608/client.rb), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-tcb/lib/v20180608/client.rb), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-tcb/lib/v20180608/client.rb)

### 命令行工具

-   [Tencent Cloud CLI 3.0](https://cloud.tencent.com/document/product/440/6176)

## 6\. 错误码

以下仅列出了接口业务逻辑相关的错误码，其他错误码详见 [公共错误码](/document/api/876/34823#.E5.85.AC.E5.85.B1.E9.94.99.E8.AF.AF.E7.A0.81) 。

| 错误码 | 描述 |
| --- | --- |
| AuthFailure.DataSourceOperationAuthFailure | 鉴权失败，请在权限模块设置合理权限。 |
| FailedOperation.DocumentDependencyFilesMissing | 开通 PG Document 插件时，实例缺少依赖的插件 |
| FailedOperation.DocumentExtensionFilesMissing | 开通 PG Document 插件时，实例缺少 pgdoc 或 pgdoc\_core 等核心参数 |
| FailedOperation.DocumentExtensionUnavailable | 开通 PG Document 插件时，由于核心插件或依赖插件被黑名单禁用（通常属于安全风险） |
| FailedOperation.DocumentFlexdbCoexistence | 开通 PG Document 插件时与已有的 Flexdb 数据库能力冲突 |
| FailedOperation.DocumentLibraryUnavailable | 开通 PG Document 插件时，缺少核心类库 |
| FailedOperation.InstanceStatusConflict | Instance status does not match the required status for this operation. |
| FailedOperation.PGConnectError | Failed to connect to PostgreSQL instance. |
| FailedOperation.PGExecuteSqlError | Execute SQL error. |
| FailedOperation.PlatformError | 操作失败，后台依赖平台错误。 |
| InternalError.SYS\_ERR | 系统内部异常。 |
| InvalidParameter.INVALID\_PARAM | 请求参数错误。 |
| OperationDenied | 操作被拒绝。 |
| OperationDenied.ResourceAlreadyExists | 操作被拒绝，资源已存在。 |
| OperationDenied.ResourceDepended | 当前操作被禁止，资源被依赖 |
| ResourceNotFound.InstanceNotFound | 数据库实例不存在。 |
| ResourceNotFound.RoleNotFound | Database role not found. |