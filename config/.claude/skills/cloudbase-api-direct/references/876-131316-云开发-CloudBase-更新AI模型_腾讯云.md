[API 中心](/document/api)

## 更新AI模型

最近更新时间：2026-06-23 01:51:11

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

更新 AI 模型配置分组。支持修改分组的模型列表、服务地址、访问密钥、备注及启用状态。

不同分组类型支持的更新操作如下：  
自定义类型（custom）：可更新模型服务地址（BaseUrl）、访问密钥（Secret）、模型列表及分组备注。  
内置类型（builtin）：默认由云开发平台统一管理服务地址和密钥。若同时传入自定义 BaseURL 和 Secret，该分组将自动转换为自定义类型（custom），后续使用用户自行提供的服务地址和访问密钥，平台不再托管其凭证。

分组类型转换说明:  
调用本接口时，可通过传入 BaseURL 与 Secret 参数触发分组类型的自动转换，规则如下：  
(1) builtin → custom（内置转自定义）  
当分组当前类型（Type）为 builtin 时，若请求中同时传入有效的 BaseURL（非 http://default.tcb）和 Secret，系统将自动将该分组转换为自定义类型（Type = custom）。转换后，平台不再托管该分组的服务地址和访问密钥，后续将使用用户自行提供的 BaseUrl 与 Secret 对模型服务发起请求。

(2) custom → builtin（自定义恢复内置托管）  
仅当分组的原始类型（OriginType）为 builtin 时，支持将分组恢复为内置托管类型。将 BaseUrl 传入固定值 http://default.tcb，且不传入 Secret，系统将自动将该分组转换回内置托管类型（Type = builtin），平台重新接管其服务地址和访问密钥。  
若 OriginType 为 CUSTOM（即用户通过 [CreateAIModel](https://cloud.tencent.com/document/product/876/131320) 接口自行创建的自定义分组），不支持恢复为内置托管类型。

更新成功后，可通过 [DescribeAIModels](https://cloud.tencent.com/document/product/876/131318) 接口查询最新分组配置。

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=UpdateAIModel)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：UpdateAIModel。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| EnvId | 是 | String | 
环境id

  
示例值：envid-dhjkashdjka |
| GroupName | 是 | String | 

分组名

  
示例值：tencent-huanyuan |
| BaseUrl | 否 | String | 

模型地址

枚举值：

-   http://default.tcb： 默认模型地址，custom模型切换为builtin模型时使用

  
示例值：http://xxx |
| Models.N | 否 | Array of [AIModel](/document/api/876/34822#AIModel) | 

模型名列表

Models 列表更新采用全量替换

 |
| Remark | 否 | String | 

备注

  
示例值：正式模型 |
| Status | 否 | Integer | 

模型状态, 1: 开启, 2: 关闭

  
示例值：1 |
| Secret | 否 | [AIModelSecret](/document/api/876/34822#AIModelSecret) | 

模型密钥

 |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| Count | Integer | 
更新数量

  
示例值：1 |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 更新模型列表

更新模型列表

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: UpdateAIModel
<公共请求参数>

{
    "EnvId": "httpservice-wushan-8devh79e82d2a",
    "GroupName": "cloudbase-test",
    "Models": [
        {
            "Model": "hy3-preview"
        }
    ]
}
```

#### 输出示例

```json
{
    "Response": {
        "Count": 1,
        "RequestId": "dffc99bc-c381-4d74-9bf4-ec8e141ea3bd"
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
| FailedOperation.PackageUnsupported | 套餐包不支持 |
| InternalError | 内部错误。 |
| InvalidParameter | 参数错误。 |
| InvalidParameter.EnvId | 环境ID非法。 |
| InvalidParameter.ResourceNotExists | 对应资源不存在。 |