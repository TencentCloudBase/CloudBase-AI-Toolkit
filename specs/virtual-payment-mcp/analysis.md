# 代码分析：消息推送 / 云调用绑定 / 微信支付展示

分析日期：2026-08-20。范围：只读分析，无产品代码改动。

分析源：

- `weda-alternative/apps/wxide-tcb-console`（云开发控制台嵌入微信 IDE）
- `main/src/js/core/mcp/tools/cloudbase-tools.ts`（微信侧 CloudBase MCP 暴露层）
- `CloudBase-MCP/config/source/skills/miniprogram-development/references/wxide-vs-cloudbase-mcp.md`

---

## 1. 消息推送操作面

### 1.1 入口与模式

`settings/globalsettings/msgpush/index.tsx`：

- 两种推送模式：**云函数** / **云托管**，由 `getcontainercallbackconfig.qbase_open` 决定
- 切换云函数：`setcontainercallbackconfig({ ..., qbase_open: false })`
- 切换云托管：路径已存在则打开 `qbase_open`，否则弹配置框
- 互斥：云托管开启后，消息不再进云函数；云函数模式下，未配置的类型仍可走公众平台服务器域名

`switchmessagepushing_deprecated/`：**当前仓库不存在**，大开关已并入 `uploadappconfig.config.enable` 与云托管 `qbase_open`。

`triggersetting/` 是**事件触发器**（计费环境才展示，文档指向 EveTrigger），与「消息推送回调」不是同一配置面。虚拟支付回调走 msgpush，不走 triggersetting。

### 1.2 云函数消息推送 CRUD

| 操作 | UI | 客户端逻辑 | 后端 |
| --- | --- | --- | --- |
| 查询列表 | `cloudfunction.tsx` SWR | `getCallbackConfig()` | `POST wxa-dev-qbase/getappconfig` `{ type: 1 }` |
| 合法事件枚举 | 添加弹窗 constraints | `getCallbackConfigConstraints()` | `POST wxa-dev-qbase/route/getcallbacksupportlist` |
| 新增 | `newcallbackconfig/` | 先 GET 全量，再 merge 后 overwrite | `POST wxa-dev-qbase/uploadappconfig` |
| 启用/停用 | 行内按钮 | 改单条 `enable` 后 overwrite | 同上 |
| 删除 | `delcallbackconfig/` | 按 `(msgType, event, env, functionName)` filter 后 overwrite | 同上 |

配置结构（`doc.md` / `callbackconfig.ts`）：

```json
{
  "type": 1,
  "version": 7,
  "config": "{\"enable\":true,\"callbacks\":[{\"msgType\":\"event\",\"event\":\"user_enter_tempsession\",\"env\":\"<envId>\",\"functionName\":\"callback\",\"enable\":true}]}"
}
```

无配置时 `base_resp.ret === 80209`，客户端当作 `{ version: 0, enable: false, list: [] }`。

### 1.3 幂等与互斥（控制台已实现，MCP 必须复用）

`newcallbackconfig/index.tsx` `handleConfirm`：

1. 同一 `(msgType, event)` **只能推到一个云函数**；已有不同 env/function 的同事件条目会被删掉再写新条目
2. 若已存在完全相同的 `(msgType, event, env, functionName)`，视为重复，**不再 POST**
3. overwrite 必须带当前 `version`（乐观锁）

删除时若本地条目已不在最新列表，提示 stale，要求刷新。

### 1.4 云托管消息推送

- GET `getcontainercallbackconfig`：`qbase_env` / `qbase_container_path` / `text_mode`(1=JSON,2=XML) / `qbase_open`
- POST `setcontainercallbackconfig`
- 虚拟支付方案默认走**云函数**（需求 3.1 输入 `function_name`）。云托管可作为后续扩展，不作为 v1 默认订阅目标。

### 1.5 调用链与鉴权边界

```
UI → callbackconfig.ts commonInvokeCallbackConfigCgi
  → ideRequest({ url: https://servicewechat.com/wxa-dev-qbase/... })
  → 微信开发者工具登录态（小程序 AppID session）
  → qbase CGI，base_resp.ret === 0
```

硬约束：`window.env.transact !== 'wechatide'` 直接抛 `unsupported transact type`。

**这不是腾讯云 Cloud API，也不是微信公众平台 mp 后台开放接口。** 它是微信「小程序云开发 / qbase」管理 CGI。

| 允许 MCP 封装 | 禁止猜测/越权 |
| --- | --- |
| 上表 `wxa-dev-qbase/*`（控制台已用） | `mp.weixin.qq.com` 公众平台管理端未在控制台出现的接口 |
| 后续 starkewang 文档化的 TCB 代理 Action | 未出现的 CGI path、未出现的 query 参数 |

`getcallbacksupportlist` 的 `flag`（1 公众号 / 2 小程序 / 3 两者）在控制台调用里**未传**（空 body），服务端默认 3。MCP 若要限定小程序事件，应显式 `flag: 2`（需 starkewang 确认默认行为）。

---

## 2. 云调用绑定

### 2.1 云函数 OpenAPI 白名单（虚拟支付主路径）

`functionconfig.ts`：

- 只读：`POST wxa-dev-qbase/getfuncconfig` `{ func_name, env }` → `api_whitelist[]`、`triggers[]`
- `ret === 80209` 或 `-1`：空权限
- UI：`functioninfoflyover`「云调用权限」只展示，**没有保存按钮**

写入现状：控制台未提供独立 set CGI。业界惯例是云函数目录 `config.json`：

```json
{
  "permissions": {
    "openapi": ["/xpay/query_order"]
  }
}
```

随 `cloud_fn_deploy` / 开发者工具上传同步。`dev-platform` 文案也写：配置了云调用权限后需在微信开发者工具同步上传。

**对 MCP 的含义：** 需求 3.2「查询+批量绑定/解绑且幂等」若要做到不redeploy，**依赖 starkewang 补 setfuncconfig（或等价）写接口**。在接口就绪前，IDE MCP 可降级为：改本地 `config.json` + 提示调用已有 `cloud_fn_deploy`（须在评审中确认是否接受）。

### 2.2 云托管令牌白名单（非虚拟支付默认路径）

`callbackconfig.ts` + `privilege/containertoken.tsx`：

- `POST wxa-dev-qbase/usecloudaccesstoken`
  - get：`{ action: "get", env }` → `open`, `api_whitelist`, `version`
  - set：`{ action: "set", open, api_whitelist, env, version }`
- 这是环境级 CloudRun access_token 权限，placeholder `/wxa/openapi`，与函数 `api_whitelist` 不同层

v1 虚拟支付绑定应对齐 **云函数 OpenAPI**，不要误写成云托管令牌。

### 2.3 服务端 API 枚举（需求输入，22 个）

订单 `/xpay/query_order` `/xpay/refund_order`  
代币 `/xpay/query_user_balance` `/xpay/currency_pay` `/xpay/cancel_currency_pay` `/xpay/present_currency`  
发货 `/xpay/notify_provide_goods`  
道具 `/xpay/start_upload_goods` `/xpay/query_upload_goods` `/xpay/start_publish_goods` `/xpay/query_publish_goods`  
账单 `/xpay/start_download_order` `/xpay/query_download_order` `/xpay/download_bill` `/xpay/download_ios_settlement_bill`  
资金 `/xpay/create_withdraw_order` `/xpay/query_withdraw_order` `/xpay/query_biz_balance`  
投诉 `/xpay/get_complaint_list` `/xpay/response_complaint` `/xpay/complete_complaint` `/xpay/upload_vp_file`

schema 用 `z.enum` 约束上述路径。微信开放平台若增删 path，以官方文档 + constraints 接口为准，enum 同步升级。

---

## 3. 微信支付配置区 vs 虚拟支付商户

`globalsettings/index.tsx` + `wechatpay.ts`：

| CGI | 用途 |
| --- | --- |
| `route/getmchbyappid` | AppID 下可关联普通商户号 |
| `route/getapplywxpaylist` | 已申请绑定列表 |
| `route/getauthstate` | 绑定 / JSAPI / 退款授权状态 |
| `route/openauth` `openjsapi` `openrefund` | 发起授权（一天一次） |

展示字段：商户号、名称、绑定状态、JSAPI、退款 API。全部是**普通微信支付商户**。

英文文案 `k_1kqz7pd`：Adding non-ordinary merchant accounts such as virtual payment is not currently supported.

**结论：** 无米大师 `offerId`、签约状态、订阅签约、iOS 虚拟支付状态的查询面。3.4 需要：

1. 新 qbase/微信侧查询 CGI（或文档化已有未接入接口）—— **starkewang / 微信支付团队**
2. 控制台 UI：微信支付卡片增加「虚拟支付」子区域（weda-alternative）—— **微信 IDE MCP 不提供商户查询工具**，仅 CloudBase MCP 可选对齐

禁止在分析阶段发明公众平台商户后台 URL。

---

## 4. 微信 IDE MCP 工具风格（`cloudbase-tools.ts`）

现有 CloudBase 暴露方式：

- 内部复用 `@cloudbase/cloudbase-mcp` 的 `createCloudBaseMcpServer({ ide: 'wxide', cloudBaseOptions: { envId, requestFn } })`
- `requestFn` = `createWxIDERequestFn` → **腾讯云 tcb Cloud API**，不是 qbase CGI
- 插件白名单目前只有 `database-nosql` + `storage`
- 对外名：snake_case，`EMcpToolName`，**≤30 字符**（`cloud_db_read_struct` 等）
- 必填 `appid`；`env` 映射到内部 `envId`
- 写操作走 `runWithUserConfirmation`
- `inputSchema` passthrough，真正校验靠 Nightly `tools.yaml` / `--help`
- **不要复制 wechatide schema**；新 qbase 工具应是 wechatide **原生 tool**，而不是硬塞进当前 CloudBase wrap 层

`cloudbase-cli-tools.ts` 已有 `cloud_env_list` / `cloud_fn_list` / `cloud_fn_deploy`，虚拟支付接入流程应复用它们部署回调函数。

---

## 5. 对「十几个推送场景」的覆盖判断（给 starkewang）

| 集合 | 数量 | MCP 能否覆盖 |
| --- | --- | --- |
| 需求列出的虚拟支付事件 | **7** | 能。默认 `event_types` 省略即订阅这 7 个；全是 `msgType=event` |
| 控制台「添加消息推送」下拉 | `getcallbacksupportlist` 动态列表（远大于 7，含会话、扫码等非支付事件） | 能，若 `event_types` 允许任意 constraints 内字符串；**默认不要全订** |
| 未文档化的额外 `xpay_*` | 未知 | 查询 constraints 可见则能订；enum 需发版扩展 |
| 云托管整包推送 | 1 条路径收全部类型 | v1 不作为虚拟支付默认；能力上 CGI 已存在 |

**结论：** 虚拟支付文档中的回调事件（7 类）可被同一套「查询 + 全量 overwrite」MCP 覆盖。若业务口中的「十几个」包含非 xpay 消息类型，同一工具也能订，但产品默认应限制在 xpay 七类，避免 agent 把客服消息、扫码等一并绑到支付云函数。

---

## 6. CloudBase MCP 对齐缺口

`mcp/src/server.ts` 的 `DEFAULT_PLUGINS` / `AVAILABLE_PLUGINS` **没有**消息推送或云调用绑定工具。`requestFn` 模式只打 tcb Cloud API。

要对齐，必须先有下列之一：

1. TCB/qbase 团队提供可 TC3 调用的 Describe/Modify CallbackConfig、FunctionOpenAPI、VirtualPaymentMerchant
2. 或微信 IDE 把 qbase CGI 通过已有 IDE 通道暴露，CloudBase MCP **不**重复实现（推荐默认路径）

在 (1) 未就绪时，把 CloudBase MCP 工具标为 **blocked / 返回明确错误 + nextActions 指向 wechatide 工具**。
