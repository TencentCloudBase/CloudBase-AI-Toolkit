# Recipe 4 — 自定义域名接入云开发

## When to use

要让用户的**自有域名**指向云开发上的服务（静态托管 / 云函数 / 云托管）时：

- 要把 `www.example.com` 接到自己的站点
- 已经绑过域名但访问不了，要定位卡在哪一步（归属权 / 证书 / 解析 / 备案）
- 环境还没有自定义域名，要先弄清「能不能绑、需要先做什么、绑完多久生效」

管到「域名在云开发侧接入成功、能访问」为止。

- 绑定 / 解绑 / 改域名的**工具选择**在 `../../../cloudbase-platform/SKILL.md` 的域名工具对照表
- 控制台的图形化步骤（带截图）在 https://docs.cloudbase.net/service/custom-domain
- **ICP 备案**的提交前自查与等待期查询转 [Recipe 2](./icp-filing-readiness.md)；买域名 / 实名 / 加解析在域名侧控制台，不在本 recipe 的接口序列里（原因见「前置权限」）

## 前置权限

| service | 用途 | 账号级身份 |
| --- | --- | --- |
| `tcb` | 自定义域名的预检 / 绑定 / 解绑 / 查状态 | 可用 |
| `ssl` | 按域名检索证书（绑定要 `CertId`） | 可用 |
| `domain` | 域名注册：查可注册性、价格、下单、信息模板 | **未授权**（`qcs::domain::uin/<uin>:domainId/* has no permission`） |
| `dnspod` | 解析记录的增删查 | **未授权** |
| `ba` | 备案订单 / 主体 / 域名状态 | **未授权** |

这张表的用法：**云开发侧（`tcb` + `ssl`）能自己做完；域名侧三段（买、解析、备案）默认做不了**。但「调不通」不等于「这个域名不能用」—— 云开发侧的绑定照旧能走。

实测确认这一点（2026-09-24）：账号级登录、只带 `tcb` + `ssl`，`tcb/CreateHTTPServiceRoute` **一次就绑上了**（域名 + 有效证书）。绑定这一步**不依赖** `domain` / `dnspod` / `ba` 里的任何一家。真正需要域名侧权限的只有两件事：

- 域名的**归属权校验记录还没加**（预检报 `OWNERSHIP_VERIFY_FAILED`）—— 这时要写一条 TXT，得有 `dnspod` 写权限，或让用户自己加
- 接入完成后要**把 CNAME 解析改过去** —— 同上

注意这两件都是**写**。**只读地看解析当前指哪里不需要 `dnspod`** —— 用 `dig` 问公开解析即可（见序列 E）。也就是说：**归属校验已经过了、解析也指对了的环境，AI 可以独立完成绑定和解绑**；缺的从来不是绑定的权限，是 DNS 的**写**权限。

缺权限时先认清是**谁**缺。实测（2026-09-24，账号级 device 登录）：`sts/GetCallerIdentity` 返回 `Type: CAMRole`、`UserId: <ownerUin>:TCB_QcsRole-<uin>-<ts>` —— 调用者是以 **`TCB_QcsRole`** 换来的临时密钥，缺的是挂在**这个角色**上的策略，而不是「用户没授权」。落点定了，补权限就有明确做法（链接拼法与使用边界见 [calling-methods.md §3.2](../calling-methods.md)）：

**加解析** —— 最高频的一段（代加归属校验的 TXT、或接入成功后代加 CNAME）：

- 只读（先看现状、判断解析配对没有）：
  `https://console.cloud.tencent.com/cam/role/grant?roleName=TCB_QcsRole&policyName=QcloudDNSPodReadOnlyAccess&principal=eyJzZXJ2aWNlIjpbInRjYi5jbG91ZC50ZW5jZW50LmNvbSJdfQ%3D%3D`
- 需要**代写**解析记录，把 `policyName` 换成 `QcloudDNSPodFullAccess`，其余不变
- 想让用户授权完跳回原页面，在末尾加 `&s_url=` + URL 编码后的当前地址

两条链接都是**账号下全部域名解析**的口子，给之前先跟用户讲清代价（见 §3.2 的第二条边界）。

**买域名 / 备案这两段故意不给链接**：

- 买域名是**消费操作**。给服务角色开下单权限，等于把花钱的能力交出去 —— 让用户自己在 https://console.cloud.tencent.com/domain 完成。
- 备案不在 CAM 策略体系里，没有「加一条策略就能调 API」的入口，只能走控制台或备案小程序。自查与等待期见 [Recipe 2](./icp-filing-readiness.md)。

给链接时一并说清**用哪个账号点**：授权页要主账号或具备 CAM 写权限的身份登录，子账号点开同样授不了 —— 别只丢一条 URL 就当交代完了。

## 接口序列

### A. 先看环境侧现状（只读）

| 步 | 工具 / Action | 关键参数 | 取什么 |
| --- | --- | --- | --- |
| 1 | `queryGateway(action="listCustomDomains")` | — | `domains[]` 的 `Domain` / `AccessType` / `CertId` / `Status` / `DNSStatus` / `Cname` / `IsDefault` / `Routes[]` |
| 2 | `queryGateway(action="listRoutes")` | `domain` 可选 | 该域名下已有的 `Path` 与 `UpstreamResourceType` / `UpstreamResourceName` |

环境还没有自定义域名时，步骤 1 只会回一条 `Domain: "*"`。它代表**默认 HTTP 域名**（`*.{region}.app.tcloudbase.com`），里面挂着"没指定域名"创建的那些路由 —— 判断「有没有自定义域名」时把它排除，但它的 `Routes[]` 是有效信息，别当成空。

### A2. 两套同形接口，按维度选

域名相关的 action 都有「环境维度」和「平台维度」两份，形状几乎一样：

| 维度 | action 前缀 | 关键参数 | 什么时候用 |
| --- | --- | --- | --- |
| 环境 | `*HTTPServiceRoute`（`Create` / `Verify` / `Describe` / `Modify` / `Delete`） | `EnvId` | 给某个云开发环境绑域名 —— **本 recipe 讲的是这套** |
| 平台 | `*PlatformHTTPServiceRoute`（同名五个） | `PlatformId`（如 `pf-t960szfwv1cs`） | 平台统管的域名池 |

平台版有两点不同：**请求地域要按平台选的地域传**（不能跟随 `envId`，否则不符合平台维度语义）；暂时没有域名级自定义 Headers（控制台的「Headers 设置」入口据此隐藏）。别把两套的参数混着传 —— 后果是报参数缺失，很难一眼看出是维度选错了。

### B. 绑定前先跑只读预检

`callCloudApi(service="tcb", action="VerifyHTTPServiceRoute")`：**只读预检，不创建任何资源**。

```json
{
  "EnvId": "<envId>",
  "Domain": {
    "Domain": "www.example.com",
    "CertId": "<ssl 里该域名的证书 ID>",
    "AccessType": "DIRECT",
    "Protocol": "HTTP_AND_HTTPS",
    "Enable": true
  }
}
```

返回九个检查项，每项 `Status`（`PASS` / `FAIL` / `SKIPPED`），失败时带 `Code` / `Message`；`Passed` 是总开关。

| 检查项 | 判定什么 | 什么时候 `SKIPPED` |
| --- | --- | --- |
| `Ownership` | 域名归属权 | — |
| `Cert` | 证书是否存在、是否可用 | `CertId` 传空 |
| `DomainConflict` | 域名是否已被**其他环境**占用 | — |
| `Quota` | 域名 / 路径配额（含套餐能力） | — |
| `RouteConflict` | 同域名下路径是否被占 | 请求里没带 `Routes` |
| `Blacklist` | 域名是否在黑名单 | — |
| `InternalAccount` | 内部域名与当前账号是否匹配 | 不是内部域名 |
| `CDNResource` | 云开发 CDN 资源状态。域名还没接进来时返回 `PASS` + 一句「备案由 CDN 后端在创建时校验」的说明（原话见 E 节） | 未实测 |
| `EO` | 边缘加速域名归属权 | `AccessType` 不是 `EO` |

失败项里 `Code` 的完整取值（照这张表分流，不用逐个试）：

`OWNERSHIP_VERIFY_FAILED` · `OWNERSHIP_DNS_LOOKUP_FAILED` · `CERT_VERIFY_FAILED` · `QUOTA_EXCEEDED` · `ROUTE_CONFLICT` · `DOMAIN_IN_USE` · `NON_INTERNAL_ACCOUNT` · `DOMAIN_IN_BLACKLIST` · `CDN_RESOURCE_PROCESSING` · `CDN_RESOURCE_OFFLINE` · `EO_OWNERSHIP_VERIFY_FAILED` · `EO_DOMAIN_NOT_ICP` · `EO_DOMAIN_IN_USE` · `INTERNAL_CHECK_ERROR`

预检之外，改 / 删域名与路由时另外几个会撞上的错误码：`OperationDenied.HTTPServiceDomainProcessing`（域名处理中，稍后再试）· `LimitExceeded.HTTPServiceRoute`（路由数超上限）· `OperationDenied.HTTPServiceDomainEOFrozen`（EO 域名被冻结，要先充正资源点）· `InvalidParameter.CertVerifyFailed`。

同一环境、四种真实输入下的结果：

| 输入 | `Cert` | `Ownership` | `DomainConflict` | `Passed` |
| --- | --- | --- | --- | --- |
| 自己的域名 + 本域有效证书 | `PASS` | `PASS` | `PASS` | `true` |
| 自己的域名 + `CertId: ""` | `SKIPPED` | `PASS` | `PASS` | `true` |
| 自己的域名 + 不存在的证书 ID | `FAIL` `CERT_VERIFY_FAILED`「证书ID不存在」 | `PASS` | `PASS` | `false` |
| 别人的域名 | `PASS` | `FAIL` `OWNERSHIP_VERIFY_FAILED` | `FAIL` `DOMAIN_IN_USE` | `false` |

两件比记枚举更有用的事：

- **`Passed: true` 不代表证书配好了。** `CertId` 传空时 `Cert` 是 `SKIPPED`，整体照样 `Passed`。要判断证书就得单独看 `Cert` 这一项。
- **归属权没过时不用去别处找记录值。** 失败返回里直接带 `OwnershipVerification.DnsVerification[]`：`Subdomain: "_cloudbase-challenge"`、`RecordType: "TXT"`、`RecordValue: "<EnvId>"`。照抄给用户去 DNS 服务商加，**不要改记录名、不要自己猜**；加完重跑预检。

### C. 正式绑定（写）

`manageGateway(action="bindCustomDomain")`：

| 参数 | 说明 |
| --- | --- |
| `domain` | 必填。普通域名；控制台也接受 `*.example.com` 这种通配写法 |
| `certificateId` | 建议显式传（先在 B 里确认真实证书 ID）。不传时按域名调 `ssl/DescribeCertificates(SearchKey=<domain>)`：单张自动选用、**没有则报错**、多张返回选择指引 —— MCP 侧没有交互，多张时得自己决定 |
| `accessType` | 默认 `DIRECT`（云开发接入、不开启边缘加速，普通绑定就用这个）。`EO` = 云开发接入 + 边缘加速；`CUSTOM` = 用户自有 CDN / WAF（要传 `customCname`）；`CDN` = 云开发 CDN（**存量接入方式，官方已不再支持**，只给了存量迁移路径）—— 新建不要用，后果见下方 |
| `customCname` | 仅 `accessType="CUSTOM"` 时必填，值来自 CDN / WAF 控制台分配的 CNAME。**它不是用户域名要解析到的那个 CNAME** |

`createRoute` / `bindCustomDomain` 创建前都会再跑一次 `VerifyHTTPServiceRoute`（探测 → 创建），失败时返回 `data.checks` 与同一份 TXT 指引。

直接走云 API 时对应 `tcb/CreateHTTPServiceRoute`，**`Domain` 必须传对象**：

```json
{
  "EnvId": "<envId>",
  "Domain": {
    "Domain": "www.example.com",
    "AccessType": "DIRECT",
    "CertId": "<证书 ID>"
  }
}
```

`Domain` 写成字符串（`"Domain": "www.example.com"`）不会报「参数缺失」，而是报 **`The parameter \`CertId\` is not recognized.`**（实测 2026-09-24）—— 报的字段是 `CertId`，但错的是 `Domain` 的层级。看到这条先回去把 `Domain` 改成对象，**不要**去动 `CertId` 的值。

实测返回（2026-09-24，域名 + 有效证书）：`{"OwnershipVerification": null, "RequestId": "…"}`。**`OwnershipVerification` 为 `null` 就表示归属权已过、不需要再补 TXT**；非空时给出的才是要补的记录。

**别拿 `CDN` 当接入方式新建**（实测 2026-09-24）：`AccessType: "CDN"` 是**存量云开发 CDN**，官方文档原话是「原『云开发 CDN』接入方式已不再支持」，只给出存量迁移到边缘加速的路径。注意**控制台的下拉里仍然保留着这一项** —— 接入方式选项一共四个：默认接入（`DIRECT`）/ 自定义接入（`CUSTOM`）/ 云开发 CDN 接入（`CDN`）/ 云开发 EdgeOne 接入（`EO`），默认值是 `DIRECT`。所以别以为「下拉里能选到就没问题」。用它提交不会报错、域名也会进清单，但**一直停在 `Status: PROCESSING`** —— 实测从创建到删除的整段时间都没走到 `SUCCESS`。普通绑定一律用 `DIRECT`；需要加速再上 `EO`。上 `EO` 前先确认两道前置，官方文档对这两条是写在「前置准备」里的硬要求：**套餐为「标准版及以上」**，且环境处于**资源点计费模式** —— 边缘加速本身就是按资源点计费的，当前不是资源点模式时要先到控制台「套餐用量」页**转换计费模式**，转完才能开。

### C2. 解绑（写）

`callCloudApi(service="tcb", action="DeleteHTTPServiceRoute")`，参数 `{ "EnvId": …, "Domain": "<域名>" }`。

**这个接口删域名和删路由是同一个**：`Paths` 留空 = 删域名及它的全部路由；`Paths` 非空 = 只删列出的那几条 path 路由。要**删域名**就别传 `Paths`。

两个容易踩空的地方：

- **不要用 `tcb/DeleteCustomDomain`。** 实测（2026-09-24）它不会报错、会返回 `{"Status": "", "RequestId": "…"}`，看着像成功，但域名**一直留在清单里**。MCP 侧 action 名叫 `deleteCustomDomain`（`manageGateway(action="deleteCustomDomain")`）是另一回事 —— 它底下调的就是 `DeleteHTTPServiceRoute`。（`DeleteCustomDomain` 在控制台的域名页里一次都没出现，控制台只发 `DeleteHTTPServiceRoute`。）
- **删除是异步的，别拿「立刻复查还在」当失败。** 控制台自己给的提示语就是「**操作成功，域名删除中！**」，删完只做一次列表刷新、把状态交给轮询。实测（2026-09-24）发出 `DeleteHTTPServiceRoute`、拿到 `RequestId` 后紧接着重查，域名仍在清单里（`Status: PROCESSING`），要过一段时间才从 `DescribeHTTPServiceRoute` 的 `TotalCount` 里消失。**发一次就够**，隔几分钟复查一次，不要连发、也不要改判成权限问题。
- **别在 `PROCESSING` 期间删，删不动。** 平台对处理中的域名有一层保护 —— `ModifyHTTPServiceRoute` 专门有 `OperationDenied.HTTPServiceDomainProcessing`「操作失败，http访问服务域名处理中，稍后再试」，删除同理：域名还在 `PROCESSING` 时发删除，请求正常返回 `RequestId`、`UpdateTime` 也会动，但域名不出清单，**不是权限问题**。先 `listCustomDomains` 等 `Status` 离开 `PROCESSING`（控制台对该状态的口径是「约 10-20 分钟生效」），再删。

复查用哪只眼睛：`DescribeHTTPServiceRoute` 带 `Filters: [{Name: "Domain", Values: ["<域名>"]}]`，看 `TotalCount` 是否归零；或 `queryGateway(action="listCustomDomains")` 里该域名是否还在。

**云 API 允许带路由一起删**（`Paths` 留空就是这个语义），所以裸调 `DeleteHTTPServiceRoute` **不要求**先清路由。但 **MCP 的 `deleteCustomDomain` 会多一道坎**：它底层是 SDK 的 `cloudbase.env.deleteCustomDomain`，实现里先查该域名的 `Routes[]`，非空直接抛错 ——

```
Domain X has N route binding(s) (/a, /b). Please delete the routes before deleting the domain.
```

也就是说：走 MCP 工具时得先 `manageGateway(action="deleteRoute")` 逐个删路由、再删域名；走裸云 API 可以一次删掉域名和它的全部路由。（MCP 把这个错转成了带 `nextActions` 的提示，照它给的 `listRoutes` → `deleteRoute` 顺序做即可。）

**已经有自定义域名、只是要挂路由时，不要再走 `bindCustomDomain`** —— 直接用 `manageGateway(action="createRoute", domain=<已有域名>, …)`。控制台就是这个做法：它的「绑定自定义域名」弹窗对**新域名和已有域名用的是同一个** `tcb/CreateHTTPServiceRoute`，要带路由就在 `Domain.Routes[]` 里一起传，不存在「先绑域名、再加路由」两个接口。MCP 的 `bindCustomDomain` 会额外跑一遍证书解析（`ssl/DescribeCertificates`），对已经有域名的场景是多余且可能失败的一步。

### D. 轮询到生效

`queryGateway(action="listCustomDomains")` 看 `Status`：

| `Status` | 含义 | 下一步 |
| --- | --- | --- |
| `PROCESSING` | 处理中（控制台对这个状态的标注是「约 10-20 分钟生效」） | 等。控制台自己按 3 秒一轮轮询，AI 侧不必这么密，隔几十秒看一次足够 |
| `SUCCESS` | 已接入 | 看 `DNSStatus` 与 `Cname`，确认解析指对了 |
| `FAIL` | 接入失败 | 先看 `DNSStatus`：`OK` = 已命中目标 CNAME / `EMPTY` = 还没加解析 / `INVALID` = 解析到了别的地址 |
| `EO_PENDING_VERIFICATION` | 还要做**边缘加速**域名归属权校验 | 按页面指引再加一条 TXT。它与云开发首次域名归属校验**不通用** |

生效时间（官方口径，按接入方式分三档，报给用户时别报「马上好」）：

- 云开发接入、**不**开边缘加速：域名关联约 **3-5 分钟**，关联成功后页面才给出 CNAME 值
- 云开发接入、开边缘加速：归属权校验后的处理状态约 **10-20 分钟**
- 自定义接入（CDN / WAF）：加完 CNAME 后解析生效约 **5-30 分钟**

实测补充（2026-09-24，**已下线的 CDN 接入**，创建后立刻查询）：`Status` 是 `PROCESSING`，但 `Cname` 字段已经给出（`<域名>.cdn.dnsv1.com`）；同一时刻 `DNSStatus` 与 `PlatformCnameDNSStatus` 也已经是 `OK`。

这两条**不要外推到普通绑定**：官方口径是云开发接入（`DIRECT`）要等域名关联完成（约 3-5 分钟）才给出 CNAME 值。

判断「接入是否完成」只看 `Status`。那两个 DNS 字段**测的是另一件事** —— 控制台给的定义原文是：

| 字段 | 取值 | 含义（原文） |
| --- | --- | --- |
| `DNSStatus` | `OK` / `EMPTY` / `INVALID` | `OK` = 解析正常，命中目标 CNAME；`EMPTY` = 解析为空，域名尚未配置 CNAME 或未生效；`INVALID` = 解析异常，解析到其他非目标地址 |
| `PlatformCnameDNSStatus` | `OK` / `EMPTY` / `INVALID` | 是否 CNAME 到平台任一网关入口（默认接入 / CDN / EO，不含 `CustomCname`） |

所以它们不但不能当完成判据，还可能**因为域名过去的解析残留而显示 `OK`** —— 实测（2026-09-24）那个测试域名在接入之前就已经 CNAME 到云开发网关，删除接入记录后解析依然在，`DNSStatus` 于是一直是 `OK`，跟本次接入没有任何关系。（控制台文档里这两个字段用的是小驼峰 `DNSStatus` / `platformCnameDNSStatus`，云 API 返回是 `DNSStatus` / `PlatformCnameDNSStatus`，同一组。）

时长上别只记一个数：控制台把 `PROCESSING` 直接标成「**处理中（约 10-20 分钟生效）**」，并按 **3 秒一轮**轮询等它流转完；文档里的「3-5 分钟」指的是云开发接入（`DIRECT`）的**域名关联**环节。两者不是同一段，报给用户时以接口返回的 `Status` 为准，别报「马上好」。

所以提交后**先读一次现状再回答用户**：`Cname` 有值就直接给，没有就按上面三档口径报等待时间。

### E. 域名侧三段：默认做不了，怎么指路

| 段 | 在哪里做 | AI 能否代做 | 判据 |
| --- | --- | --- | --- |
| **买域名** | 域名注册控制台 https://console.cloud.tencent.com/domain | **不给** —— 消费操作，不把下单权交给服务角色 | 要有 `domain` 策略才能调 `domain/CheckDomain`（可注册性）、`domain/DescribeDomainPriceList`（价格）、`domain/CreateDomainBatch`（下单）。这一段正确做法是引导用户自己买，别去补权限 |
| **实名认证** | 注册后按提示完成 | 不能 | 必须做。没实名不能加解析、不能备案 |
| **加解析** | DNSPod 控制台 https://console.cloud.tencent.com/cns | **可以** —— 补策略后由 AI 代写 | 要加两条：归属校验用的 **TXT `_cloudbase-challenge`**，以及**接入成功后接口 / 页面给出的 CNAME**。CNAME 值**只能从接口或页面取、不要自己拼格式** —— 实测同一个账号下两种接入方式给出的长得不一样：云开发接入是 `<域名>.tcbaccess.tencentcloudbase.com`，CDN 接入是 `<域名>.cdn.dnsv1.com`。补权限链接见「前置权限」 |
| **备案** | 云开发平台「备案管理」 https://tcb.cloud.tencent.com/dev#/env/filing-manage 或腾讯云备案控制台 | 不能 —— 备案不在 CAM 策略体系里 | **自定义域名必须已完成 ICP 备案**（官方硬要求）。所以通常是**先备案、再绑域名**；自查与等多久转 [Recipe 2](./icp-filing-readiness.md) |

**备案在链路的哪一步校验**（实测口径，回答用户「没备案能不能先绑」时用）：

- **预检不会因为备案没过而 `FAIL` 拦住你。** `CDNResource` 这一项在域名还没接进来时返回的是 `PASS`，原话 `CDN resource not exist yet; ICP filing will be verified by CDN backend at create time` —— 平台自己说备案是**创建时**由 CDN 后端校验的。别把这句读成「预检不看备案」：检查项返回里的 `Message` 字段（`SKIPPED` 时给跳过原因），文档举的例子就是「**域名尚未备案**」，所以备案更可能以「跳过 + 一句说明」的形态出现，而不是拦。
- **但官方对使用者的要求是硬的。** 文档「使用限制」原话「**自定义域名必须已完成 ICP 备案**」；控制台在大陆地域的绑定弹窗也会先列一条「在绑定自定义域名时，需要先办理网站备案」。
- **创建那一刻也不拦。** 实测（2026-09-24）一个归属权与证书都通过的真实域名，`CreateHTTPServiceRoute` 返回成功、域名进清单，**没有返回任何备案相关的错误**。但**别把这句读成「备案没问题」**：同一个域名此后一直停在 `PROCESSING`、从没走到 `SUCCESS` —— 后端到底卡在哪一步（备案、CDN 资源、还是接入方式）从返回里看不出来。**没有备案结论时不要对用户下判断。**
- **边缘加速（EO）接入**有专门的错误码 `EO_DOMAIN_NOT_ICP`，会在预检的 `EO` 项或接入过程中报出来。而 `EO` 这条路径本身还有套餐门槛（标准版及以上 + 资源点计费模式，见踩坑清单），个人版连 `Quota` 那关都过不去，到不了这一步。

要确认域名到底备案没有，只能去备案控制台 https://console.cloud.tencent.com/beian 或备案小程序查 —— `ba` 未授权，AI 侧查不了；自查口径见 [Recipe 2](./icp-filing-readiness.md)。

给用户的结论只能是：**备案没过不代表绑不上，但一定不代表能正常访问**。不要在没确认备案状态时对用户说「绑好了就能用」。

顺序上有一条容易踩反：**先用 TXT 过归属校验，再用 CNAME 接流量**。CNAME 值要等域名关联完成（约 3-5 分钟）才由接口给出，提前猜一个填进去没用。

解析层还有一条硬规则：**同一主机记录、同一线路上，CNAME 与任何其他记录类型都冲突**。用户域名上已经有 A 记录时，要先删掉那条再配 CNAME，否则提示「记录有冲突」。

**只读地判断「解析指对没有」不需要 `dnspod`**：`dig +short <域名> CNAME`（或 `nslookup <域名>`）问公开解析就行，实测（2026-09-24）就是这样确认一个域名此前已经指到了云开发网关。这类现状判断 AI 自己做得了，要 DNS 权限的只是「改」。

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 把 `*` 当成已有域名 | 环境没绑过域名，`listCustomDomains` 返回 `Domain: "*"`，被拿去 `createRoute` | `*` 是默认 HTTP 域名的占位。判断「有没有自定义域名」时排除它，但可以读它的 `Routes[]` |
| 以为预检通过 = 证书没问题 | `CertId` 传空，预检照样 `Passed: true` | `Cert` 项此时是 `SKIPPED`。证书单独看 `Cert`，绑定时显式传 `certificateId` |
| 在个人版套餐上开边缘加速 | 预检 `Quota` 报 `FAIL`，`Code` 为 `QUOTA_EXCEEDED` | 官方「前置准备」原话是**「边缘加速需要标准版及以上套餐」**，另外还要求环境**处于资源点计费模式**（否则先去控制台「套餐用量」页转换）。个人版只能走「不开启边缘加速」的云开发接入。注意 `Quota` 项的 `Code` 与「域名 / 路径数量超配额」共用，别只按 quota 数量去理解 |
| 自己拼归属校验记录 | 记录名凭印象写，校验一直不过 | 记录名与值只从预检返回的 `OwnershipVerification.DnsVerification[]` 取（`_cloudbase-challenge` / `TXT` / `EnvId`） |
| 域名已被别的环境占用 | `DomainConflict` 报 `FAIL` `DOMAIN_IN_USE`（"already occupied by other environment"） | 先到占用方环境 `listCustomDomains` 确认，从那边解绑后再绑；同一域名不能同时接两个环境 |
| 以为是技术问题，其实是权限 | `domain` / `dnspod` / `ba` 一调就 `UnauthorizedOperation`（`qcs::domain::…:domainId/* has no permission`） | 不是域名不可用。先用 `sts/GetCallerIdentity` 确认调用者是不是 `TCB_QcsRole`，是就按「前置权限」给解析的一键授权链接（只读优先）；买域名与备案引导去控制台。云开发侧继续用 `tcb` + `ssl` |
| 把一键授权链接当成万能兜底 | 用户（或子账号）点开链接也授不了，回头来问为什么没生效 | 授权页要主账号或具备 CAM 写权限的身份；给链接时同时说明用哪个账号点，必要时退回控制台手工加策略 |
| 在静态托管页找绑定入口 | 静态托管「自定义域名」区提示**已下线**，只能删不能加 | 新绑定统一走 HTTP 网关 `#/env/http-access`；静态托管页上的存量域名只支持「先删除再重绑」 |
| 把 `customCname` 当成解析目标 | `accessType="CUSTOM"` 时把 `customCname` 填成用户域名要解析到的地址 | `customCname` 是**回源 / 回填**地址（CDN / WAF 分配的那个 CNAME）；用户域名的 CNAME 解析在 DNS 侧配，两者不是一回事 |
| 想提前报出 CNAME 值 | 绑定刚提交就问「解析到哪」，于是按分钟数答「等 3-5 分钟」 | 先读一次现状再回答：`listCustomDomains` 里 `Cname` 有值就直接报，没有才按 D 节的分钟数口径说。**别把某一档的分钟数当成所有接入方式的规则** |
| 用 `DNSStatus` 判断接入完成 | 看到 `DNSStatus: OK` 就回「已接入」 | 这两个 DNS 字段测的是**解析现状**（`OK` = 解析正常、命中目标 CNAME），不是接入进度，还可能因为域名旧解析残留而显示 `OK`。接入完成只看 `Status` |
| `Domain` 传成字符串 | 报 `The parameter \`CertId\` is not recognized.`，于是去换证书 | 是嵌套层级错了：`Domain` 是对象，`CertId` 在它里面。改层级，不要改证书 |
| 以为预检会告诉你备案没过 | 预检九项全 `PASS`，以为备案也没问题 | 预检**不会因备案 `FAIL`**（`CDNResource` 项自述备案由 CDN 后端在创建时校验），但官方硬要求「自定义域名必须已完成 ICP 备案」。EO 接入才有 `EO_DOMAIN_NOT_ICP` 这个错误码 |
| 以为解绑也得先清路由 | 走 MCP `deleteCustomDomain` 时域名下还有路由，报 `has N route binding(s) … Please delete the routes before deleting the domain`，于是判断「必须逐个删路由再删域名」 | 那是 **SDK 自己**加的门槛，不是云 API 的要求。`DeleteHTTPServiceRoute` 的 `Paths` 留空本来就是「删域名及所有路由」。走 MCP 工具时按提示先 `deleteRoute`；裸调云 API 可以一次删干净 |
| 把环境维度和平台维度搞混 | 拿 `PlatformId` 去调 `CreateHTTPServiceRoute`（或反之），报参数缺失 | 两套同形接口：`*HTTPServiceRoute` 传 `EnvId`、`*PlatformHTTPServiceRoute` 传 `PlatformId`（如 `pf-t960szfwv1cs`）。给云开发环境绑域名用前者；平台统管域名用后者，且请求地域要按平台选的地域传、不能跟随 envId |
| 用 `DeleteCustomDomain` 解绑 | 不报错，返回 `{"Status": "", "RequestId": "…"}`，看着像成功，但域名始终留在 `listCustomDomains` 里 | 解绑接口是 `tcb/DeleteHTTPServiceRoute`，`Paths` 留空即删域名。MCP 的 `manageGateway(action="deleteCustomDomain")` 底下调的就是它 |
| 拿「立刻复查还在」当删除失败 | 发完 `DeleteHTTPServiceRoute`、`RequestId` 到手，马上重查域名还在（`Status: PROCESSING`），于是连发好几次删除 | 删除是**异步**的（控制台提示语就是「操作成功，域名删除中！」），而且**域名还在 `PROCESSING` 时删不动**（平台对处理中域名有保护，`ModifyHTTPServiceRoute` 有专门的 `OperationDenied.HTTPServiceDomainProcessing`）。等 `Status` 流转完再删，发一次就够 |
| 用 `CDN` 接入方式新建 | 绑定不报错、域名进清单，但一直停在 `Status: PROCESSING`，走不到 `SUCCESS` | `CDN` 是**存量云开发 CDN**，官方文档「原『云开发 CDN』接入方式已不再支持」；控制台下拉里仍保留这一项，别被它误导。普通绑定用 `DIRECT`；要加速用 `EO`（需标准版及以上套餐 + 资源点计费模式）；自有 CDN/WAF 才用 `CUSTOM` + `customCname` |

## 验证步骤

1. **序列 A**：`listCustomDomains` 能返回（排除 `*` 之后）真实的自定义域名清单；`listRoutes` 能列出该域名下的 `Path`。
2. **序列 B**：`VerifyHTTPServiceRoute` 返回九个检查项，且 `Cert` 与 `Ownership` **都不是 `SKIPPED`**（要验就得把 `CertId` 传实）。出现 `FAIL` 时按 `Code` 分流：`OWNERSHIP_VERIFY_FAILED` → 加 TXT；`CERT_VERIFY_FAILED` → 换证书；`DOMAIN_IN_USE` → 去占用方解绑；`QUOTA_EXCEEDED` → 看套餐。
3. **序列 C**：`CreateHTTPServiceRoute` 返回 `RequestId`（`OwnershipVerification` 为 `null` 即无需补 TXT）；随后 `listCustomDomains` 里能看到该域名，`CertId` / `AccessType` / `Cname` 与提交值一致；再重跑一次 B，同一套输入应当全 `PASS`。
4. **序列 D**：轮询到该域名 `Status = SUCCESS`，`Cname` 非空。`DNSStatus` 在 `PROCESSING` 阶段就已是 `OK`，不能当判据；`FAIL` 时按 D 表的 `DNSStatus` 三态分流。
5. **端到端**：`nslookup <自定义域名>` 能解析到 `Cname` 给出的地址，浏览器打开该域名能看到目标服务内容 —— 官方文档给的自检命令就是 `nslookup`。
6. **序列 C2（收尾）**：验证完把测试用的域名删掉 —— 先确认该域名的 `Status` 不是 `PROCESSING`（处理中删不动），再 `DeleteHTTPServiceRoute` 传 `{EnvId, Domain}`、不传 `Paths`；然后**隔几分钟**用 `DescribeHTTPServiceRoute` 看 `TotalCount` 归零、或 `listCustomDomains` 里该域名不在。拿到 `RequestId` 就立刻复查会看到域名还在，那是正常的异步延迟（控制台自己的提示语就是「操作成功，域名删除中！」），**不要因此重发**（见 C2）。写操作只有序列 C / C2，**提交前确认真实目标环境**；A / B / D 全是只读，可以放心反复跑。
7. **权限判定**：调用报 `UnauthorizedOperation` 时，先 `sts/GetCallerIdentity` 确认调用者身份，再决定是给角色的一键授权链接（解析只读优先）还是让用户去控制台 —— 不要直接判定「域名不可用」。绑定本身只需要 `tcb` + `ssl`（已实测），缺权限的是 DNS 那一段。
