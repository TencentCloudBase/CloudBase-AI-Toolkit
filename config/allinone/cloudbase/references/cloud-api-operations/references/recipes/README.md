# Recipes — 实证工作流索引

**一个场景一篇文档**，新增 recipe 时在本目录新建 `<场景名>.md`，并登记到下方目录表。**编号取目录表里当前未被占用的下一个**，并让它同时出现在三处：文件名（信息性）、文件首行的 `# Recipe N — 标题`、目录表首列。三处不一致或编号与别人撞车会直接让 `tests/skill-recipes-numbering.test.js` 变红（多人并行加 recipe 时最容易撞的就是这个）。

每个 recipe 固定结构：**When to use → 前置权限 → 接口序列 → 踩坑清单 → 验证步骤**（入口特殊的可加「入口」一节）。`When to use` 写可判定的触发条件（出现什么症状就该翻这篇），并用一句划出本篇不管什么、该转哪去。

正文只写使用者照着做什么：**不写出处与验证过程**（取自哪份文档/源码、比对过哪些版本、我们怎么核对的），**不留维护者待办**；可信度只记在下表「状态」列：

- `✅ 生产实证（日期）` = 接口序列已在真实环境端到端跑通
- `🟡 部分实证（日期）` = 只跑通了其中一部分路径，**未跑到的部分必须写在这一列里**；引用未跑到的步骤时按「文档核对」的谨慎度处理
- `🟡 文档核对，未实跑` = 接口序列尚未在真实环境跑过，先按「验证步骤」做只读自检再用

一篇 recipe 里「跑过」与「没跑过」混着是常态（写操作要真实破坏、权限或计费限制都可能挡住）。分档写清楚，比给整篇贴一个 `✅` 更省事：后者会让未验证的那几条也一起被高置信采信。

「实测」是**值级**标记：贴在某个参数、接口或返回值上，最多一个，未标注的按官方文档核对后再用。不要给整节或整表贴「（全部实测）」这类状态括注——它没有逐行分辨率，不能改变任何具体动作，而后来补进未验证内容时会继承这个标签，正好让 AI 高置信采信未验证的东西。

## 目录

| # | Recipe | 文档 | 状态 |
| --- | --- | --- | --- |
| 1 | PostgreSQL 存储空间使用率告警 | [pg-storage-alarm.md](./pg-storage-alarm.md) | ✅ 生产实证（2026-09-08） |
| 2 | ICP 备案提交前自查与等待期查询 | [icp-filing-readiness.md](./icp-filing-readiness.md) | ✅ 生产实证（2026-09-21） |
| 3 | PostgreSQL 实例变配与升级独享 | [pg-instance-spec.md](./pg-instance-spec.md) | 🟡 部分实证（2026-10-16）：`ModifyPGInstanceSpec` 升配 + 降配已跑通；**共享升独享已跑通**（标准版环境 → `1 核 2 GiB` + 10 GB，`SwitchTag: 0`，约 2 分 49 秒到 `Succeed`，规格与 `TenantType` 均已复核；个人版环境的套餐拒绝报错原文已取得）；**未跑**——套餐准入在「标准版以上」各档逐个验证（现有结论来自内部口径）、`SwitchTag: 1` 指定时间切换、独享 → 共享（文档明确不支持）；「费用与套餐」一节的资源点单价、以及「目标 = 现状回 `unchanged`」按文档与界面核对，**未实跑** |
| 4 | 自定义域名接入云开发 | [custom-domain.md](./custom-domain.md) | 🟡 部分实证（2026-09-24）：现状查询、只读预检、证书读取、真实绑定与解绑（含收尾）已跑通；**未跑**——轮询到 `Status = SUCCESS`（测试域名一直停在 `PROCESSING`）、代改 DNS 解析、备案（`dnspod` / `ba` 未授权） |
| 5 | 云开发环境的操作追溯（操作审计） | [cloud-audit-operation-trace.md](./cloud-audit-operation-trace.md) | 🟡 部分实证（2026-10-12）：账号级身份下的 `LookUpEvents` 只读查询、`cam AttachRolePolicy` 挂 `QcloudAuditReadOnlyAccess`（挂后 `ListAttachedRolePolicies` 复核条数 +1）已跑通；**未跑**——`DescribeEvents` 全序列、`GetAttributeKey`、以及**角色态（`TCB_QcsRole`）下 `cloudaudit` 是否可见**（要等一个走角色态的 MCP 会话才能验） |
| 6 | 资源点耗尽与停服报错的判别 | [credits-exhaustion.md](./credits-exhaustion.md) | 🟡 文档核对，未实跑（2026-10-15）：判别序列与恢复路径按官方计费文档与套餐规则整理，**未在资源点耗尽的环境上实跑**；`InsufficientBalance` 的触发条件、以及无 `billing` 权限时账户余额查询的报错形态，先按「验证步骤」只读自检再用 |
| 7 | 平台版接入：建环境、发凭证 | [platform-onboarding.md](./platform-onboarding.md) | 🟡 文档核对，未实跑 |
| 8 | 把环境接到用户的 Agent | [platform-agent-connect.md](./platform-agent-connect.md) | 🟡 文档核对，未实跑 |
| 9 | 收口 Agent：工具裁剪、封装审计、专家约束 | [platform-agent-guardrails.md](./platform-agent-guardrails.md) | 🟡 文档核对，未实跑 |
| 10 | 平台版用量、账期与环境回收 | [platform-usage-and-recycle.md](./platform-usage-and-recycle.md) | 🟡 文档核对，未实跑 |
| 11 | 计费口径自查：为什么这笔费用会出现 | [billing-charges-explained.md](./billing-charges-explained.md) | 🟡 文档核对，未实跑（2026-10-15）：三套计费体系的口径（云托管免费额度为 3 个月总量、实例数不为 0 即计费、次日扣费；云开发资源点抵扣顺序；成长计划 Token 的来源限制）逐条取自官方文档；**未对真实账单逐项复算**，先按「验证步骤」只读自检再用 |

## 没有独立 recipe 的场景

- **MySQL / CVM 等依赖产品告警**：复用 Recipe 1 的框架，换 monitor namespace。
- **MySQL 备份回档、SCF 函数触发器**：暂无 recipe，从 `api-reference` 的依赖产品段起查。
