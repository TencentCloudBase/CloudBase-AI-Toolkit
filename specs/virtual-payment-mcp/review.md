# 评审说明：开发前需确认的决策点

面向产品 / starkewang / 微信 IDE / CloudBase MCP 维护者。本阶段无实现代码。

> **已裁定（Booker 2026-08-20，两轮）：** ① 消息推送工具**通用化**——不限于虚拟支付，`event_types` 支持任意合法事件，xpay 7 事件为缺省默认集合；② 云调用绑定**完全归属微信云开发后端开发**——**微信 IDE MCP 与 CloudBase MCP 均不提供云调用工具**（`queryCloudCall`/`manageCloudCall` 已移除）；③ 虚拟支付商户展示**归属控制台（weda-alternative）团队**——**微信 IDE MCP 与 CloudBase MCP 均不提供商户查询工具**（`queryVirtualPaymentConfig` 已移除）；④ 工具命名**对齐 `cloud_*` 体系**：CloudBase MCP 内部 `queryMessagePush`/`manageMessagePush`，微信侧暴露 `cloud_msg_push_query` / `cloud_msg_push_manage`；⑤ **实现源修正（Booker 2026-08-20）**：消息推送工具在 **CloudBase-MCP 仓库单端实现**，随包发版，**main 升级 `@cloudbase/cloudbase-mcp` 版本消费**（验证无 break change），再提 PR 给微信侧参考；测试用 `mcp/scripts/test-with-ticket.cjs`（微信 IDE ticket），telemetry 保持开启。以下决策点基于此裁定。

## 决策点清单

### D1. Tool 粒度（已定：命名对齐 cloud_*）

**已定（Booker 2026-08-20）：** 微信侧工具 = `cloud_msg_push_query`（读）+ `cloud_msg_push_manage`（写，action 枚举），命名对齐 `EMcpToolName`（`cloud_db_read_struct` 等）与 `EXPOSED_TOOL_NAME` 映射协作方式。每个事件一个 tool 的方案已拒绝（工具膨胀）。

**仍待确认：** `cloud_msg_push_manage` 的 action 枚举（subscribe/unsubscribe/setEnable/ensureCloudFunctionMode）是否够用。

### D2. 推送类型覆盖（通用化，已裁定方向）

**已定：** 工具为**通用消息推送**，`event_types` 接受任意合法事件（由 `listSupportedEvents` 提供全量约束），非 `z.enum(xpay)` 收窄。

**仍待确认：**

- 缺省默认集合 = **7 个 xpay 事件**（产品默认场景）是否 OK
- 是否需要防误订机制（如 agent 想订客服消息时先确认）——避免把非支付事件误绑到支付云函数
- 若官方有更多 event 名，请补清单供 `listSupportedEvents` 全量返回

### D3. 消息推送写模型

**提案（默认）：** 复用全量 `uploadappconfig` + version 乐观锁，MCP 客户端做 batch/幂等。

**备选：** 新做增量 add/remove CGI（更清晰，但要排期）。

**工程参考（Booker 2026-08-20 补充，建议作为实现语义依据）：**

1. **语义对齐 RFC 7232（HTTP 条件请求）**：`version` 即 ETag、`uploadappconfig` 即全量 PUT + `If-Match`。冲突 = 412 Precondition Failed → 客户端重读 → merge → 重试（需定义重试上限与退避）。控制台实测：保存前必先 `getappconfig` 拿全量 + version，内存 merge 后再全量覆盖（`newcallbackconfig/index.tsx` `foundDuplicate`/`foundSameMsgEntry` 逻辑），version 不匹配即失败——MCP 必须复刻该「先读再 merge」纪律，禁止用本地空列表直接覆盖（会冲掉线上其他配置）。
2. **幂等对齐 kubectl apply（声明式）**：`manage_msg_push` 的 `event_types` 是**声明式期望集合**而非增量动作——重复执行收敛到同一状态（同 `(msgType,event)` 只保留一个，其他条目保留）。对应 K8s `resourceVersion` 乐观锁 + client-side 三方合并的成熟范式。

**请确认：** 是否允许 MCP 直接复用现网 CGI（微信 IDE 登录态）；是否采纳上述 RFC 7232 / kubectl apply 语义作为实现约束。

### D4. 云调用写路径（完全归属后端开发，已裁定）

**已定（Booker 2026-08-20）：** **微信 IDE MCP 与 CloudBase MCP 均不提供云调用工具**（`queryCloudCall`/`manageCloudCall` 已从设计移除）；云调用绑定归属**微信云开发后端开发**，由后端团队自行开发接口（`setfuncconfig` 或等价）与降级路径（`config.json` + 上传），MCP 不封装。

### D5. 接口权限边界

**硬边界：**

- 允许：控制台已使用的 `servicewechat.com/wxa-dev-qbase/*`
- 禁止：未在控制台出现的 mp 公众平台管理接口、未文档化 path
- CloudBase MCP 禁止在无 TCB 代理时直连 qbase

**请确认：** TCB 代理 API 是否立项及 ETA（决定需求 5 同期还是二期）。

### D6. 虚拟支付商户查询 availability

**现状：** 无 offerId 查询面；普通商户 API 不可复用。

**已定（Booker 2026-08-20）：** 商户展示归属**控制台（weda-alternative）团队**，**微信 IDE MCP 与 CloudBase MCP 均不提供查询工具**（`queryVirtualPaymentConfig` 已从设计移除）。

**请确认（控制台团队）：** 查询 CGI/字段 owner、ETA；未就绪时 UI 是否接受 blocked 空态上线。

### D7. UI 形态（控制台团队）

**提案：** 微信支付 Card 内增加「虚拟支付」子区域（不必强行合并表格）。

**请确认：** tab vs 子区域（weda-alternative 团队定）。

### D8. Skill 归属

**提案：** 新建 `miniprogram-virtual-payment` skill，与 `cloudbase-wechat-integration`（普通微信支付）分流。

**备选：** 仅在 `miniprogram-development` 下加 reference。

**请确认：** 选新建 skill 还是挂 reference。

## 给 starkewang 的摘要

1. **微信 IDE MCP 核心交付 = 消息推送配置**（`cloud_msg_push_query` / `cloud_msg_push_manage`，通用工具）。7 个虚拟支付回调事件可由现有消息推送 overwrite 模型一次覆盖；xpay 7 事件为默认集合，动态 constraints 可覆盖更多非支付事件，但产品默认应锁 xpay 避免误绑。
2. 最大缺口不是「能不能配消息推送」，而是：**云函数 OpenAPI 写接口（setfuncconfig）**与**米大师应用查询接口**；以及 CloudBase MCP 所需的 **TCB 身份可调代理**。
3. 现有 get/overwrite CGI + version 已足够支撑幂等批量订阅，增量 API 为体验优化非必须。
4. **云调用绑定归属后端开发**：微信 IDE MCP 与 CloudBase MCP 均不提供云调用工具（`queryCloudCall`/`manageCloudCall` 已移除）——请服务端确认 `setfuncconfig` 排期（供后端自用/其他接入方）。
5. **虚拟支付商户展示归属控制台（weda-alternative）团队**，微信 IDE MCP 与 CloudBase MCP 均不做；商户查询工具（`queryVirtualPaymentConfig`）已从设计移除。

## 旧任务

任务说明要求 Reject `404ee717-30b1-49b7-9da4-5b188e56fc4c` 与 `ec6a15f8-0acf-4bcb-abcd-f146f60251a6`。AI 无法经 API 自 Reject，需人工在 ATO 仪表盘 Reject。
