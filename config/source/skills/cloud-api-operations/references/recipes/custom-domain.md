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
| `CDNResource` | 云开发 CDN 资源状态 | `AccessType` 不是 `CDN` |
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
| `accessType` | 默认 `DIRECT`（云开发接入、不开启边缘加速，普通绑定就用这个）。`EO` = 云开发接入 + 边缘加速；`CUSTOM` = 用户自有 CDN / WAF（要传 `customCname`）；**`CDN` 是已下线的存量接入方式，不要用** —— 后果见下方 |
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

`Domain` 写成字符串（`"Domain": "www.example.com"`）不会报「参数缺失」，而是报 **`The parameter \`CertId\` is not recognized.`** —— 因为 `CertId` 被当成顶层参数去找了。看到这条错误先回来查嵌套层级，**不要**去改 `CertId` 的值。

实测返回（2026-09-24，域名 + 有效证书）：`{"OwnershipVerification": null, "RequestId": "…"}`。**`OwnershipVerification` 为 `null` 就表示归属权已过、不需要再补 TXT**；非空时给出的才是要补的记录。

**别拿 `CDN` 当接入方式试**（实测 2026-09-24）：`AccessType: "CDN"` 是**存量云开发 CDN**，官方已写明不再支持。用它提交不会报错、域名也会进清单，但**一直停在 `Status: PROCESSING`** —— 实测从创建到删除的整段时间都没走到 `SUCCESS`。普通绑定一律用 `DIRECT`；需要加速再上 `EO`（要标准版及以上套餐）。

### C2. 解绑（写）

`callCloudApi(service="tcb", action="DeleteHTTPServiceRoute")`，参数 `{ "EnvId": …, "Domain": "<域名>" }`。

**这个接口删域名和删路由是同一个**：`Paths` 留空 = 删域名及它的全部路由；`Paths` 非空 = 只删列出的那几条 path 路由。要**删域名**就别传 `Paths`。

两个容易踩空的地方：

- **不要用 `tcb/DeleteCustomDomain`。** 实测（2026-09-24）它不会报错、会返回 `{"Status": "", "RequestId": "…"}`，看着像成功，但域名**一直留在清单里**。MCP 侧 action 名叫 `deleteCustomDomain`（`manageGateway(action="deleteCustomDomain")`）是另一回事 —— 它底下调的就是 `DeleteHTTPServiceRoute`。
- **删除不是同步的，别拿「立刻复查还在」当失败。** 实测（2026-09-24）发出 `DeleteHTTPServiceRoute`、拿到 `RequestId` 后，紧接着重查域名仍在清单里（`Status: PROCESSING`），**约 5 分钟后才消失**（`DescribeHTTPServiceRoute` 的 `TotalCount` 归零）。这个域名是从 `PROCESSING` 状态删的，平台要等接入流程收尾才真正移除。所以：**发一次就够，隔几分钟复查一次**，不要连发、也不要改判成权限问题。

复查用哪只眼睛：`DescribeHTTPServiceRoute` 带 `Filters: [{Name: "Domain", Values: ["<域名>"]}]`，看 `TotalCount` 是否归零；或 `queryGateway(action="listCustomDomains")` 里该域名是否还在。

域名下还有 `Routes[]` 时，也可以先逐个删路由（`manageGateway(action="deleteRoute")`）再删域名，效果等同。

**已经有自定义域名时不要再 `bindCustomDomain`** —— 直接 `manageGateway(action="createRoute", domain=<已有域名>, …)` 挂路由，省掉证书这一步。

### D. 轮询到生效

`queryGateway(action="listCustomDomains")` 看 `Status`：

| `Status` | 含义 | 下一步 |
| --- | --- | --- |
| `PROCESSING` | 处理中 | 等。轮询间隔别比 30 秒更短 |
| `SUCCESS` | 已接入 | 看 `DNSStatus` 与 `Cname`，确认解析指对了 |
| `FAIL` | 接入失败 | 先看 `DNSStatus`：`OK` = 已命中目标 CNAME / `EMPTY` = 还没加解析 / `INVALID` = 解析到了别的地址 |
| `EO_PENDING_VERIFICATION` | 还要做**边缘加速**域名归属权校验 | 按页面指引再加一条 TXT。它与云开发首次域名归属校验**不通用** |

生效时间（官方口径，按接入方式分三档，报给用户时别报「马上好」）：

- 云开发接入、**不**开边缘加速：域名关联约 **3-5 分钟**，关联成功后页面才给出 CNAME 值
- 云开发接入、开边缘加速：归属权校验后的处理状态约 **10-20 分钟**
- 自定义接入（CDN / WAF）：加完 CNAME 后解析生效约 **5-30 分钟**

实测补充（2026-09-24，**已下线的 CDN 接入**，创建后立刻查询）：`Status` 是 `PROCESSING`，但 `Cname` 字段已经给出（`<域名>.cdn.dnsv1.com`）；同一时刻 `DNSStatus` 与 `PlatformCnameDNSStatus` 也已经是 `OK`。

这两条**不要外推到普通绑定**：官方口径是云开发接入（`DIRECT`）要等域名关联完成（约 3-5 分钟）才给出 CNAME 值。判断「接入是否完成」只看 `Status` —— `PROCESSING` 阶段那两个 DNS 字段就可能是 `OK`，它们回答的是「解析指对没有」，不是「接入做完没有」。

所以提交后**先读一次现状再回答用户**：`Cname` 有值就直接给，没有就按上面三档口径报等待时间。

### E. 域名侧三段：默认做不了，怎么指路

| 段 | 在哪里做 | AI 能否代做 | 判据 |
| --- | --- | --- | --- |
| **买域名** | 域名注册控制台 https://console.cloud.tencent.com/domain | **不给** —— 消费操作，不把下单权交给服务角色 | 要有 `domain` 策略才能调 `domain/CheckDomain`（可注册性）、`domain/DescribeDomainPriceList`（价格）、`domain/CreateDomainBatch`（下单）。这一段正确做法是引导用户自己买，别去补权限 |
| **实名认证** | 注册后按提示完成 | 不能 | 必须做。没实名不能加解析、不能备案 |
| **加解析** | DNSPod 控制台 https://console.cloud.tencent.com/cns | **可以** —— 补策略后由 AI 代写 | 要加两条：归属校验用的 **TXT `_cloudbase-challenge`**，以及**接入成功后接口 / 页面给出的 CNAME**。CNAME 值**只能从接口或页面取、不要自己拼格式** —— 实测同一个账号下两种接入方式给出的长得不一样：云开发接入是 `<域名>.tcbaccess.tencentcloudbase.com`，CDN 接入是 `<域名>.cdn.dnsv1.com`。补权限链接见「前置权限」 |
| **备案** | 云开发平台「备案管理」 https://tcb.cloud.tencent.com/dev#/env/filing-manage 或腾讯云备案控制台 | 不能 —— 备案不在 CAM 策略体系里 | **自定义域名必须已完成 ICP 备案**（官方硬要求）。所以通常是**先备案、再绑域名**；自查与等多久转 [Recipe 2](./icp-filing-readiness.md) |

**备案在链路的哪一步校验**（实测口径，回答用户「没备案能不能先绑」时用）：

- **预检不查备案。** `CDNResource` 这一项在域名还没接进来时返回的是 `PASS`，原话 `CDN resource not exist yet; ICP filing will be verified by CDN backend at create time` —— 备案是**创建时**由 CDN 后端校验的，预检的九项里看不到它。
- **创建那一刻也不拦。** 实测（2026-09-24）一个归属权与证书都通过的真实域名，`CreateHTTPServiceRoute` 返回成功、域名进清单，**没有返回任何备案相关的错误**。但**别把这句读成「备案没问题」**：同一个域名此后一直停在 `PROCESSING`、从没走到 `SUCCESS` —— 后端到底卡在哪一步（备案、CDN 资源、还是接入方式）从返回里看不出来。**没有备案结论时不要对用户下判断。**
- **边缘加速（EO）接入**有专门的错误码 `EO_DOMAIN_NOT_ICP`，会在预检的 `EO` 项或接入过程中报出来。个人版套餐连 `Quota` 都过不去（见踩坑清单），到不了这一步。

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
| 在个人版套餐上开边缘加速 | 预检 `Quota` 报 `FAIL` `QUOTA_EXCEEDED`「当前套餐不支持边缘加速（EO）」 | 边缘加速需要**标准版及以上**套餐；个人版只能走「不开启边缘加速」的云开发接入 |
| 自己拼归属校验记录 | 记录名凭印象写，校验一直不过 | 记录名与值只从预检返回的 `OwnershipVerification.DnsVerification[]` 取（`_cloudbase-challenge` / `TXT` / `EnvId`） |
| 域名已被别的环境占用 | `DomainConflict` 报 `FAIL` `DOMAIN_IN_USE`（"already occupied by other environment"） | 先到占用方环境 `listCustomDomains` 确认，从那边解绑后再绑；同一域名不能同时接两个环境 |
| 以为是技术问题，其实是权限 | `domain` / `dnspod` / `ba` 一调就 `UnauthorizedOperation`（`qcs::domain::…:domainId/* has no permission`） | 不是域名不可用。先用 `sts/GetCallerIdentity` 确认调用者是不是 `TCB_QcsRole`，是就按「前置权限」给解析的一键授权链接（只读优先）；买域名与备案引导去控制台。云开发侧继续用 `tcb` + `ssl` |
| 把一键授权链接当成万能兜底 | 用户（或子账号）点开链接也授不了，回头来问为什么没生效 | 授权页要主账号或具备 CAM 写权限的身份；给链接时同时说明用哪个账号点，必要时退回控制台手工加策略 |
| 在静态托管页找绑定入口 | 静态托管「自定义域名」区提示**已下线**，只能删不能加 | 新绑定统一走 HTTP 网关 `#/env/http-access`；静态托管页上的存量域名只支持「先删除再重绑」 |
| 把 `customCname` 当成解析目标 | `accessType="CUSTOM"` 时把 `customCname` 填成用户域名要解析到的地址 | `customCname` 是**回源 / 回填**地址（CDN / WAF 分配的那个 CNAME）；用户域名的 CNAME 解析在 DNS 侧配，两者不是一回事 |
| 想提前报出 CNAME 值 | 绑定刚提交就问「解析到哪」，于是按分钟数答「等 3-5 分钟」 | 先读一次现状再回答：`listCustomDomains` 里 `Cname` 有值就直接报，没有才按 D 节的分钟数口径说。**别把某一档的分钟数当成所有接入方式的规则** |
| 用 `DNSStatus` 判断接入完成 | 看到 `DNSStatus: OK` 就回「已接入」 | `PROCESSING` 阶段这两个 DNS 字段就已经是 `OK`。接入完成只看 `Status` |
| `Domain` 传成字符串 | 报 `The parameter \`CertId\` is not recognized.`，于是去换证书 | 是嵌套层级错了：`Domain` 是对象，`CertId` 在它里面。改层级，不要改证书 |
| 以为预检会告诉你备案没过 | 预检九项全 `PASS`，以为备案也没问题 | 预检**不查备案**。CDN 接入的备案校验在创建时由 CDN 后端做（`CDNResource` 项的原话），EO 接入才有 `EO_DOMAIN_NOT_ICP` 这个错误码 |
| 用 `DeleteCustomDomain` 解绑 | 不报错，返回 `{"Status": "", "RequestId": "…"}`，看着像成功，但域名始终留在 `listCustomDomains` 里 | 解绑接口是 `tcb/DeleteHTTPServiceRoute`，`Paths` 留空即删域名。MCP 的 `manageGateway(action="deleteCustomDomain")` 底下调的就是它 |
| 拿「立刻复查还在」当删除失败 | 发完 `DeleteHTTPServiceRoute`、`RequestId` 到手，马上重查域名还在（`Status: PROCESSING`），于是连发好几次删除 | 删除是**异步**的，实测约 5 分钟后才消失。**发一次就等**，隔几分钟用 `DescribeHTTPServiceRoute` 的 `TotalCount` 或 `listCustomDomains` 复查 |
| 用 `CDN` 接入方式 | 绑定不报错、域名进清单，但一直停在 `Status: PROCESSING`，走不到 `SUCCESS` | `CDN` 是**存量云开发 CDN，官方已不再支持**。普通绑定用 `DIRECT`；要加速用 `EO`（标准版及以上套餐）；自有 CDN/WAF 才用 `CUSTOM` + `customCname` |

## 验证步骤

1. **序列 A**：`listCustomDomains` 能返回（排除 `*` 之后）真实的自定义域名清单；`listRoutes` 能列出该域名下的 `Path`。
2. **序列 B**：`VerifyHTTPServiceRoute` 返回九个检查项，且 `Cert` 与 `Ownership` **都不是 `SKIPPED`**（要验就得把 `CertId` 传实）。出现 `FAIL` 时按 `Code` 分流：`OWNERSHIP_VERIFY_FAILED` → 加 TXT；`CERT_VERIFY_FAILED` → 换证书；`DOMAIN_IN_USE` → 去占用方解绑；`QUOTA_EXCEEDED` → 看套餐。
3. **序列 C**：`CreateHTTPServiceRoute` 返回 `RequestId`（`OwnershipVerification` 为 `null` 即无需补 TXT）；随后 `listCustomDomains` 里能看到该域名，`CertId` / `AccessType` / `Cname` 与提交值一致；再重跑一次 B，同一套输入应当全 `PASS`。
4. **序列 D**：轮询到该域名 `Status = SUCCESS`，`Cname` 非空。`DNSStatus` 在 `PROCESSING` 阶段就已是 `OK`，不能当判据；`FAIL` 时按 D 表的 `DNSStatus` 三态分流。
5. **端到端**：`nslookup <自定义域名>` 能解析到 `Cname` 给出的地址，浏览器打开该域名能看到目标服务内容 —— 官方文档给的自检命令就是 `nslookup`。
6. **序列 C2（收尾）**：验证完把测试用的域名删掉 —— `DeleteHTTPServiceRoute` 传 `{EnvId, Domain}`、不传 `Paths`，**隔几分钟**再用 `DescribeHTTPServiceRoute` 看 `TotalCount` 归零 / `listCustomDomains` 里该域名不在。拿到 `RequestId` 就立刻复查会看到域名还在，那是正常的异步延迟，**不要因此重发**（见 C2）。写操作只有序列 C / C2，**提交前确认真实目标环境**；A / B / D 全是只读，可以放心反复跑。
7. **权限判定**：调用报 `UnauthorizedOperation` 时，先 `sts/GetCallerIdentity` 确认调用者身份，再决定是给角色的一键授权链接（解析只读优先）还是让用户去控制台 —— 不要直接判定「域名不可用」。绑定本身只需要 `tcb` + `ssl`（已实测），缺权限的是 DNS 那一段。
