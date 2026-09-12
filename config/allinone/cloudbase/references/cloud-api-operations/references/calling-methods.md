# Calling Methods — MCP callCloudApi / SDK / CAM authorization

## §1 MCP `callCloudApi`（会话内交互式操作）

```json
{
  "service": "cam",                // 白名单内服务，见下
  "action": "DescribeRoleList",    // 官方 Action 名，禁止猜测
  "version": "2019-01-16",         // 官方 API 版本；未知 service 必须显式传
  "region": "ap-shanghai",         // 可选，X-TC-Region；跨地域必传，禁止写进 params
  "params": { "Page": 1, "Rp": 50 }
}
```

- **Service 白名单**（随版本演进，以工具 schema 为准）：`tcb / tcbr / scf / sts / cam / lowcode / cdn / vpc / monitor / postgres`（2.34.0 起新增 monitor、postgres）。monitor/postgres 无内置默认 version，**必须显式传**：monitor `2018-07-24`、postgres `2017-03-12`。若当前部署版本 schema 枚举不含目标 service，说明版本较旧，取 `auth get_temp_credentials` 临时密钥走 §2 SDK 路径。
- **前置条件**：首次调用若返回 `ENV_REQUIRED`，先完成环境绑定（`auth` 工具 `set_env`）再重发；这不是云 API 错误，是工具自身的会话状态要求。
- **常用 version**：tcb `2018-06-08`、scf `2018-04-16`、sts `2018-04-16`、cam `2019-01-16`、tcbr `2022-02-17`（必传）、monitor `2018-07-24`、postgres `2017-03-12`。
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
   - 已实测锚点（Python 与 Go 结构完全同构，2026-09-08）：
     `https://raw.githubusercontent.com/TencentCloud/tencentcloud-sdk-python/master/tencentcloud/monitor/v20180724/models.py` → `CreateAlarmPolicyRequest` 结构体直接可读。

## §3 CAM 权限不足 → 拼授权链接（实测可用，2026-09-08）

权限模型要点（同日实测）：

- 账号级登录（device code / OAuth STS）：以登录的子账号/角色身份调用管控面，权限取决于该身份的 CAM 策略。**用户自己登录的子账号可能有完整 monitor 权限**（2026-09-08 二次实测：某子账号直调 monitor 告警全链路零障碍）——权限错误发生时才走授权升级，不要预先假定。
- API Key 环境级：服务端固定权限模型，面向单环境数据面，没有为单个 Key 追加任意 CAM 策略的通道。
- TCB **服务角色族**默认**无告警管理权限**（以 TCB_QcsRole 身份调用时）：`TCB_QcsRole` 无 monitor 策略；`TCBMonitor_QCSRole` 仅 `monitor:GetMonitorData`。
- 临时密钥获取：`auth(action="get_temp_credentials", confirm="yes", reveal=true)` 返回明文 STS 三元组，可直接用于官方 SDK / TC3 手工签名（即 §2 代码管控路径），适用于 callCloudApi 白名单未放行目标 service 时的真实操作。

**授权链接拼装流程**（cam service 已放行，全程可程序化）：

1. 查角色 RoleId（按 RoleName 定位，跨账号 RoleId 不同）：
   `callCloudApi(service="cam", version="2019-01-16", action="GetRole", params={ "RoleName": "TCB_QcsRole" })`
   → `RoleInfo.RoleId`
2. 拼 CAM 角色详情页链接（实测 URL 格式）：
   `https://console.cloud.tencent.com/cam/role/detail?roleId=<RoleId>`
3. 把链接和需要挂载的策略名一起给用户，例如追加 `QcloudMonitorReadOnlyAccess`（只读）或自定义告警策略集（`monitor:CreateAlarmPolicy` / `DescribeAlarmPolicies` / `BindingPolicyObject` 等），说明这是**一次性操作**，授权完成后重试原调用。
4. 重试时遵循幂等模式：Create 前先 Describe 查重，避免重复创建。
