[API 中心](/document/api)

## 查询云托管环境列表

最近更新时间：2026-03-18 02:55:59

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcbr.tencentcloudapi.com 。

获取环境列表，含环境下的各个资源信息。尤其是各资源的唯一标识，是请求各资源的关键参数

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcbr&Version=2022-02-17&Action=DescribeCloudRunEnvs)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/1243/75716) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/1243/75716) ，本接口取值：DescribeCloudRunEnvs。 |
| Version | 是 | String | [公共参数](/document/api/1243/75716) ，本接口取值：2022-02-17。 |
| Region | 是 | String | [公共参数](/document/api/1243/75716) ，详见产品支持的 [地域列表](/document/api/1243/75716#.E5.9C.B0.E5.9F.9F.E5.88.97.E8.A1.A8) 。 |
| EnvId | 否 | String | 
环境ID，如果传了这个参数则只返回该环境的相关信息

  
示例值：prod-6gvwy9lua50e9504 |
| IsVisible | 否 | Boolean | 

指定Channels字段为可见渠道列表或不可见渠道列表  
如只想获取渠道A的环境 就填写IsVisible= true,Channels = \["A"\], 过滤渠道A拉取其他渠道环境时填写IsVisible= false,Channels = \["A"\]

  
示例值：false |
| Channels.N | 否 | Array of String | 

渠道列表，代表可见或不可见渠道由IsVisible参数指定

  
示例值：\["ide","qc\_console"\] |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| EnvList | Array of [EnvInfo](/document/api/1243/75713#EnvInfo) | 
环境信息列表

 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 查询环境信息

#### 输入示例

```
POST / HTTP/1.1
Host: tcbr.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DescribeCloudRunEnvs
<公共请求参数>

{
    "EnvId": "lowcode-xxxxxx",
    "Channels": []
}
```

#### 输出示例

```json
{
    "Response": {
        "EnvList": [
            {
                "Alias": "lowcode",
                "CreateTime": "2022-04-11 14:00:28",
                "CustomLogServices": [],
                "Databases": [],
                "EnvChannel": "low_code",
                "EnvId": "lowcode-xxxxxx",
                "EnvType": "baas",
                "Functions": [],
                "IsAutoDegrade": false,
                "IsDefault": false,
                "LogServices": [],
                "PackageId": "",
                "PackageName": "",
                "PayMode": "",
                "Region": "ap-shanghai",
                "Source": "qcloud",
                "StaticStorages": [
                    {
                        "Bucket": "8738-static-lowcode-xxxxxx",
                        "DefaultDirName": "",
                        "Region": "ap-shanghai",
                        "StaticDomain": "lowcode-xxxxxx-xxxxxx.tcloudbaseapp.com",
                        "Status": "create_fail"
                    }
                ],
                "Status": "UNAVAILABLE",
                "Storages": [],
                "Tags": [],
                "UpdateTime": "2022-04-11 14:00:28"
            }
        ],
        "RequestId": "ab5ecfa4-9d05-xxxxxx"
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
| AuthFailure | CAM签名/鉴权错误。 |
| InternalError | 内部错误。 |
| InvalidParameter | 参数错误。 |
| MissingParameter | 缺少参数错误。 |