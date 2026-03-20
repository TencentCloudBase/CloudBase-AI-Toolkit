# 需求文档

## 介绍

CloudBase AI Toolkit 当前已有较完整的技能知识，但多类评测 issue 的真实根因不是“没有知识”，而是 Agent 没有在正确时机读到、选中或持续使用正确知识。典型问题包括：入口提示没有把 Agent 强制引到正确参考、skills 可发现性不足、旧模板或更近但错误的示例覆盖了正确文档、以及全局说明与细分 skill 之间的信噪比失衡。

本需求聚焦优化“知识被正确读到并用上”的链路，而不是单纯新增更多知识内容。目标是让 Agent 在 CloudBase 高价值场景下，更稳定地命中正确入口、加载正确参考、避开噪音和错误近邻，并为后续持续迭代提供可观测信号。

同时，需求会参考 Anthropic Skill 实践中被验证有效的方向，包括：

- Skill 首要价值在于“帮助模型在特定场景下稳定做对”，而不只是堆更多说明；
- 好的 Skill 需要清晰分类、强触发信号、短主入口、可按需展开的参考结构；
- 应把高频 gotchas、辅助脚本、验证方法和可观测性沉淀为长期资产；
- 需要通过使用数据与失败复盘，持续迭代入口文案、路由和噪音控制。

## 需求

### 需求 1 - 场景入口必须把 Agent 引到正确知识

**用户故事：** 作为 CloudBase AI Toolkit 维护者，我希望 Agent 在用户提出登录、云函数、数据库、部署、AI Agent 等典型任务时，能先被强制引导到正确入口和正确参考，这样后续实现不会被更近但错误的知识覆盖。

#### 验收标准

1. When 用户请求属于 CloudBase 高价值高频场景时, the CloudBase AI Toolkit shall 先命中明确的场景入口规则，再进入实现或工具调用阶段。
2. When 用户请求涉及认证、云函数、数据库、云托管、AI Agent、HTTP API 或小程序集成时, the CloudBase AI Toolkit shall 明确指出必须优先读取的参考 skill 或参考文档，而不是只给出宽泛的“可参考这些技能”。
3. While Agent 处于 CloudBase 任务入口阶段, when 存在容易混淆的近邻路径时, the CloudBase AI Toolkit shall 显式说明 should-use 与 should-not-use 的边界，避免错误技能被先加载。
4. When Agent 尚未读取关键参考就准备直接写代码、直接调用 API 或直接给方案时, the CloudBase AI Toolkit shall 通过入口提示或规则阻止该行为，并要求先完成最小必要阅读。
5. When 用户任务同时横跨多个子领域时, the CloudBase AI Toolkit shall 先给出主路由顺序，再说明何时补充读取第二参考与第三参考，避免并列堆叠造成噪音。

### 需求 2 - 关键知识要具备强可发现性与低信噪比

**用户故事：** 作为 skill 使用者，我希望真正关键的规则、gotchas、工具选择和反例能被 Agent 快速看到，而不是埋在冗长正文或被大量背景说明淹没。

#### 验收标准

1. When 维护 CloudBase 主入口 skill 或子 skill 时, the CloudBase AI Toolkit shall 将高频关键规则放在前部的短区块中，并压缩背景介绍与重复表述。
2. When 某条知识是高频失败根因、强约束、工具前置条件或错误近邻分流规则时, the CloudBase AI Toolkit shall 将其提升为显式 gotcha、must-read、decision rule 或 checklist，而不是埋在长段落中。
3. While 设计主 `SKILL.md` 与 `references/` 结构时, when 某部分内容主要服务于特定场景、样例或深度解释时, the CloudBase AI Toolkit shall 将其拆到按需参考中，避免主入口过长。
4. When 存在旧模板、历史错误示例、非推荐方式或仅适用于特殊环境的方案时, the CloudBase AI Toolkit shall 明确标注其适用边界或降级优先级，避免其在生成链路中覆盖推荐路径。
5. When 同一能力在多个文档中重复出现时, the CloudBase AI Toolkit shall 为该能力定义唯一主入口，并在其他位置只保留短引用，避免多份近似知识互相竞争。

### 需求 3 - 生成链路需要防止旧模板和错误近邻覆盖正确知识

**用户故事：** 作为维护者，我希望 Agent 在生成代码或执行任务时，不会因为仓库中存在旧模板、历史兼容文案或更近的错误示例而偏离当前推荐方案。

#### 验收标准

1. When 仓库内存在历史模板、兼容产物、镜像文件或旧说明时, the CloudBase AI Toolkit shall 定义哪些文件是语义源、哪些文件仅为兼容产物，并在规则中阻止 Agent 把兼容产物当作主知识来源。
2. When Agent 需要读取某一类 CloudBase 知识时, the CloudBase AI Toolkit shall 优先把 Agent 引导到 `config/source/skills/`、`config/source/guideline/` 等语义源，而不是 `.generated`、兼容镜像或历史产物目录。
3. While 构建 all-in-one、IDE 兼容规则或对外 prompts 产物时, when 生成内容可能改变知识优先级时, the CloudBase AI Toolkit shall 保持主入口、主路由和关键 gotcha 的语义一致，避免生成链路引入错误近邻。
4. When 兼容层或聚合产物中的内容与语义源发生冲突时, the CloudBase AI Toolkit shall 以语义源为准，并能让维护者快速识别冲突来源。
5. When 发现某类失败是由“读到了错误但更近的文档”导致时, the CloudBase AI Toolkit shall 支持将该失败复盘为新的去噪规则、降权规则或显式反例。

### 需求 4 - 为高频任务提供最小可执行的知识资产

**用户故事：** 作为维护者，我希望高频 CloudBase 场景不仅有说明文档，还能提供最小可执行的模板、检查表、辅助脚本或验证步骤，让 Agent 少做自由发挥，更多复用正确资产。

#### 验收标准

1. When 某个 CloudBase 场景反复因参数、调用顺序、部署步骤或验证方式出错时, the CloudBase AI Toolkit shall 优先补充最小可执行资产，例如模板、命令片段、脚本、验证清单或 gotcha 列表。
2. When 技能属于库/API 参考、验证、排障、部署或数据分析类时, the CloudBase AI Toolkit shall 支持使用文件夹化资源，而不只依赖长 Markdown 正文。
3. While Agent 需要完成高风险或高重复操作时, when 仓库内已有可复用脚本或结构化资源时, the CloudBase AI Toolkit shall 优先引导 Agent 使用这些资产，而不是临时现写一套流程。
4. When 关键知识可以被封装成 helper、模板或检查脚本时, the CloudBase AI Toolkit shall 优先将其沉淀为可组合资产，并在主 skill 中只保留调用与适用说明。
5. When 新增这类资产后, the CloudBase AI Toolkit shall 同步说明其适用场景、输入要求、输出形态和常见误用方式。

### 需求 5 - 建立面向失败归因的持续观测与迭代闭环

**用户故事：** 作为维护者，我希望后续每次评测失败都能更清楚地区分“没有知识”和“知识没被用上”，并把失败持续沉淀回 skill 优化，而不是只做一次性修补。

#### 验收标准

1. When 维护者复盘评测 issue 时, the CloudBase AI Toolkit shall 支持至少区分以下根因类型：知识缺失、入口提示失效、可发现性不足、错误近邻覆盖、信噪比过高、以及模型执行偏差。
2. When 某个 issue 的真实根因是“AI 没读到 / 没用上对应知识”时, the CloudBase AI Toolkit shall 将其优先映射到入口、路由、可发现性、去噪或资产化改进，而不是默认补更多正文。
3. While 设计后续评估方法时, when 需要验证 skill 激活质量时, the CloudBase AI Toolkit shall 提供 should-trigger、should-route、should-read、should-not-read 与 should-not-use 的测试思路。
4. When 维护者为某类失败补充 gotcha、反例、模板或入口规则后, the CloudBase AI Toolkit shall 支持把这些改动作为可持续积累的长期资产，而不是一次性临时补丁。
5. When 维护者评估 skill 表现时, the CloudBase AI Toolkit shall 支持后续接入使用频率、路由命中率、失败归因统计或类似观测信号，以识别哪些入口和参考的触发效果低于预期。

### 需求 6 - 输出面向仓库落地的优化方案而不是抽象建议

**用户故事：** 作为仓库维护者，我希望这次优化最终能落到当前仓库可执行的文件结构、入口规则、产物策略和验证计划上，而不是停留在抽象原则。

#### 验收标准

1. When 设计 skill 激活优化方案时, the CloudBase AI Toolkit shall 给出与当前仓库结构对应的落点，例如 `config/source/guideline/cloudbase/SKILL.md`、子 skill、兼容规则、生成脚本、文档入口或测试。
2. When 输出方案时, the CloudBase AI Toolkit shall 明确区分哪些问题适合修改语义源、哪些适合修改兼容规则、哪些适合修改文档入口、哪些适合增加测试或观测。
3. While 制定后续实施计划时, when 某项改动会影响多个下游产物时, the CloudBase AI Toolkit shall 说明需要联动的生成、同步或验证流程。
4. When 输出阶段性结论时, the CloudBase AI Toolkit shall 给出可排序的优先级，优先覆盖高频路径和高误触发成本场景。
5. When 本轮需求进入实施前确认阶段时, the CloudBase AI Toolkit shall 先形成经用户确认的需求文档，再进入技术方案设计与任务拆分。
