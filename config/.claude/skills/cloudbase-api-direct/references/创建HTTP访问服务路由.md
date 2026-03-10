## 1. 接口描述

<strong><font color="blue">此接口被设置为 产品内部展示 。</font></strong>

<strong><font color="blue">此文档展示的是开发联调环境的接口文档 。</font></strong>

接口请求域名： tcb.dev.tencentcloudapi.com 。

创建HTTP访问服务路由。如果不传Domain.Routes，仅创建域名信息。首次创建域名后需要调用DescribeHTTPServiceRoute查询域名状态，如果状态是PROCESSING，需要轮询查询域名状态直到SUCCESS或者FAIL。如果状态是FAIL，可以删除后重新创建。

## 2. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/product/705/16277?!preview&preview_docmenu=1&lang=cn&!document=1)。

| 参数名称 | 必选 | 类型 | 描述 |
|---------|---------|---------|---------|
| Action | 是 | String | [公共参数](/document/product/705/16277?!preview&preview_docmenu=1&lang=cn&!document=1)，本接口取值：CreateHTTPServiceRoute。 |
| Version | 是 | String | [公共参数](/document/product/705/16277?!preview&preview_docmenu=1&lang=cn&!document=1)，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/product/705/16277?!preview&preview_docmenu=1&lang=cn&!document=1)，此参数为可选参数。 |
| EnvId | 是 | String | 环境ID<br/>示例值：\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*-7ezncwdd421446 |
| Domain | 否 | [HTTPServiceDomainParam](/document/product/705/16289?!preview&preview_docmenu=1&lang=cn&!document=1#HTTPServiceDomainParam) | 域名路由信息 |

## 3. 输出参数

| 参数名称 | 类型 | 描述 |
|---------|---------|---------|
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。|

## 4. 示例

### 示例1 创建完整路由

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateHTTPServiceRoute
<公共请求参数>

{
  "EnvId": "*****************-7ezncwdd421446",
  "Domain": {
    "Domain": "xxx.***************.cn",
    "AccessType": "DIRECT",
    "CertId": "VF******",
    "Protocol": "HTTP_HTTPS",
    "Enable": true,
    "Routes": [
      {
        "Path": "/api/v1",
        "UpstreamResourceType": "CBR",
        "UpstreamResourceName": "my-service",
        "EnableSafeDomain": true,
        "EnableAuth": true,
        "EnablePathTransmission": true,
        "QPSPolicy": {
          "QPSTotal": 1000,
          "QPSPerClient": {
            "LimitBy": "ClientIP",
            "LimitValue": 10
          }
        },
        "Enable": true
      }
    ]
  }
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "44181fd5-f9ce-454a-8ed5-79bf3cc10687"
    }
}
```


## 5. 开发者资源

### 腾讯云 API 平台

[腾讯云 API 平台](https://cloud.tencent.com/api) 是综合 API 文档、错误码、API Explorer 及 SDK 等资源的统一查询平台，方便您从同一入口查询及使用腾讯云提供的所有 API 服务。

### API Inspector

用户可通过 [API Inspector](https://cloud.tencent.com/document/product/1278/49361) 查看控制台每一步操作关联的 API 调用情况，并自动生成各语言版本的 API 代码，也可前往 [API Explorer](https://cloud.tencent.com/document/product/1278/46697) 进行在线调试。

### SDK

云 API 3.0 提供了配套的开发工具集（SDK），支持多种编程语言，能更方便的调用 API。
* [Tencent Cloud SDK 3.0 for Python](https://github.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/tcb/v20180608/tcb_client.py)
* [Tencent Cloud SDK 3.0 for Java](https://github.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/tcb/v20180608/TcbClient.java)
* [Tencent Cloud SDK 3.0 for PHP](https://github.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Tcb/V20180608/TcbClient.php)
* [Tencent Cloud SDK 3.0 for Go](https://github.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/tcb/v20180608/client.go)
* [Tencent Cloud SDK 3.0 for Node.js](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/tcb/v20180608/tcb_client.ts)
* [Tencent Cloud SDK 3.0 for .NET](https://github.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Tcb/V20180608/TcbClient.cs)
* [Tencent Cloud SDK 3.0 for C++](https://github.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/tcb/src/v20180608/TcbClient.cpp)

### 命令行工具

* [Tencent Cloud CLI 3.0](https://cloud.tencent.com/document/product/440/6176)

## 6. 错误码

以下仅列出了接口业务逻辑相关的错误码，其他错误码详见 [公共错误码](/document/product/705/38463?!preview&preview_docmenu=1&lang=cn&!document=1#.E5.85.AC.E5.85.B1.E9.94.99.E8.AF.AF.E7.A0.81)。

| 错误码 | 描述 |
|---------|---------|
| InvalidParameter.CertVerifyFailed | 证书验证失败 |
| InvalidParameter.EnvId | 环境ID非法。 |
| InvalidParameter.HTTPServiceDomainNotICP | HTTP访问服务没有ICP备案 |
| LimitExceeded.HTTPServiceDomain | HTTP访问服务域名超过限制 |
| LimitExceeded.HTTPServiceRoute | HTTP访问服务路由超过上限 |
| OperationDenied.HTTPServiceDomainInBlacklist | 域名在黑名单中，无法创建 |
| OperationDenied.NonInternalAccount | 非内部账号禁止操作 |
| ResourceInUse.HTTPServiceDomain | HTTP访问服务域名已经存在 |
| ResourceInUse.HTTPServiceRoute | HTTP访问服务路由已存在 |
| ResourceNotFound.HTTPServiceDomain | HTTP访问服务域名不存在 |
