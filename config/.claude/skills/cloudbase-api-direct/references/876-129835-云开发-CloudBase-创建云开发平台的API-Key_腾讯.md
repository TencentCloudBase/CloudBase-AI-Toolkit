[API 中心](/document/api)

## 创建云开发平台的API Key

最近更新时间：2026-03-27 02:59:36

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

创建云开发平台的API Key。在指定云开发环境下创建一个 API Key 访问凭证。支持两种类型：api\_key（服务端管理员访问凭证，以管理员身份签发，可设置有效期，不设置有效期则永不过期，单个环境最多创建 5 个）和 publish\_key（前端匿名访问凭证，固定有效期，每个环境仅保留一个）。创建成功后将返回 API Key 明文 Token，该值仅在创建时返回一次，请妥善保存。需要管理员权限。

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=CreateApiKey)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：CreateApiKey。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 是 | String | [公共参数](/document/api/876/34812) ，详见产品支持的 [地域列表](/document/api/876/34812#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8) 。 |
| EnvId | 是 | String | 环境 ID，用于标识该密钥归属的云开发环境，不同环境之间的数据相互隔离  
示例值：env-123 |
| KeyType | 是 | String | 密钥类型。可选值：api\_key（服务端调用使用的 API 密钥，具有完整权限，请勿暴露在客户端）、publish\_key（客户端使用的公开密钥，权限受限，可安全用于前端或移动端）。  
示例值：publish\_key |
| KeyName | 否 | String | 密钥的自定义名称，用于在管理列表中标识和区分不同的密钥，建议填写能体现用途或归属的描述性名称，例如：server-prod、mobile-test  
示例值：server\_key |
| ExpireIn | 否 | Integer | 密钥的有效期，单位为秒，最短不得低于 7200 秒。超过有效期后密钥将自动失效。不设置或设置为 0 则表示永不过期，建议根据安全需求合理设置有效期  
示例值：7776000 |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| KeyId | String | API Key 的唯一标识符，由系统基于 JWT Access Token Hash 自动生成。后续对该 API Key 进行查询、修改名称或删除操作时，均需使用该值作为定位参数  
示例值：6qBr24a4Tn3sKs1UZSsv\_w |
| Name | String | API Key 的名称，即创建时传入的 KeyName 参数值。对于 publish\_key 类型，该值固定为 publish\_key  
示例值：publish\_key |
| ApiKey | String | API Key 的令牌值（JWT 格式），用于服务端接口调用时的身份认证。出于安全考虑，仅在创建时返回一次完整明文；后续通过列表查询接口获取时，api\_key 类型将进行脱敏处理；publish\_key 类型始终返回完整明文。请在创建后妥善保存  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：eyJhbGciOiJSUzI1NiIsImtpZCskdfhss |
| ExpireAt | [Timestamp ISO8601](/document/api/876/78570) | API Key 的过期时间。对于 api\_key 类型：若创建时未指定有效期，则该字段不返回，表示永不过期；若指定了有效期，则返回具体的过期时间。对于 publish\_key 类型：始终返回，固定为 2099 年  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：2099-03-16T15:48:48+08:00 |
| CreateAt | [Timestamp ISO8601](/document/api/876/78570) | API Key 的创建时间。对于 api\_key 类型：为实际创建该 Key 时的时间。对于 publish\_key 类型：若环境下已存在 publish\_key，则返回首次创建的时间而非本次调用时间  
注意：此字段可能返回 null，表示取不到有效值。  
示例值：2026-03-16T15:48:48+08:00 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 新增publish\_key类型的key

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateApiKey
<公共请求参数>

{
    "EnvId": "env-123",
    "KeyType": "publish_key"
}
```

#### 输出示例

```json
{
    "Response": {
        "ApiKey": "eyJhbGciOiJSUzI1NiIsImtpZCskdfhss",
        "CreateAt": "2026-03-16T15:48:48+08:00",
        "ExpireAt": "2099-03-16T15:48:48+08:00",
        "KeyId": "6qBr24a4Tn3sKs1UZSsv_w",
        "Name": "publish_key",
        "RequestId": "fd103953-d395-449c-9f1d-ea3822e48af6"
    }
}
```

### 示例2 新增90天过期的api\_key类型的key

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateApiKey
<公共请求参数>

{
    "EnvId": "env-123",
    "KeyType": "api_key",
    "KeyName": "server_key",
    "ExpireIn": 7776000
}
```

#### 输出示例

```json
{
    "Response": {
        "ApiKey": "eyJhbGciOiJSUzI1NiIsImtpZCskdfhss",
        "CreateAt": "2026-03-16T15:48:48+08:00",
        "ExpireAt": "2026-06-16T15:48:48+08:00",
        "KeyId": "6qBr24a4Tn3sKs1UZSsv_w",
        "Name": "server_key",
        "RequestId": "ddea6362-324d-4485-b32c-7b93044639b1"
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
| AuthFailure | CAM签名/鉴权错误。 |
| FailedOperation | 操作失败。 |
| InternalError | 内部错误。 |
| InvalidParameter | 参数错误。 |
| InvalidParameterValue | 参数取值错误。 |
| LimitExceeded | 超过配额限制。 |
| ResourceInUse | 资源被占用。 |
| ResourceUnavailable | 资源不可用。 |
| UnauthorizedOperation | 未授权操作。 |
| UnknownParameter | 未知参数错误。 |

目录