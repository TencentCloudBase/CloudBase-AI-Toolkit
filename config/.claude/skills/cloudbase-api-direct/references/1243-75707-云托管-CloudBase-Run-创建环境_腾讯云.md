[API 中心](/document/api)

## 创建环境

最近更新时间：2025-12-24 02:46:09

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcbr.tencentcloudapi.com 。

创建云托管环境，并开通资源。

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcbr&Version=2022-02-17&Action=CreateCloudRunEnv)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/1243/75716) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/1243/75716) ，本接口取值：CreateCloudRunEnv。 |
| Version | 是 | String | [公共参数](/document/api/1243/75716) ，本接口取值：2022-02-17。 |
| Region | 是 | String | [公共参数](/document/api/1243/75716) ，详见产品支持的 [地域列表](/document/api/1243/75716#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8) 。 |
| PackageType | 是 | String | 
Trial,Standard,Professional,Enterprise

  
示例值：Enterprise |
| Alias | 否 | String | 

环境别名，要以a-z开头，不能包含 a-z,0-9,- 以外的字符

  
示例值：alias |
| FreeQuota | 否 | String | 

用户享有的免费额度级别，目前只能为“basic”，不传该字段或该字段为空，标识不享受免费额度。

  
示例值：basic |
| Flag | 否 | String | 

订单标记。建议使用方统一转大小写之后再判断。QuickStart：快速启动来源Activity：活动来源

  
示例值：QuickStart |
| VpcId | 否 | String | 

私有网络Id

  
示例值：vpc-45olnsxx |
| SubNetIds.N | 否 | Array of String | 

子网列表

  
示例值：\["subnet-n17bt4yb","subnet-dw0xrh1b","subnet-h5xm5f2x"\] |
| ReqKey | 否 | String | 

请求key 用于防重

  
示例值：4045b63716e |
| Source | 否 | String | 

来源：wechat | cloud | weda

  
示例值：wechat |
| Channel | 否 | String | 

渠道：wechat | cloud | weda

  
示例值：wechat |
| EnvId | 否 | String | 

环境ID 云开发平台必填

  
示例值：env-sdjflskjfd |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| EnvId | String | 
环境Id

  
示例值：prod-3g69bdvme2ac11cb |
| TranId | String | 

后付费订单号

  
示例值：0ow89eea326 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 开通云托管环境

#### 输入示例

```
POST / HTTP/1.1
Host: tcbr.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateCloudRunEnv
<公共请求参数>

{
    "EnvId": "lowcode-xxxxxxxxxx",
    "PackageType": "Trial",
    "Source": "weda",
    "Channel": "weda",
    "Alias": "default"
}
```

#### 输出示例

```json
{
    "Response": {
        "EnvId": "lowcode-xxxxxxxxxx",
        "RequestId": "c8b68d5a-d045-4740-b731-xxxxxxx",
        "TranId": ""
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

-   Tencent Cloud SDK 3.0 for Python: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-python/-/blob/master/tencentcloud/tcbr/v20220217/tcbr_client.py), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/tcbr/v20220217/tcbr_client.py), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-python/blob/master/tencentcloud/tcbr/v20220217/tcbr_client.py)
-   Tencent Cloud SDK 3.0 for Java: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-java/-/blob/master/src/main/java/com/tencentcloudapi/tcbr/v20220217/TcbrClient.java), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/tcbr/v20220217/TcbrClient.java), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-java/blob/master/src/main/java/com/tencentcloudapi/tcbr/v20220217/TcbrClient.java)
-   Tencent Cloud SDK 3.0 for PHP: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-php/-/blob/master/src/TencentCloud/Tcbr/V20220217/TcbrClient.php), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Tcbr/V20220217/TcbrClient.php), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-php/blob/master/src/TencentCloud/Tcbr/V20220217/TcbrClient.php)
-   Tencent Cloud SDK 3.0 for Go: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-go/-/blob/master/tencentcloud/tcbr/v20220217/client.go), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/tcbr/v20220217/client.go), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-go/blob/master/tencentcloud/tcbr/v20220217/client.go)
-   Tencent Cloud SDK 3.0 for Node.js: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-nodejs/-/blob/master/src/services/tcbr/v20220217/tcbr_client.ts), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/tcbr/v20220217/tcbr_client.ts), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/tcbr/v20220217/tcbr_client.ts)
-   Tencent Cloud SDK 3.0 for.NET: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-dotnet/-/blob/master/TencentCloud/Tcbr/V20220217/TcbrClient.cs), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Tcbr/V20220217/TcbrClient.cs), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-dotnet/blob/master/TencentCloud/Tcbr/V20220217/TcbrClient.cs)
-   Tencent Cloud SDK 3.0 for C++: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-cpp/-/blob/master/tcbr/src/v20220217/TcbrClient.cpp), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/tcbr/src/v20220217/TcbrClient.cpp), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-cpp/blob/master/tcbr/src/v20220217/TcbrClient.cpp)
-   Tencent Cloud SDK 3.0 for Ruby: [CNB](https://cnb.cool/tencent/cloud/api/sdk/tencentcloud-sdk-ruby/-/blob/master/tencentcloud-sdk-tcbr/lib/v20220217/client.rb), [GitHub](https://github.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-tcbr/lib/v20220217/client.rb), [Gitee](https://gitee.com/TencentCloud/tencentcloud-sdk-ruby/blob/master/tencentcloud-sdk-tcbr/lib/v20220217/client.rb)

### 命令行工具

-   [Tencent Cloud CLI 3.0](https://cloud.tencent.com/document/product/440/6176)

## 6\. 错误码

以下仅列出了接口业务逻辑相关的错误码，其他错误码详见 [公共错误码](/document/api/1243/75720#.E5.85.AC.E5.85.B1.E9.94.99.E8.AF.AF.E7.A0.81) 。

| 错误码 | 描述 |
| --- | --- |
| InternalError | 内部错误。 |
| InvalidParameter | 参数错误。 |
| MissingParameter | 缺少参数错误。 |
| ResourceInUse | 资源被占用。 |
| ResourceInsufficient | 资源不足。 |