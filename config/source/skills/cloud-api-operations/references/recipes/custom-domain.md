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

这张表的用法：**云开发侧（`tcb` + `ssl`）能自己做完，域名侧三段（买、解析、备案）默认做不了** —— 账号级 device 登录拿到的身份没有域名 / 解析 / 备案策略。碰到 `UnauthorizedOperation` 时按 [calling-methods.md §3](../calling-methods.md) 给出该身份的一键授权链接补策略，或直接引导用户去控制台；**不要因为调不通就判定「这个域名不能用」**，云开发侧的绑定照旧能走。

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
| `accessType` | 默认 `DIRECT`（直连，普通场景就用这个）。`CDN` = 云开发 CDN 接入（存量，新版本不再支持）；`CUSTOM` = 用户自有 CDN / WAF |
| `customCname` | 仅 `accessType="CUSTOM"` 时必填，值来自 CDN / WAF 控制台分配的 CNAME。**它不是用户域名要解析到的那个 CNAME** |

`createRoute` / `bindCustomDomain` 创建前都会再跑一次 `VerifyHTTPServiceRoute`（探测 → 创建），失败时返回 `data.checks` 与同一份 TXT 指引。

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

### E. 域名侧三段：默认做不了，怎么指路

| 段 | 在哪里做 | 判据 |
| --- | --- | --- |
| **买域名** | 域名注册控制台 https://console.cloud.tencent.com/domain | 身份有 `domain` 策略才可 `domain/CheckDomain`（可注册性）、`domain/DescribeDomainPriceList`（价格）、`domain/CreateDomainBatch`（下单）；没有就引导用户买 |
| **实名认证** | 注册后按提示完成 | 必须做。没实名不能加解析、不能备案 |
| **加解析** | DNSPod 控制台 https://console.cloud.tencent.com/cns | 要加两条：归属校验用的 **TXT `_cloudbase-challenge`**，以及**接入成功后页面给出的 CNAME**（云开发接入的接入点是 `cdn.dnsv1.com`） |
| **备案** | 云开发平台「备案管理」 https://tcb.cloud.tencent.com/dev#/env/filing-manage 或腾讯云备案控制台 | **自定义域名必须已完成 ICP 备案**（官方硬要求）。所以通常是**先备案、再绑域名**；自查与等多久转 [Recipe 2](./icp-filing-readiness.md) |

顺序上有一条容易踩反：**先用 TXT 过归属校验，再用 CNAME 接流量**。CNAME 值要等域名关联完成（约 3-5 分钟）才由接口给出，提前猜一个填进去没用。

解析层还有一条硬规则：**同一主机记录、同一线路上，CNAME 与任何其他记录类型都冲突**。用户域名上已经有 A 记录时，要先删掉那条再配 CNAME，否则提示「记录有冲突」。

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 把 `*` 当成已有域名 | 环境没绑过域名，`listCustomDomains` 返回 `Domain: "*"`，被拿去 `createRoute` | `*` 是默认 HTTP 域名的占位。判断「有没有自定义域名」时排除它，但可以读它的 `Routes[]` |
| 以为预检通过 = 证书没问题 | `CertId` 传空，预检照样 `Passed: true` | `Cert` 项此时是 `SKIPPED`。证书单独看 `Cert`，绑定时显式传 `certificateId` |
| 在个人版套餐上开边缘加速 | 预检 `Quota` 报 `FAIL` `QUOTA_EXCEEDED`「当前套餐不支持边缘加速（EO）」 | 边缘加速需要**标准版及以上**套餐；个人版只能走「不开启边缘加速」的云开发接入 |
| 自己拼归属校验记录 | 记录名凭印象写，校验一直不过 | 记录名与值只从预检返回的 `OwnershipVerification.DnsVerification[]` 取（`_cloudbase-challenge` / `TXT` / `EnvId`） |
| 域名已被别的环境占用 | `DomainConflict` 报 `FAIL` `DOMAIN_IN_USE`（"already occupied by other environment"） | 先到占用方环境 `listCustomDomains` 确认，从那边解绑后再绑；同一域名不能同时接两个环境 |
| 以为是技术问题，其实是权限 | `domain` / `dnspod` / `ba` 一调就 `UnauthorizedOperation`（`qcs::domain::…:domainId/* has no permission`） | 不是域名不可用。这三段要么按 [calling-methods.md §3](../calling-methods.md) 给身份补策略，要么引导用户去控制台；云开发侧继续用 `tcb` + `ssl` |
| 在静态托管页找绑定入口 | 静态托管「自定义域名」区提示**已下线**，只能删不能加 | 新绑定统一走 HTTP 网关 `#/env/http-access`；静态托管页上的存量域名只支持「先删除再重绑」 |
| 把 `customCname` 当成解析目标 | `accessType="CUSTOM"` 时把 `customCname` 填成用户域名要解析到的地址 | `customCname` 是**回源 / 回填**地址（CDN / WAF 分配的那个 CNAME）；用户域名的 CNAME 解析在 DNS 侧配，两者不是一回事 |
| 想提前报出 CNAME 值 | 绑定刚提交就问「解析到哪」 | CNAME 值要等域名关联完成（约 3-5 分钟）由接口给出；预检阶段只会有归属校验的 TXT |

## 验证步骤

1. **序列 A**：`listCustomDomains` 能返回（排除 `*` 之后）真实的自定义域名清单；`listRoutes` 能列出该域名下的 `Path`。
2. **序列 B**：`VerifyHTTPServiceRoute` 返回九个检查项，且 `Cert` 与 `Ownership` **都不是 `SKIPPED`**（要验就得把 `CertId` 传实）。出现 `FAIL` 时按 `Code` 分流：`OWNERSHIP_VERIFY_FAILED` → 加 TXT；`CERT_VERIFY_FAILED` → 换证书；`DOMAIN_IN_USE` → 去占用方解绑；`QUOTA_EXCEEDED` → 看套餐。
3. **序列 C**：`bindCustomDomain` 成功后重跑一次 B —— 同一套输入应当全 `PASS`（归属已过、证书已确认）。
4. **序列 D**：轮询到该域名 `Status = SUCCESS` 且 `DNSStatus = OK`，`Cname` 非空。`FAIL` 时按 D 表的 `DNSStatus` 三态分流。
5. **端到端**：`nslookup <自定义域名>` 能解析到 `Cname` 给出的地址，浏览器打开该域名能看到目标服务内容 —— 官方文档给的自检命令就是 `nslookup`。
6. 全链路只有序列 C 是写操作，**提交前确认真实目标环境**；A / B / D 全是只读，可以放心反复跑。
