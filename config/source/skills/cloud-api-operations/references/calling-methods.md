# Calling Methods — MCP callCloudApi / SDK / CAM authorization

## §1 MCP `callCloudApi`（会话内交互式操作）

```json
{
  "service": "cam",                // 腾讯云产品标识，任意产品可调，见下
  "action": "DescribeRoleList",    // 官方 Action 名，禁止猜测
  "version": "2019-01-16",         // 官方 API 版本；多数可省，多版本产品必传
  "region": "ap-shanghai",         // 可选，X-TC-Region；跨地域必传，禁止写进 params
  "params": { "Page": 1, "Rp": 50 }
}
```

- **service 是白名单枚举**：只接受白名单内的产品标识，名单外的取值（对象存储 COS 这类不在云 API 体系内的产品、以及任何拼写错误）会被直接拒绝 —— 不要臆造 service 名、也不要试近义词。与中文名不一致的常见项：云数据库 MySQL 是 `cdb`、日志服务是 `cls`、DNS 解析是 `dnspod`、SSL 证书是 `ssl`。**完整清单（按产品线分组）：[`./service-versions.md`](./service-versions.md)。**
- **version 多数可以省**：只有一个官方版本的产品会按映射表自动补齐（例如 `ssl` → `2019-12-05`）。**只有多版本产品必须显式传** —— `tke`、`mongodb`、`teo`、`vod`、`sms`、`monitor`：缺省会报错并列出可选版本，不会替你猜（猜错会被服务端报成 Action 不存在，很难排查）。
- **最常用的几个**：

  | service | version | 用途 |
  | --- | --- | --- |
  | `tcb` | `2018-06-08` | 云开发环境 / 用户 / 认证 / 函数 / 数据库 |
  | `tcbr` | `2022-02-17` | 云托管 |
  | `scf` | `2018-04-16` | 云函数 |
  | `sts` | `2018-08-13` | 临时密钥与调用者身份 |
  | `cam` | `2019-01-16` | 权限、角色、策略 |
  | `monitor` | `2018-07-24` | 云监控 / 告警策略（多版本） |
  | `postgres` | `2017-03-12` | PostgreSQL |
  | `ssl` | `2019-12-05` | SSL 证书 |
- **前置条件**：首次调用若返回 `ENV_REQUIRED`，先完成环境绑定（`auth` 工具 `set_env`）再重发；这不是云 API 错误，是工具自身的会话状态要求。
- **错误分类**（错误信息前缀决定下一步）：
  - `The parameter 'X' is not recognized` → Action 正确、参数名错；对照官方文档修正字段名/大小写
  - `action ... is invalid or not found` → Action 名未经文档来源确认就发起调用；回官方文档核对后用确认过的名字（实测案例：控制台代理的 `ListRoles` 在官方 CAM 2019-01-16 API 中不存在，真实 Action 为 `DescribeRoleList`）
  - `UnauthorizedOperation / AuthFailure` → CAM 权限不足；走 §3 授权升级
  - `Region is not recognized` → region 传到顶层参数，不放进 params

## §2 代码管控（用户侧脚本/服务）

1. **优先 `@cloudbase/manager-node`**：环境、存储、函数等常见操作有现成方法（https://docs.cloudbase.net/api-reference/manager/node/introduction）。
2. **其他产品走官方 SDK + TC3-HMAC-SHA256 签名**：公共头部 `X-TC-Action` / `X-TC-Version` / `X-TC-Timestamp` / `X-TC-Region`（涉及时）/ `Authorization`；密钥只参与签名，不进 body。SDK 语言细节路由到官方文档（https://cloud.tencent.com/document/api 及各产品 SDK 页）或 sdkHints，不在此复制。
3. 手写签名前先用 **API Explorer**（https://console.cloud.tencent.com/api/explorer）验证参数组合，再落代码。
4. **AI 快速取参数 schema：直接抓 SDK 源码**（腾讯云官方**没有**公开 OpenAPI/Swagger 规范下载，SDK 源码就是最权威的机器可读 schema）。不用管用户用哪种语言，按下面的固定规律**按图索骥**即可：
   - **托管三处，国内用户优先 CNB**：仓库命名 `tencentcloud-sdk-<lang>`（`-python` / `-go` / `-java` 等）。CNB 上挂在 `cnb.cool/tencent/cloud/api/sdk/` 路径下，raw 直链格式是 `/-/git/raw/master/`（不是 `/-/raw/`，用错会返回 404 HTML 但 HTTP 200，极易误判）；GitHub raw 是 `raw.githubusercontent.com/TencentCloud/<repo>/master/`；Gitee raw 是 `gitee.com/TencentCloud/<repo>/raw/master/`。
   - **目录规律**：除 Node.js 外都是 `tencentcloud/<service>/<version>/`；schema 文件就在该目录下（Python `models.py`、Go `models.go`、Java 同包 `<Action>Request.java`）。每个接口一个 `<Action>Request` / `<Action>Response` 定义，字段名、参数名（json tag / 注解）、类型、必填性、注释齐全；同目录的 client 文件（`<service>_client.py` / `client.go`）可确认该 service 的 Action 全集。
   - **Node.js 特例**：按服务 npm 分包 `tencentcloud-sdk-nodejs-<service>`，types `.d.ts` 就是 schema；源码在 `tencentcloud-sdk-nodejs` 仓库 `src/services/<service>/<version>/` 下。
   - **不确定语言或路径时**：先抓仓库根目录的文件列表（GitHub API `https://api.github.com/repos/TencentCloud/<repo>/contents/tencentcloud`）确认实际结构，不要凭猜构造 URL；各仓库根路径 `examples/` 有每接口调用示例。
   - 已实测锚点（Python 与 Go 结构完全同构）：
     `https://raw.githubusercontent.com/TencentCloud/tencentcloud-sdk-python/master/tencentcloud/monitor/v20180724/models.py` → `CreateAlarmPolicyRequest` 结构体直接可读。

## §3 权限：先认凭据身份，再给一键授权链接

### 3.1 权限来自谁

管控面调用「没权限」，先看是哪种凭据在调用 —— 三种身份的权限来源不同：

| 凭据身份 | 实际调用者 | 权限来自 | 不足时怎么补 |
| --- | --- | --- | --- |
| 账号级登录（device code / OAuth STS / 腾讯云密钥） | 登录的用户 / 子账号本人 | 该身份自身的 CAM 策略 | 由主账号给**这个子账号**追加策略（控制台操作） |
| 环境级 API Key | 服务端固定模型 | 单环境数据面 + 固定的 TCB 策略 | **没有为单个 Key 追加任意 CAM 策略的通道** —— 换账号级凭据，或走下面的角色路线 |
| CLI / MCP 用 TCB 服务角色换取的临时密钥 | 角色（`TCB_QcsRole` 等） | 挂在**角色**上的策略 | 给**角色**追加策略（一键授权链接） |

TCB 服务角色族挂的是 TCB 自己声明的策略集（`QcloudAccessForTCBRole` 等），跨产品能力覆盖到哪一步由这份策略决定；`TCBMonitor_QCSRole` 只覆盖 `monitor:GetMonitorData`（拉指标）。所以跨产品调用报 `UnauthorizedOperation` 是预期内的，不是配置出错 —— 先按上表确认你的凭据属于哪一行，再决定给谁补策略。

自己在哪一行，用 `auth(action="status")` 看 `credential_scope`：`account` = 账号级登录，`single_env` = 环境级 API Key。

**角色挂载的策略会随产品迭代变化**，别照着文档里的旧结论判断。要确认当前覆盖范围，直接读（cam service 已放行）：

1. `ListAttachedRolePolicies`：看角色挂了哪些策略
2. `GetPolicy(PolicyId=…)`：读该策略的 `PolicyDocument`，逐条看 `action` 数组里有没有你要的 Action

临时密钥用于代码侧调用：`auth(action="get_temp_credentials", confirm="yes", reveal=true)` 返回明文 STS 三元组，直接喂官方 SDK / TC3 手工签名，即 §2 代码管控路径。

### 3.2 一键授权链接（交给用户点一下）

```
https://console.cloud.tencent.com/cam/role/grant?roleName=<角色名>&policyName=<预设策略名>&principal=<URL 编码后的 base64>
```

`principal` 是角色载体的 base64：`base64('{"service":"<角色载体>"}')`，末位 `=` 写成 `%3D`。

| 角色 | 角色载体 | `principal` 参数值 |
| --- | --- | --- |
| `TCB_QcsRole` | `tcb.cloud.tencent.com` | `eyJzZXJ2aWNlIjoidGNiLmNsb3VkLnRlbmNlbnQuY29tIn0%3D` |
| `SCF_QcsRole` | `scf.qcloud.com` | `eyJzZXJ2aWNlIjoic2NmLnFjbG91ZC5jb20ifQ%3D%3D` |

不要硬编码角色名和载体 —— 两个都能现场读出来（cam service 已放行）：

1. `callCloudApi(service="cam", version="2019-01-16", action="GetRole", params={ "RoleName": "TCB_QcsRole" })`
2. `RoleInfo.PolicyDocument` 是该角色的**信任策略** JSON，`statement[].principal.service[]` 就是角色载体（`PolicyDocument` 是字符串，需再解析一层）
3. `RoleInfo.RoleId` 用于拼角色详情页 `https://console.cloud.tencent.com/cam/role/detail?roleId=<RoleId>` —— 挂**自定义**策略时走这个页面

一条链接挂一个策略；需要多个策略就分别给几条链接。链接是**一次性操作**，授权完成后重试原调用即可。

### 3.3 策略名怎么选

按「要做的事」对「要挂的策略」：

| 需要的能力 | 预设策略 |
| --- | --- |
| 云监控告警的读写（`CreateAlarmPolicy` / `BindingPolicyObject` / `UnBindingPolicyObject` / 通知模板 …） | `QcloudMonitorFullAccess` |
| 只读监控数据与告警配置（`GetMonitorData` / `DescribeAlarmPolicies` …） | `QcloudMonitorReadOnlyAccess` |
| SSL 证书的写（申请 / 续期 / 删除 / 部署到 CDN） | `QcloudSSLFullAccess` |
| 只读证书（`ssl:DescribeCertificates` / `DescribeCertificateDetail` / `CheckCertificateChain`） | `QcloudSSLReadOnlyAccess` |
| 通用 CDN 加速域名（`AddCdnDomain` / `DescribeDomains` / `UpdateDomainConfig` / `DeleteCdnDomain` …） | `QcloudCDNFullAccess` |
| 只读 CDN 加速域名 | `QcloudCDNReadOnlyAccess` |
| DNS 解析记录（DNSPod 的域名、记录增删改查） | `QcloudDNSPodFullAccess` |
| 只读 DNS 解析记录 | `QcloudDNSPodReadOnlyAccess` |
| 读 PostgreSQL 实例（`postgres:DescribeDBInstances` …） | `QcloudPostgreSQLReadOnlyAccess`（覆盖所有 `Describe*` / `Inquiry*`） |

两条容易踩的：

- `QcloudMonitorReadOnlyAccess` 对「告警策略」**只有访问权、没有操作权** —— 做告警的写操作挂它没用，要挂 `QcloudMonitorFullAccess`。
- 云开发自己的域名（静态托管 / 网关自定义域名的绑定解绑）**不需要额外策略**：它走 `tcb:*` 与 `cdn:Tcb*` 系列 Action，属于云开发自身能力。只有要操作**独立的 CDN 加速域名**时，才需要 `QcloudCDNFullAccess`。

要更小权限就自建自定义策略（把上面提到的 Action 写进策略语句），再把策略挂到角色上（走 3.2 的角色详情页）。

### 3.4 重试

授权是异步生效前的一步人工操作，授权完重试原调用。写操作重试遵循幂等模式：Create 前先 Describe 查重，避免重复创建。
