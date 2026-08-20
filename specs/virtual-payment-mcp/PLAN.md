# Plan：小程序虚拟支付配套 MCP（分析 → 设计 → 开发 → 验证）

本文件是阶段计划。当前任务只完成「分析 + 设计」并落盘 spec；**开发/集成/PR 不在本阶段**。

后续开发必须使用 git worktree 隔离（见 `tasks.md`）。

---

## 阶段 0 — 分析（本任务，已完成）

**输入：** 需求 3.1 / 3.2 / 3.4 / 3.5；weda-alternative 控制台源码；微信 `cloudbase-tools.ts`；分工文档 `wxide-vs-cloudbase-mcp.md`

**输出：** `analysis.md`（调用链、鉴权边界、覆盖判断）

**验收：**

- 消息推送查询/增删/启停/云托管切换的 CGI 已列出
- 云调用读路径与写路径缺口已标明
- 普通微信支付 vs 虚拟支付展示缺口已标明
- 公众平台越权边界已写清

**依赖：** 无

---

## 阶段 1 — 设计（本任务，已完成）

**输入：** 阶段 0 分析 + 产品需求

**输出：** `requirements.md` `design.md` `tasks.md` `review.md`

**验收：**

- 三条产品能力 + 云开发侧配合均有 EARS 验收
- schema 草案含 `z.enum`
- 评审决策点列出

**依赖：** 无（接口未就绪的项在需求里标 blocked）

---

## 阶段 2 — 后端接口 readiness（starkewang / qbase）

**输入：** `design.md` 中的 CGI 复用清单 + 缺口清单

**输出：** 接口契约（path、鉴权、version、错误码）或「确认复用现有 overwrite / getfuncconfig」书面结论

**必须确认：**

1. 消息推送：是否允许 MCP 直接复用 `getappconfig` / `uploadappconfig` / `getcallbacksupportlist`（微信 IDE 登录态）
2. 是否提供**增量** add/remove CGI，还是继续全量 overwrite
3. 云函数 OpenAPI：**是否提供 setfuncconfig**（或等价 batch bind/unbind）；若否，是否接受 `config.json` + 重新上传
4. 虚拟支付商户查询：offerId / 商户名 / 签约 / 订阅签约 / iOS 状态的 CGI 或 Cloud API
5. CloudBase MCP 路径：是否做 TCB 云 API 代理；ETA

**验收：** 缺口接口有 owner + ETA；无接口的能力从开发任务中剥离或改为降级方案

**依赖：** 本 spec 评审通过

---

## 阶段 3 — 开发（新任务，worktree 隔离）

分三个可并行仓，但 **CloudBase MCP 实现依赖阶段 2 的 TCB API**；微信 IDE 工具可在 qbase CGI 确认后先做。

| 仓 | 内容 | worktree |
| --- | --- | --- |
| `main`（微信开发者工具） | 原生 MCP tools：消息推送、云调用、xpay 查询；写操作确认框；tools.yaml | 独立 worktree |
| `weda-alternative` | 微信支付配置区虚拟支付展示 | 独立 worktree |
| `CloudBase-MCP` | 对齐工具（仅 API 就绪后）、skill、schema 测试、文档 | `.worktrees/virtual-payment-impl` + `feat/virtual-payment-mcp` |

**输入：** 已评审 spec + 阶段 2 契约  
**输出：** 实现 + 单测 + 生成产物  
**验收：** 见 `tasks.md`  
**依赖：** 阶段 1 评审、阶段 2 关键接口

---

## 阶段 4 — 验证

**输入：** Nightly 微信开发者工具 + 已开通虚拟支付的小程序 + 云开发环境

**输出：** e2e 记录（可扩展 `mcp/scripts/wxide-mcp-e2e-test.md` 新分组，不写死工具数量）

**验收：**

- 省略 `event_types` 一次订阅 7 个 xpay 事件，幂等重入不重复
- 指定增删与 list 一致
- 云调用 bind 22 个 path（或阶段 2 确认的子集），查询/解绑幂等（CloudBase MCP 侧）
- `queryVirtualPaymentConfig`（CloudBase MCP 侧，可选）在已开通应用上返回 offerId 等字段；未开通返回明确 empty
- agent skill 按顺序调用不跳步

**依赖：** 阶段 3；真实 AppID（沙箱）

---

## 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 无 setfuncconfig | 3.2 无法不部署完成绑定 | 评审选降级：改 config.json + deploy |
| 无米大师查询 CGI | 3.4 MCP/UI 无法做 | 阶段 2 阻塞；UI 可先放「未开通/接口未就绪」空态 |
| 把全部 constraints 当默认订阅 | 支付云函数收到无关事件 | 默认仅 7 个 xpay_* |
| CloudBase MCP 抢先实现假 API | 越权/不可用 | 无契约不写 callCloudApi 猜测 Action |
| 主工作区 `mcp-region-env-scope` 被污染 | 并行开发冲突 | 全程独立 worktree |
