# 需求文档

## 介绍

基于对 30 条 CloudBase 负向对话的分析，识别出 7 个可归因于 Skill 内容层面的问题（已排除平台层）。其中 4 个为 P0，高影响对话数集中在：

- Skill 边界判断与路由缺失（5 条）
- 端到端部署前置条件缺失（6 条）
- SDK/API 精确知识不足（4 条）
- 代码变更缺乏影响评估与验证机制（7 条，最高）

当前 CloudBase Skill 体系（`config/source/skills/`）已有模块化结构和 Activation Contract 框架，但仍存在**决策熵高**（误路由、反复试错、模糊指令）和**token 效率低**（防御性内容分散、重复或过长）的问题。

本需求要求：在解决上述问题的同时，**必须同时满足熵减（降低决策不确定性、强化边界与确定性路径）和 token 减（通过结构化、复用、按需加载实现更低上下文消耗）** 两个硬约束。目标不是堆砌更多内容，而是用更短、更硬、更可执行的规则显著提升 Skill 质量。

## 需求

### 需求 1 - 强化 Skill 边界判定与早期拒绝机制（熵减核心）

**用户故事：** 作为 Skill 维护者，我希望 Agent 在面对非 CloudBase 项目或明显不适用场景时，能在最早阶段明确识别并拒绝/分流，而不是强行套用 CloudBase 流程导致全程失败。

#### 验收标准

1. While Agent 接收到用户请求时, when 请求明显不涉及 CloudBase（例如纯 Python 爬虫、本地 NestJS+Vue 项目、Token Plan 配置、纯提示词生成等）时, the CloudBase Skill System shall 在主入口（`cloudbase-all-in-one` 或 `cloudbase-platform`）通过显式 Scope Classifier 判定为 out-of-scope，并输出标准化拒绝话术 + 建议切换路径。
2. When 任一子 skill 被激活时, the CloudBase Skill System shall 在其 Activation Contract 顶部 5 段式结构中包含“Hard exclusions + 必须拒绝场景 + 1-2 个真实负面案例”，且拒绝语言必须是可直接引用的确定性模板。
3. While 设计路由规则时, when 需要同时满足熵减与 token 减时, the CloudBase Skill System shall 优先使用短决策表 + 负面示例而非长段落解释，确保单次路由判定增加的 token 控制在 80 以内。
4. When 发生误路由导致的失败时, the CloudBase Skill System shall 支持将该案例作为新的硬边界规则沉淀到主入口，而非仅在事后人工修正单次对话。

### 需求 2 - 建立轻量可复用的部署前置条件门禁（解决最高频部署失败）

**用户故事：** 作为开发者，我希望在任何部署、发布、公网暴露类任务开始前，Agent 必须一次性完成关键前置条件检查（套餐限制、ICP 备案、SSL、CloudRun 端口健康检查、IP 白名单等），并明确告知用户，避免后期反复试错。

#### 验收标准

1. When 用户触发涉及部署、CloudRun、自定义域名、静态托管发布、小程序上传等场景时, the CloudBase Skill System shall 强制要求先读取单一轻量部署门禁文档（`deployment-gate.md`），并在开始任何操作前输出完整前置检查结果。
2. While 设计部署门禁时, when 必须同时满足熵减和 token 减时, the CloudBase Skill System shall 将该门禁实现为一个极小文件（目标 <250 tokens），采用场景化表格 + “不满足后果 + 建议动作”结构，主 skill 中仅保留 1-2 行强制引用。
3. When 部署门禁被触发时, the CloudBase Skill System shall 提供标准化“一句话前置声明”模板，供 Agent 在与用户确认时使用，减少后续因前置条件缺失导致的 correction 轮次。
4. When 存在跨领域部署场景（例如小程序 + CloudBase 存储 + CloudRun）时, the CloudBase Skill System shall 在门禁中给出最小必要检查顺序，而非并列列出所有可能性。

### 需求 3 - 引入全域强制轻量变更安全协议（解决最高影响问题）

**用户故事：** 作为 Skill 使用者，我希望 Agent 在进行任何非微小代码或配置修改前，必须显式声明影响范围、获得确认，并在修改后执行轻量验证；当同一根因问题反复出现时，必须停止打补丁并进行根因分析。

#### 验收标准

1. When 任何负责生成或修改代码/配置的 skill 执行编辑操作时, the CloudBase Skill System shall 强制执行统一的变更安全协议（`change-safety-protocol.md`），且该协议必须在主流程中不可跳过。
2. While 设计变更安全协议时, when 必须同时实现熵减与 token 减时, the CloudBase Skill System shall 将完整协议控制在 160 tokens 以内，采用编号 4 步结构 + 明确升级条件（同一症状 ≥3 次），并通过 1 行引用方式被多个 skill 复用。
3. When 同一根因症状在单次任务中出现 ≥3 次时, the CloudBase Skill System shall 要求 Agent 立即停止局部修补，输出根因分析 + 整体修复建议，不得继续生成新补丁代码。
4. When 变更安全协议被引入后, the CloudBase Skill System shall 在 `cloudbase-all-in-one`（alwaysApply）中提供极低成本的默认上下文支持，确保即使只加载单一子 skill 的环境也能获得基本保护。

### 需求 4 - 通过低 token 高信号方式补充精确 SDK/API 陷阱知识

**用户故事：** 作为开发者，我希望高频 SDK 陷阱（认证机制差异、权限模型、registerAi/app.ai 用法、版本差异等）能以极短、可精确命中的形式存在，而非分散在冗长说明中或完全缺失。

#### 验收标准

1. When 某类 SDK/API 陷阱被多次证明是失败根因时, the CloudBase Skill System shall 将其沉淀为独立、极短的 pitfalls / exact-contracts 参考文件，格式严格限制为 Symptom + Root Cause + Correct Pattern + Verification。
2. While 组织精确知识时, when 追求 token 减时, the CloudBase Skill System shall 仅在主 skill 中保留最高频 6-8 条陷阱的速查表，其余全部下沉到按需加载的 references 文件。
3. When Agent 遇到与已知陷阱匹配的症状时, the CloudBase Skill System shall 能快速定位对应 pitfalls 文件并引用正确模式，而不是重新自由发挥或反复试错。
4. When 补充新陷阱知识时, the CloudBase Skill System shall 同步更新对应 skill 的 Activation Contract 中的“Common mistakes / gotchas”部分，形成闭环。

### 需求 5 - 所有改进必须同时满足熵减与 token 减硬约束

**用户故事：** 作为维护者，我希望本次针对质量反馈的所有改动，在提升 Skill 有效性的同时，实际降低 Agent 的平均决策熵和上下文 token 消耗，而不是通过增加内容长度来掩盖问题。

#### 验收标准

1. When 设计任何新规则、协议或参考时, the CloudBase Skill System shall 优先采用决策表、编号步骤、负面示例、1 行引用等结构，目标是让相关改动在典型任务中净增加 token 数为负或接近零。
2. When 评估方案时, the CloudBase Skill System shall 明确区分“增加知识量”和“降低决策不确定性”两种改进路径，优先选择后者。
3. While 制定实施计划时, when 存在多个实现方式时, the CloudBase Skill System shall 选择在熵减和 token 减两个维度上得分更高的方案。
4. When 改动完成后, the CloudBase Skill System shall 支持通过加载 token 对比 + 典型失败案例重放 来验证熵减与 token 减目标是否达成。

### 需求 6 - 输出可落地的仓库级变更而非抽象建议

**用户故事：** 作为仓库维护者，我希望最终方案能精确映射到 `config/source/skills/` 下的具体文件、目录结构、引用关系和最小改动点，并给出可执行的任务拆分。

#### 验收标准

1. When 输出技术方案时, the CloudBase Skill System shall 明确列出所有需要新增或修改的文件路径（例如 `cloudbase-platform/references/protocols/change-safety-protocol.md`、`cloudbase-platform/references/protocols/deployment-gate.md` 等）。
2. When 设计跨 skill 协议时, the CloudBase Skill System shall 说明如何在保持单一语义源的前提下，被 `cloudbase-all-in-one`、`cloudbase-platform` 及其他高频子 skill 低成本复用。
3. While 制定任务计划时, the CloudBase Skill System shall 区分必须先完成的 P0 协议/入口强化，与可后续补充的领域 pitfalls 扩展。
4. When 本轮需求进入实施前, the CloudBase Skill System shall 完成需求文档、技术方案设计与任务拆分三份产物，并经确认后开始执行。
