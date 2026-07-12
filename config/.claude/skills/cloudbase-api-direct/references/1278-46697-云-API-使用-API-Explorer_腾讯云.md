[云 API](/document/product/1278)

## 使用 API Explorer

最近更新时间：2026-05-13 18:29:00

-   微信扫一扫 
-   QQ
-   新浪微博
-   复制链接
    
    链接复制成功
    

_我的收藏_

[腾讯云 API Explorer](https://console.cloud.tencent.com/api/explorer) 是一款自动化在线调试工具，目前已支持云服务器 CVM、私有网络 VPC、云硬盘 CBS 等 [腾讯云产品](https://cloud.tencent.com/product) 的 API 接口调用自动化。可实现自动生成 Java、Python、Node.js、PHP、Go 及.NET 语言的 SDK 代码、在线调用、发送真实请求及签名串自动生成等功能，降低了 SDK 的使用难度。

## API Explorer 工具详细介绍

本文将以 API Explorer 工具整体页面从左至右顺序依次详细介绍。如下图所示：

![](https://qcloudimg.tencent-cloud.cn/image/document/be23904aadcc652d04dcfe3263143d9b.png)

  

1.**产品区域** ：点击选择产品，目前已支持的所有产品。

2.**产品接口区域** ：当前产品下已支持的所有功能接口。

3.**所选接口信息**

**接口名** ：所选择的接口名。

**产品版本** ：各产品版本有一定区别，详情请参见各接口文档。图中为云服务器接口版本 2017-03-12。

**注意事项** ：在您发起在线调用时，平台将根据登录用户信息，获取当前账号临时 Access Keys 发起操作。若为敏感操作，则需进行身份验证。

**更多选项** ：单击 **更多选项** ，可选择 Endpoint（请求域名）。其表示接入地域，默认就近接入。

4.**接口参数输入** ：仅展示接口所需参数，您可勾选“只看必填参数”进行筛选。具体参数说明可通过选择右侧的 **参数说明** 进行查看。

5.**功能区** ：

**在线调用** ：在填写参数后，选择 **发送请求** 。首先进行身份验证，系统会发送您在左侧填写的参数到对应的接口。该操作等同于真实操作，同时系统会展示请求结果、响应头等相关信息。

**代码示例** ：可通过此功能自动生成多种接入方式、语言版本下示例代码，降低使用难度。

**CLI 示例：** 查看当前接口及输入参数下的命令行调用示例。

**签名示例** ：可通过此功能自动生成签名串，默认使用 API 3.0 v3 版本。您可按需选择其他版本，及设置 Timestamp、Token、Method 参数。如下图所示：

![](https://qcloudimg.tencent-cloud.cn/image/document/5578e8d731cf17af4dfc0688c7d5170b.png)

  

各参数说明如下：

**Timestamp（仅在验证签名串生成时有效）** ：当前 UNIX 时间戳，精确到秒，用于记录发起 API 请求的时间。 Timestamp 必须为当前系统时间，且需确保系统时间与标准时间同步，若相差超过5分钟则会发生请求失败。若长时间不和标准时间同步，则可能导致运行一段时间后，请求失败并返回签名过期错误。

**Token** ：用于认证用户身份。各产品对该参数要求可能有一定区别，如有需要会注明获取方式，详情请参见各接口文档。

**Method（仅在验证签名串生成时有效）** ：默认为 POST 请求，请结合接口文档进行选择。

**文档说明：** 查看当前API及其出入参等的说明文档。

**数据模拟** ：可通过 mock 功能，在开发阶段更方便地调试代码，模拟真实调用返回数据。使用方法请参见 。

**问题反馈** ：如您在使用过程中遇到任何问题，可以 向我们反馈。

6.**子功能区** ：

**在线调用** 标签页下，您可单击 **发送请求** 发起调用、查看响应结果。

**示例代码** 标签页下，您可切换语言版本生成对应代码，也可单击 **调试代码** 通过 CloudShell 运行示例代码。单击 **SDK 信息** 查看当前 SDK 版本、使用条件等。

## 调用接口

本文以 [查询可用区列表](https://cloud.tencent.com/document/product/213/15707) 接口为例，使用 API Explorer 工具进行调用：

1.填写所需参数，可选择右侧功能区中的 **参数说明** 查看接口具体参数信息。

2.选择右侧功能区中的 **在线调用** \> **发送请求** ，即可在响应区查看请求结果。如下图所示：

![](https://qcloudimg.tencent-cloud.cn/image/document/c9046cfeff0f1038ea95dd23b1944835.png)

  

## 查看历史调用

您可通过历史调用查看接口曾经的调用情况，查看发起调用的时间、调用的参数、本次调用的状态。您还可收藏历史调用，以便后续直接发起调用。

进入 [API Explorer 工具](https://console.cloud.tencent.com/api/explorer) 页面，单击 **输入参数** 下方的 **调用历史** ，即可查看接口历史调用信息。如下图所示：

![](https://qcloudimg.tencent-cloud.cn/image/document/154c94b0d45303503cad2e28c0035336.png)

  

您可在 **调用历史** 中进行如下操作：

单击 **查看参数** ：查看调用接口时输入的参数。

单击 **试调** ：使用 API Explorer 进行接口在线调用。

单击 **代码** ：展示 SDK 代码，且代码中包含接口输入的参数。

单击 **收藏** ：收藏该接口调用，以便后续直接发起调用。

单击 **复制** ：复制接口调用请求。

## 签名示例

本文以 [查询可用区列表](https://cloud.tencent.com/document/product/213/15707) 接口为例，使用 API Explorer 工具进行签名串生成：

1.获取个人密钥（SecretId、SecretKey），并填入对应位置。

2.（可选）填写签名所需参数，您可按需进行填写。若不填写，系统在生成签名串时会自动输入签名所需参数。

3.填写接口所属参数，可选择右侧功能区中的 **参数说明** 查看接口具体参数信息。

4.选择右侧功能区中的 **签名串生成** \> **生成签名** ，即可在响应区查看签名的详细步骤与结果。

## 使用数据模拟

### 查看 Mock 数据

您可在左侧产品及接口列表中选择需调用的 API，并选择右侧功能区中的 **数据模拟** 后，即可查看接口 Mock 数据。

### 管理自定义 Mock

您可根据实际需求创建自定义 Mock，步骤如下：

1.找到需调用的 API 接口，并选择右侧功能区中的 **数据模拟** 后，单击 **创建 Mock** 。

![](https://qcloudimg.tencent-cloud.cn/image/document/2a4295729ffd72fc053c999345967c72.png)

  

2.在 **创建 Mock** 页面，按需输入 Mock 信息。Mock 数据需为合法的 JSON 数据，例如：

```json
{ "Response": {     "InstanceIdSet": [         "xxx1",         "xxx2"     ],     "RequestId": "eac6b301-a322-493a-8e36-83b295459397" }}
```

3.单击 **提交** 即可完成创建。 单击 **查看 Mock 列表** ，可在 **Mock 详情** 页面查看已创建的 Mock 信息。若您需 **编辑** 或 **删除** Mock，请单击 Mock 所在行右侧的对应按钮进行操作。

### 使用 Mock

1.找到需调用的 API 接口，选择右侧功能区中的 **数据模拟** 。

2.选择需使用的 Mock，单击 **打开 Mock 地址** 。如下图所示：

![](https://qcloudimg.tencent-cloud.cn/image/document/93944607ac82045470c245a789d2f141.png)

  

3.在弹出窗口中获取 Mock 数据的 URL 地址，类似如下格式：

```bash
https://cvm.mock.tencentcloudapi.com/?tag=default&action=DescribeZones&version=2017-03-12
```

4.在代码中调用获取的 URL 地址，即可使用 Mock。以 Python 语言为例，示例代码如下：

## 相关问题

### 使用工具如何验证 API 签名

当您遇到如下报错信息时，可使用 API Explorer 工具进行验证：

```bash
[TencentCloudSDKException] code:AuthFailure.SecretIdNotFound message:The SecretId is not found, please ensure that your SecretId is correct. requestId:234a93fe-9024-488e-87a8-48e4f3c3548e
```

1.将参数填写在 API Explorer 工具中，Timestamp 等可变参数请与所需验证的签名（API 错误签名）使用的参数保持一致，并选择功能区的 **签名示例 > 生成签名** 。如下图所示：

![](https://qcloudimg.tencent-cloud.cn/image/document/11b1163c3f403ceab651d0f925cad0d3.png)

  

2.在响应区获得签名步骤及结果后，即可进行前后数据对比。

### 签名错误

如您在签名过程中出现错误，则可能收到以下签名失败的错误代码，请对应实际情况进行处理：

<table><colgroup><col width="50%"> <col width="50%"></colgroup><tbody><tr><td><p><span><span><span>错误代码</span></span></span></p></td><td><p><span><span><span>错误描述</span></span></span></p></td></tr><tr><td><p><span><span><span>AuthFailure.SignatureExpire</span></span></span></p></td><td><p><span><span><span>签名过期。</span></span></span></p></td></tr><tr><td><p><span><span><span>AuthFailure.SecretIdNotFound</span></span></span></p></td><td><p><span><span><span>密钥不存在。</span></span></span></p></td></tr><tr><td><p><span><span><span>AuthFailure.SignatureFailure</span></span></span></p></td><td><p><span><span><span>签名错误。</span></span></span></p></td></tr><tr><td><p><span><span><span>AuthFailure.TokenFailure</span></span></span></p></td><td><p><span><span><span>token 错误。</span></span></span></p></td></tr><tr><td><p><span><span><span>AuthFailure.InvalidSecretId</span></span></span></p></td><td><p><span><span><span>密钥非法（不是云 API 密钥类型）。</span></span></span></p></td></tr></tbody></table>

## 联系我们

若您在使用过程中发现问题，可通过选择功能区 **问题反馈** 进行反馈。

![](https://qcloudimg.tencent-cloud.cn/image/document/0e98d3be26a0383521149fde968b653a.png)