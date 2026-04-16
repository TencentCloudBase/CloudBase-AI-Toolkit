# 需求文档

## 介绍

当前仓库在工具与知识层已经具备两条重要基础：

1. **MCP 工具收敛**：同一逻辑域优先复用 `queryXxx` / `manageXxx` 主入口，而不是继续拆出大量细粒度 tool；
2. **Skill 单一语义源**：对外 skill 以 `config/source/skills/` 和 `config/source/guideline/` 为语义源，再投影到兼容层与生成产物。

但从更复杂、更生产级的场景看，现有体系仍偏向“单次调用 -> 立即返回”的工具心智，存在以下问题：

- 长流程、高风险、需要审批或回滚的操作，还没有统一的 `task / job` 一等对象；
- skill 仍主要承担知识说明，尚未系统化承载 `workflow / policy / guardrail / verify / rollback`；
- 同一能力在源码、skill、文档、兼容产物和评测中，还没有一套可测试的任务化合同；
- 当需求进入“计划 -> 执行 -> 验证 -> 回滚 / 清理”的阶段时，Agent 仍容易退化成一次性同步调用思维。

本需求希望为当前仓库建立一套新的 `MCP + skill` 范式：

- **Tool / MCP** 负责提供稳定的能力面与状态面；
- **Skill** 负责路由、SOP、风险边界与验收约束；
- **Task / Job** 负责承载长流程、高风险、可暂停、可重试、可回滚、可审计的执行生命周期。

本次 spec 聚焦仓库内的能力形态与落地路径，不要求一次性把所有域都任务化，而是先定义统一模式，再选高价值域试点。

## 需求

### 需求 1 - 高风险或长流程能力必须任务化

**用户故事：** 作为仓库维护者，我希望高风险、长流程、需要确认或回滚的能力不再伪装成一次性 tool call，而是进入明确的 `task / job` 生命周期，这样 Agent 才能以生产级心智使用这些能力。

#### 验收标准

1. When 某个动作需要多阶段执行、人工确认、长时间运行、重试、验证或回滚时, the CloudBase AI Toolkit shall 将该动作建模为 `task / job`，而不是只返回一次性的同步结果。
2. While 同一逻辑域已有 `queryXxx` / `manageXxx` 主入口时, the CloudBase AI Toolkit shall 继续使用原域入口发起任务，而不是为每个任务化动作继续新增 alias tool。
3. When 某个动作被任务化后, the CloudBase AI Toolkit shall 返回稳定的任务句柄，至少包含 `taskId`、`domain`、`action`、`status` 与下一步建议。
4. When 某个动作属于低风险、短耗时、无后续阶段的直接操作时, the CloudBase AI Toolkit may 保持同步执行模式，而不是强制所有动作都任务化。
5. While 新增任务化能力时, the CloudBase AI Toolkit shall 明确说明为什么该能力不能继续作为纯同步动作处理。

### 需求 2 - 任务生命周期必须成为独立且可观测的控制面

**用户故事：** 作为 AI 调用方，我希望一旦进入任务化流程，就能查询状态、暂停、继续、取消、重试、回滚和查看结果，而不是只能等待一次性返回。

#### 验收标准

1. When 任务被创建后, the CloudBase AI Toolkit shall 提供统一的任务状态模型，至少覆盖 `planned`、`awaitingApproval`、`queued`、`running`、`verifying`、`succeeded`、`failed`、`rolledBack`、`cancelled` 等核心状态。
2. When AI 需要查看任务进度或结果时, the CloudBase AI Toolkit shall 提供统一的任务查询入口，而不是要求 AI 回到各个原始域自行猜测状态查询方式。
3. When 任务支持控制动作时, the CloudBase AI Toolkit shall 提供统一的控制语义，例如 `approve`、`pause`、`resume`、`cancel`、`retry`、`rollback`、`cleanup`。
4. While 某个任务仍处于执行中或等待验证阶段时, the CloudBase AI Toolkit shall 返回结构化状态、最近事件和推荐下一步，而不是只返回无结构日志。
5. When 任务结束后, the CloudBase AI Toolkit shall 支持查询结果摘要、验证结论和后续清理建议，便于 Agent 正确收尾。

### 需求 3 - Skill 必须从知识说明升级为工作流合同

**用户故事：** 作为 Agent 和 skill 维护者，我希望 skill 不只是“介绍工具能做什么”，而是明确告诉 Agent 在什么场景下该走哪条流程、先读什么、不要做什么、如何验证和回滚。

#### 验收标准

1. When 用户请求命中任务化或高风险场景时, the CloudBase AI Toolkit shall 通过主 guideline 或相关 skill 明确引导 Agent 进入 `plan -> run -> verify -> rollback / cleanup` 的工作流，而不是直接执行。
2. When 某个 skill 对应的域支持任务化动作时, the CloudBase AI Toolkit shall 在该 skill 中明确说明 `Use this first when`、`Before action`、`Do not use`、`Verify after`、`Rollback / cleanup if needed` 等合同信息。
3. While 维护 skill 内容时, the CloudBase AI Toolkit shall 优先把 workflow、guardrail、边界和常见误用前置，而不是继续堆叠冗长背景说明。
4. When 多个 skill 同时可能命中同一请求时, the CloudBase AI Toolkit shall 明确主路由顺序和第二参考，而不是让多个 skill 并列竞争。
5. When Agent 尚未完成最小必要的前置检查时, the CloudBase AI Toolkit shall 通过 skill 合同阻止直接进入危险动作。

### 需求 4 - 语义源与兼容投影必须共享同一套任务化合同

**用户故事：** 作为维护者，我希望源码、语义源、兼容层、文档和聚合产物对“哪些动作会返回任务、任务如何收尾、哪些 skill 负责路由”保持一致，这样不会在不同入口中产生语义漂移。

#### 验收标准

1. When 定义任务化范式时, the CloudBase AI Toolkit shall 明确语义源位置，至少覆盖域入口定义、skill 合同和任务化场景映射。
2. When 兼容层、IDE 规则、skills 仓库或 all-in-one 产物被生成时, the CloudBase AI Toolkit shall 保留与语义源一致的任务化路由、前置约束与收尾语义。
3. While 文档、prompt 或 manifest 描述任务化能力时, the CloudBase AI Toolkit shall 使用与源码一致的 canonical 名称，而不是引入新的近义别名。
4. When 兼容产物与语义源出现冲突时, the CloudBase AI Toolkit shall 以语义源为准，并能让维护者识别漂移来源。
5. When 某个任务化场景新增或调整时, the CloudBase AI Toolkit shall 说明需要联动的文档、生成脚本、测试与下游产物。

### 需求 5 - 评测与验证必须覆盖任务流而不是只覆盖同步调用

**用户故事：** 作为评测与质量维护者，我希望后续测试能覆盖“有没有正确进入任务流、有没有正确 verify / rollback”，而不是只覆盖工具能不能被注册。

#### 验收标准

1. When 新增任务化能力时, the CloudBase AI Toolkit shall 增加测试覆盖任务创建、状态迁移、控制动作和结果查询。
2. When 维护相关 skill 与 guideline 时, the CloudBase AI Toolkit shall 增加 should-trigger、should-route、should-read、should-not-use 等验证思路，确保 Agent 会进入正确流程。
3. While 文档与兼容产物被更新时, the CloudBase AI Toolkit shall 验证关键任务语义不会在聚合或同步链路中丢失。
4. When 某个场景仍保留同步模式时, the CloudBase AI Toolkit shall 在测试与文档中明确其为什么不任务化，以避免未来语义混乱。
5. When 复盘失败案例时, the CloudBase AI Toolkit shall 支持区分“能力缺失”“没有进入任务流”“进入了错误 skill / 错误入口”“缺少 verify / rollback”这几类根因。

### 需求 6 - 首期实施必须以少量高价值域试点而不是全量改造

**用户故事：** 作为仓库维护者，我希望新范式先在最值得的域试点，验证有效后再扩展，而不是一次性重写整个仓库导致范围失控。

#### 验收标准

1. When 启动首期实施时, the CloudBase AI Toolkit shall 先选择少量高价值、高风险、最适合任务化的域进行试点，例如 SQL schema change、NoSQL backfill / collection migration、函数或部署发布流程。
2. While 首期试点尚未稳定时, the CloudBase AI Toolkit shall 不要求所有域同步迁移到任务模式。
3. When 首期试点完成并验证通过后, the CloudBase AI Toolkit shall 能够复用统一的任务状态模型、skill 合同模板和评测方法扩展到其他域。
4. While 试点域仍与旧同步能力并存时, the CloudBase AI Toolkit shall 明确区分推荐路径与过渡路径，避免 Agent 混用。
5. When 维护者评估首期试点价值时, the CloudBase AI Toolkit shall 给出是否继续推广的判断依据，例如风险降低、调用正确率提升、收尾质量提升或评测表现改善。