[API 中心](/document/api)

## 创建计费订单

最近更新时间：2026-03-02 12:47:52

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

## 1\. 接口描述

接口请求域名： tcb.tencentcloudapi.com 。

创建云开发产品计费订单，用于以下几种场景：

1.  购买云开发环境
2.  续费云开发环境
3.  变更云开发环境套餐
4.  购买云开发资源包
5.  购买云开发大促包

该接口支持下单并支付(CreateAndPay=true时)，此时会自动在腾讯云账户中扣除余额（余额不足会下单失败）。  
该接口支持自动扣除代金券（AutoVoucher=true时），符合条件的代金券会被自动扣除。

默认接口请求频率限制：20次/秒。

推荐使用 API Explorer

[点击调试](https://console.cloud.tencent.com/api/explorer?Product=tcb&Version=2018-06-08&Action=CreateBillDeal)

API Explorer 提供了在线调用、签名验证、SDK 代码生成和快速检索接口等能力。您可查看每次调用的请求内容和返回结果以及自动生成 SDK 调用示例。

## 2\. 输入参数

以下请求参数列表仅列出了接口请求参数和部分公共参数，完整公共参数列表见 [公共请求参数](/document/api/876/34812) 。

| 参数名称 | 必选 | 类型 | 描述 |
| --- | --- | --- | --- |
| Action | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：CreateBillDeal。 |
| Version | 是 | String | [公共参数](/document/api/876/34812) ，本接口取值：2018-06-08。 |
| Region | 否 | String | [公共参数](/document/api/876/34812) ，本接口不需要传递此参数。 |
| DealType | 是 | String | 当前下单的操作类型，可取\[purchase,renew,modify\]三种值，分别代表新购，续费，变配。  
示例值：purchase |
| ProductType | 是 | String | 购买的产品类型，可取\[tcb-baas,tcb-promotion,tcb-package\], 分别代表baas套餐、大促包、资源包  
示例值：tcb-baas |
| PackageId | 是 | String | 目标下单产品/套餐Id。  
对于云开发环境套餐，可通过 DescribeBaasPackageList 接口获取，对应其出参的PackageName  
示例值：baas\_personal |
| CreateAndPay | 否 | Boolean | 默认只下单不支付，为ture则下单并支付。  
如果需要下单并支付，请确保账户下有足够的余额，否则会导致下单失败。  
示例值：true |
| TimeSpan | 否 | Integer | 购买时长，与TimeUnit字段搭配使用。  
示例值：1 |
| TimeUnit | 否 | String | 购买时长单位,按各产品规则可选d(天),m(月),y(年),p(一次性)。  
对于 云开发环境的 新购和续费，目前仅支持 按月购买（即 TimeUnit=m）。  
示例值：m |
| ResourceId | 否 | String | 资源唯一标识。  
在云开发环境 续费和变配 场景下必传，取值为环境ID。  
示例值：cloud-0g6kw62kbda53cb6 |
| Source | 否 | String | 来源可选\[qcloud,miniapp\]，默认qcloud。  
miniapp表示微信云开发，主要适用于 [小程序云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/billing/price.html) 。  
  
示例值：qcloud |
| Alias | 否 | String | 环境别名，用于新购云开发环境时，给云开发环境起别名。  
仅当 新购云开发环境（DealType=purchase 并且 ProductType=tcb-baas ）时有效。  
  
\### 格式要求  
\- 可选字符： 小写字母(a~z)、数字、减号(-)  
\- 不能以 减号(-) 开头或结尾  
\- 不能有连个连续的 减号(-)  
\- 长度不超过20位  
示例值：cloud |
| EnvId | 否 | String | 环境id，当购买资源包和大促包时（ProductType取值为tcb-promotion 或 tcb-package）必传，表示资源包在哪个环境下生效。  
示例值：cloud-0g6kw62kbda53cb6 |
| EnableExcess | 否 | Boolean | 开启超限按量。  
开启后，当 套餐内的资源点 和 资源包 都用尽后，会自动按量计费。  
详见 [计费说明](https://cloud.tencent.com/document/product/876/127357) 。  
示例值：true |
| ModifyPackageId | 否 | String | 变配目标套餐id，对于云开发环境变配场景下必传。  
对于云开发环境套餐，可通过 DescribeBaasPackageList 接口获取，对应其出参的PackageName  
示例值：baas\_team |
| Extension | 否 | String | jsonstr附加信息  
示例值："{}" |
| AutoVoucher | 否 | Boolean | 是否自动选择代金券支付。  
示例值：false |
| ResourceTypes.N | 否 | Array of String | 资源类型。  
代表新购环境（DealType=purchase 并且 ProductType=tcb-baas ）时需要发货哪些资源。  
可取值：flexdb, cos, cdn, scf  
  
示例值：\["flexdb"\] |
| EnvTags.N | 否 | Array of [Tag](/document/api/876/34822#Tag) | 环境标签。  
代表新购环境（DealType=purchase 并且 ProductType=tcb-baas ）时需要打的标签。  
 |

## 3\. 输出参数

| 参数名称 | 类型 | 描述 |
| --- | --- | --- |
| RequestId | String | 唯一请求 ID，由服务端生成，每次请求都会返回（若请求因其他原因未能抵达服务端，则该次请求不会获得 RequestId）。定位问题时需要提供该次请求的 RequestId。 |

## 4\. 示例

### 示例1 创建环境并指定资源类型和CAM标签

购买新环境，并指定所需资源类型，以及自动绑定CAM标签。  
环境创建完之后，通过DescribeEnvs接口查询初始化进度及详细信息等。

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateBillDeal
<公共请求参数>

{
    "DealType": "purchase",
    "ProductType": "tcb-baas",
    "PackageId": "baas_personal",
    "CreateAndPay": true,
    "TimeSpan": 1,
    "TimeUnit": "m",
    "Source": "qcloud",
    "Alias": "cloud",
    "EnableExcess": true,
    "AutoVoucher": true,
    "ResourceTypes": [
        "flexdb"
    ],
    "EnvTags": [
        {
            "Key": "user",
            "Value": "jeffeng"
        }
    ]
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "64a8e42d-0372-42b1-b933-8a05715d29bf"
    }
}
```

### 示例2 变配云开发baas套餐

指定当前生效套餐和变配目标套餐；指定目标变配资源/环境；（示例将个人版套餐变配为团队版套餐）

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateBillDeal
<公共请求参数>

{
    "DealType": "modify",
    "ProductType": "tcb-baas",
    "PackageId": "baas_personal",
    "CreateAndPay": true,
    "ResourceId": "cloud-0g6kw62kbda53cb6",
    "EnvId": "cloud-0g6kw62kbda53cb6",
    "EnableExcess": false,
    "ModifyPackageId": "baas_team"
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "2a317487-4ca1-4edc-80aa-e2c300f5f7ae"
    }
}
```

### 示例3 新购云开发baas套餐

购买云开发baas个人版套餐，购买时长1个月，指定环境别名为cloud，开启超限按量。  
环境创建完之后，通过DescribeEnvs接口查询初始化进度及详细信息等。

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateBillDeal
<公共请求参数>

{
    "DealType": "purchase",
    "ProductType": "tcb-baas",
    "PackageId": "baas_personal",
    "CreateAndPay": true,
    "TimeSpan": 1,
    "TimeUnit": "m",
    "Alias": "cloud",
    "EnableExcess": true
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "d5ce71e0-cf6e-4387-90e4-a4a1ed0f2a8d"
    }
}
```

### 示例4 新购云开发baas套餐教育体验版

新购baas教育体验版。  
环境创建完之后，通过DescribeEnvs接口查询初始化进度及详细信息等。

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateBillDeal
<公共请求参数>

{
    "DealType": "purchase",
    "ProductType": "tcb-baas",
    "PackageId": "education_demo",
    "CreateAndPay": true,
    "TimeSpan": 1,
    "TimeUnit": "m",
    "Source": "qcloud",
    "Alias": "education"
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "a9487229-4a54-468c-b5f9-900ab9d0387c"
    }
}
```

### 示例5 新购云开发大促包

给指定环境加购flexdb大促包，大促包时长1天

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateBillDeal
<公共请求参数>

{
    "DealType": "purchase",
    "ProductType": "tcb-promotion",
    "PackageId": "pkg_flexdb_promotion_3000",
    "CreateAndPay": true,
    "TimeSpan": 1,
    "TimeUnit": "d",
    "EnvId": "cloud2-3gn8d5ah836cac09"
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "0ac4bb6a-9a74-4390-bcf1-51b4938d83d0"
    }
}
```

### 示例6 新购云开发资源包

给指定环境购买调用次数资源包，购买时长固定为一个月

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateBillDeal
<公共请求参数>

{
    "DealType": "purchase",
    "ProductType": "tcb-package",
    "PackageId": "pkg_tcb_api_invoke_num",
    "CreateAndPay": true,
    "TimeSpan": 1,
    "TimeUnit": "m",
    "EnvId": "cloud2-3gn8d5ah836cac09"
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "d0ff4d25-f803-46f1-80dc-3b36af94af39"
    }
}
```

### 示例7 续费云开发baas套餐

给指定套餐/环境续费指定时长，时长单位为月

#### 输入示例

```
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateBillDeal
<公共请求参数>

{
    "DealType": "renew",
    "ProductType": "tcb-baas",
    "PackageId": "baas_personal",
    "CreateAndPay": true,
    "TimeSpan": 1,
    "TimeUnit": "m",
    "ResourceId": "cloud-2g248wj43786d54d",
    "EnvId": "cloud-2g248wj43786d54d",
    "EnableExcess": true
}
```

#### 输出示例

```json
{
    "Response": {
        "RequestId": "e45941ab-9a88-49df-8626-188a8d6c7236"
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

该接口暂无业务逻辑相关的错误码，其他错误码详见 [公共错误码](/document/api/876/34823#.E5.85.AC.E5.85.B1.E9.94.99.E8.AF.AF.E7.A0.81) 。

目录