# 消息推送云函数/云托管模式兼容分析

> 2026-08-25 Booker 反馈：MCP 似乎没有考虑「推送模式」（云函数 vs 云托管），需分析开发平台代码看兼容问题。

## 结论速览

MCP `msg-push` 工具**确实没考虑云托管模式**：
1. 缺**模式读取**——`queryMessagePush list` 不返回 `qbase_open`，agent 不知道当前是哪种模式
2. 缺**正向模式管理**——只有 `ensureCloudFunctionMode`（反向关云托管），没有 `ensureContainerMode`（开云托管）
3. 缺**云托管配置管理**——`setContainerCallbackConfig` 在内部实现存在但**未作为 tool action 暴露**
4. **云托管模式下配云函数回调无效**——消息被整包接管，agent 操作 uploadAppConfig 不会报错但实际不生效（静默失败）

## 模式语义（weda-alternative 解读）

来源：`apps/wxide-tcb-console/src/legacy/components/settings/globalsettings/msgpush/{index,container}.tsx` + `legacy/extensible/callbackconfig.ts`

### 两种模式

| 模式 | 触发字段 | 行为 | 配置粒度 |
|---|---|---|---|
| **云函数**（默认） | `getContainerCallbackConfig.qbase_open === false/undefined` | 按 (msgType, Event) 二元组逐条配云函数回调；其他类型消息仍可走服务器域名 | 一元组一行 |
| **云托管** | `qbase_open === true` | **整包接收所有消息类型**到 `qbase_container_path` 指定的云托管服务；不再推云函数/服务器域名 | 单条 path 全收 |

### 数据结构（setContainerCallbackConfig body）

```ts
{
  qbase_open: boolean,              // true=云托管整包接收；false/undefined=云函数
  qbase_container_path: string,     // 云托管 URL（云托管模式必填）
  qbase_env: string,                // 推送到的云托管服务所在环境 ID
  text_mode: 1 | 2,                 // 1=json, 2=xml（消息正文编码）
}
```

### 关键代码位置

- `apps/wxide-tcb-console/src/legacy/components/settings/globalsettings/msgpush/index.tsx:14` `PUSH_TYPE = 'container' | 'cloudfunction'`
- `index.tsx:17-18` `determinePushType(callback)`：`callback?.qbase_open` → 'container' 否则 'cloudfunction'
- `index.tsx:45-63` Radio UI 切换 + 提示语（云托管开启后接管所有消息）
- `index.tsx:87-97` getContainerCallbackConfig / setContainerCallbackConfig 调用
- `container.tsx:33-49` UpsertContainerPushSettings 提交：`qbase_open: true, qbase_container_path, qbase_env, text_mode`
- `legacy/extensible/callbackconfig.ts:139-154` getContainerCallbackConfig / setContainerCallbackConfig 定义（CGI 包装）
- `triggersetting/container.tsx:144` 关云托管：`setContainerCallbackConfig({ ...data, qbase_open: false })`

## MCP 工具现状（CloudBase-MCP mcp/src/tools/msg-push.ts）

### 内部已实现

- `getContainerCallbackConfig`（410-415）→ qbase `getContainerCallbackConfig`
- `setContainerCallbackConfig`（430-435）→ qbase `setContainerCallbackConfig`
- `ensureCloudFunctionMode`（720-）→ 调 setContainerConfig({qbase_open: false})

### 工具 action 暴露（enum 654）

```ts
.action(z.enum(["subscribe", "unsubscribe", "setEnable", "ensureCloudFunctionMode"]))
```

### 缺口

| 缺口 | 现象 | 兼容风险 |
|---|---|---|
| `ensureContainerMode` 未暴露 | 无法通过 MCP 切到云托管；只能去 IDE 切 | 模式管理半盲 |
| `setContainerCallback` action 未暴露 | 无法通过 MCP 设置 qbase_container_path / env / text_mode | 云托管配置半盲 |
| list 不返回 `pushMode` / `qbase_open` | agent 不知道当前模式 | 操作可能无效（见下） |
| 工具 list 合并时未合并 `getContainerCallbackConfig` | 模式状态完全不可见 | 静默失败风险高 |

## 兼容问题（用户场景："选了云托管模式"）

### 场景 A：用户在云托管模式，用 MCP 配云函数订阅

1. 用户在 IDE 选了「云托管」模式（qbase_open=true），整包接收消息
2. agent / 用户调 `manageMessagePush(action=subscribe, msg_type=text, function_name=xxx)`
3. 工具内部走 `uploadAppConfig`（云函数 callbacks 数组），写入成功（version 递增）
4. **实际推送效果**：消息仍走云托管 URL，**新增的云函数订阅不生效**——callbacks 被云托管整包接管
5. **用户感知**：工具返回 success，agent 以为配好，实际消息没推到云函数

**结论：静默失败，无告警。**

### 场景 B：用户在云函数模式，云托管有遗留 qbase_open=true

- IDE 会显示 Radio「云托管」被选中；callbacks 数组存在但被忽略
- MCP 操作 callbacks 也不生效
- 用户困惑

### 场景 C：用户想从云函数切到云托管

- **当前**：`ensureCloudFunctionMode`（反向）→ 只能关云托管
- **缺**：正向 `ensureContainerMode`（开云托管 + 需 confirm + 提示「将接管所有消息，不再推云函数」）

### 场景 D：用户在云托管模式，调 list 验证配置

- `queryMessagePush(list)` 返回 callbacks 数组（可能为空或旧的）
- agent 无法识别「云托管模式下 callbacks 不生效」

## 改进建议（按优先级）

### P0（防静默失败，必须做）

1. **`queryMessagePush` list 返回增加 `pushMode: 'cloudfunction' | 'container'`**（合并 getContainerCallbackConfig.qbase_open 字段）
2. **manageMessagePush subscribe/unsubscribe/setEnable 加模式校验**：当前是云托管模式时拒绝 + 返回明确错误「当前是云托管模式（pushMode=container），云函数回调配置无效；请先调 ensureCloudFunctionMode 切回云函数模式」（需 confirm 写操作风格）
3. **tool description 补充模式说明**

### P1（模式管理能力补齐）

4. **新增 action `ensureContainerMode`**：切到云托管（qbase_open=true），需 confirm + 提示「切换后所有消息类型将整包推送到云托管服务，不再推云函数；请提供 qbase_container_path / env / text_mode」
5. **新增 action `setContainerCallback`**：单独设置/更新云托管容器回调（path/env/text_mode），类似 setEnable 风格
6. **可加 action `getContainerCallbackConfig`** 单独读（如果 agent 需要）
7. **list/ensureCloudFunctionMode 同步更新**：模式切换时 list 重新读取并返回

### P2（文档/降级）

8. **skill 文档**（message-push-customer-service.md）补充「云托管模式」章节：触发条件、配置步骤、注意事项
9. **降级提示**：云托管模式下若用户传云函数订阅请求，给出「下一步：是否切到云函数模式？」建议

## 验收（建议实现任务）

- mock 单测：云托管模式下 subscribe 返回明确错误（不回静默 success）
- mock 单测：ensureContainerMode 完整流程（confirm + setContainerCallback）
- 真实 E2E：azhi 环境验证（注意先备份 baseline，结束后快照还原）
- 文档：spec 描述两模式行为差异 + MCP 工具支持矩阵

## 关联

- d5735473（日志调研已完成）
- dc0eaaf9（消息推送工具，已合并 #949）
- weda-alternative: `legacy/components/settings/globalsettings/msgpush/`
- CloudBase-MCP: `mcp/src/tools/msg-push.ts`、`mcp/scripts/test-with-ticket.cjs`
- 微信 main MR !6821（已 force push + 命名修正）

## 交互设计（Booker 2026-08-25 确认，不新增 tool）

### 1. 云函数路径有效性校验（P0）

`subscribe` 前校验 `function_name` 在目标 env 真实存在（走 queryFunctions/list 或等价检查）；不存在 → 拒绝并提示「云函数 {fn} 不存在于环境 {envId}，请先创建或修正参数」。

### 2. 云托管模式提示 AI（P0）

**list 返回增强**：

```json
{
  "pushMode": "container",
  "containerConfig": { "qbase_container_path": "...", "qbase_env": "...", "text_mode": 1 },
  "callbacks": [ ... ],
  "version": 21,
  "note": "当前为云托管模式（整包接收），云函数 callbacks 存在但不生效；如需云函数模式请调 ensureCloudFunctionMode 切换"
}
```

**云托管模式下的云函数写操作**（subscribe/unsubscribe/setEnable）：拒绝 + 明确错误：
> 当前 pushMode=container（云托管整包接收），云函数回调配置存在但不生效。如需云函数模式请调 `action=ensureCloudFunctionMode` 切换。

### 3. 模式切换（已有 + 新增）

| action | 方向 | confirm 提示 |
|---|---|---|
| `ensureCloudFunctionMode`（已有） | 云托管 → 云函数 | 「切换后停止云托管整包接收（qbase_open=false），消息按云函数回调推送；若 callbacks 为空则收不到任何消息」 |
| `ensureContainerMode`（新增） | 云函数 → 云托管 | 「切换后所有消息类型整包推送到云托管服务（path={path}），云函数回调失效；需提供 qbase_container_path/qbase_env/text_mode」 |
| `setContainerCallback`（新增） | 更新云托管配置 | 写操作确认，展示新旧配置 diff |

### 4. description 补充

queryMessagePush/manageMessagePush 描述补充：两模式说明、pushMode 字段、云托管模式行为、切换 action 指引。
