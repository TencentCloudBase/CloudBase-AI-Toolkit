# 实施计划：消息推送配置 MCP（通用）+ 虚拟支付配套

> 本任务（43367cc6）只完成分析与 spec。下列开发任务**待评审通过后另开任务执行**。  
> **开发时使用 worktree 隔离**（每仓独立 worktree；CloudBase-MCP 建议 `.worktrees/virtual-payment-impl`，分支 `feat/virtual-payment-mcp`）。  
> 合并使用 **merge**，不用 rebase。
> 分工裁定（Booker 2026-08-20）：消息推送工具通用化（xpay 为默认场景）；云调用绑定归属服务端链路（微信 IDE v1 只读，写入归 CloudBase MCP）。

## 前置（本任务）

- [x] 0.1 代码分析 → `analysis.md`
- [x] 0.2 阶段计划 → `PLAN.md`
- [x] 0.3 需求 → `requirements.md`
- [x] 0.4 设计 → `design.md`
- [x] 0.5 评审点 → `review.md`

## 阶段 A — 接口确认（starkewang / 协作方）

- [ ] A.1 书面确认消息推送可复用 `getappconfig` / `uploadappconfig` / `getcallbacksupportlist`（微信 IDE 登录态）
  - 确认 `flag` 默认值与小程序场景
  - _需求: 4
  - **开发时使用 worktree 隔离：** N/A（文档/工单）

- [ ] A.2 确认云函数 OpenAPI 写接口（setfuncconfig 或等价）或书面接受 `config.json`+deploy 降级（**服务端链路**，CloudBase MCP 侧）
  - _需求: 2, 4, 5
  - **开发时使用 worktree 隔离：** N/A

- [ ] A.3 确认虚拟支付商户查询接口字段（offerId、名称、签约、订阅、iOS）
  - _需求: 3, 4
  - **开发时使用 worktree 隔离：** N/A

- [ ] A.4 确认是否建设 TCB Cloud API 代理（决定 CloudBase MCP 是否同期开工）
  - _需求: 5
  - **开发时使用 worktree 隔离：** N/A

## 阶段 B — CloudBase-MCP 实现（核心，唯一实现源）

- [ ] B.1 新增 `mcp/src/tools/msg-push.ts`：实现 `queryMessagePush` / `manageMessagePush`（qbase CGI 封装 + 幂等 merge + 写确认；通用事件，xpay 默认集合），进 `AVAILABLE_PLUGINS`（或 DEFAULT_PLUGINS）
  - _需求: 1, 5
  - **开发时使用 worktree 隔离：** 是（`.worktrees/virtual-payment-impl`，分支 `feat/virtual-payment-mcp`）

- [ ] B.2 schema 测试：`z.enum` 枚举、幂等 merge、version 冲突、非法事件拒绝；生成 `scripts/tools.json` / `doc/mcp-tools.md`
  - _需求: 1, 5
  - **开发时使用 worktree 隔离：** 是

- [ ] B.3 扩展 `mcp/scripts/test-with-ticket.cjs`：新增消息推送测试组（微信 IDE ticket `--appid/--env-id/--ticket` 真实调用 `getappconfig`/`uploadappconfig`，可模拟发请求验证幂等）
  - _需求: 1, 5
  - **开发时使用 worktree 隔离：** 是

- [ ] B.4 提交 PR 到 CloudBase-MCP 仓库 → 发布新版本（`mcp/package.json` bump + `prepublishOnly` 流程），telemetry 保持开启
  - _需求: 5
  - **开发时使用 worktree 隔离：** 是

## 阶段 C — 控制台 UI（weda-alternative）

- [ ] C.1 微信支付配置区增加虚拟支付子区域/tab，对接 A.3
  - _需求: 3
  - **开发时使用 worktree 隔离：** 是（weda-alternative 独立 worktree）

- [ ] C.2 空态与「非普通商户暂不支持」文案对齐，避免与普通商户列表混淆
  - _需求: 3
  - **开发时使用 worktree 隔离：** 是

## 阶段 D — main（微信开发者工具）消费 + skill

- [ ] D.1 main 升级 `@cloudbase/cloudbase-mcp` 版本号；在 `EMcpToolName` 增加 `CLOUD_MSG_PUSH_QUERY` / `CLOUD_MSG_PUSH_MANAGE`，`EXPOSED_TOOL_NAME` 映射 `queryMessagePush`→`cloud_msg_push_query`、`manageMessagePush`→`cloud_msg_push_manage`
  - _需求: 1, 5
  - **开发时使用 worktree 隔离：** 是（main 仓独立 worktree）

- [ ] D.2 **无 break change 验证**：升级后旧工具（nosql/storage/env 等）schema 与行为不变，`createCloudBaseToolDefs` 白名单不破；回归测试通过
  - _需求: 5
  - **开发时使用 worktree 隔离：** 是

- [ ] D.3 提交 PR 给微信侧（main 仓库）参考；更新 Nightly `tools.yaml` / `--help`（禁止手抄过期 schema）
  - _需求: 1, 7
  - **开发时使用 worktree 隔离：** 是

- [ ] D.4 新增 `config/source/skills/miniprogram-virtual-payment/`（或评审确认的路径）+ `skill-metadata.json` + `npm run build:skill-manifest`
  - _需求: 6
  - **开发时使用 worktree 隔离：** 是

- [ ] D.5 更新 `wxide-vs-cloudbase-mcp.md` 与 `doc/ide-setup/wechat-devtools.mdx` 虚拟支付小节
  - _需求: 5, 6
  - **开发时使用 worktree 隔离：** 是

## 阶段 E — 验证

- [ ] E.1 幂等与 7 事件默认订阅手工/e2e（`test-with-ticket.cjs` 真实调用）；任意合法事件订阅（非 xpay）
  - _需求: 1
  - **开发时使用 worktree 隔离：** 是（验证环境独立）

- [ ] E.2 main 升级后工具可用性回归：`cloud_msg_push_query` / `cloud_msg_push_manage` 正常暴露调用，旧工具无回归
  - _需求: 5
  - **开发时使用 worktree 隔离：** 是

- [ ] E.3 skill 驱动的端到端沙箱支付回调（低额度或沙箱）
  - _需求: 6
  - **开发时使用 worktree 隔离：** 是

## 明确不做（本需求链）

- 在主工作区 `feat/dsh-plugin` 或 `mcp-region-env-scope` worktree 内夹带实现
- 猜测公众平台未暴露接口
- 为评测/grader 增加专用分支
- 云调用工具（`queryCloudCall` / `manageCloudCall`）——归属微信云开发后端开发，MCP 均不提供（Booker 2026-08-20 裁定）
- 虚拟支付商户查询工具（`query_xpay_config` / `queryVirtualPaymentConfig`）——归属控制台团队，MCP 均不提供（Booker 2026-08-20 裁定）
- main 侧原生实现消息推送（实现源 = CloudBase-MCP，main 仅升级版本消费，Booker 2026-08-20 裁定）


