# 需求文档

## 介绍

为 CloudBase AI Toolkit 新增一个对外发布的 skill，用于指导 Agent 设计、编写、优化和评估 `SKILL.md` 及其配套参考资料。该 skill 需要以英文编写，并以 `skills/` 目录作为源码落地点，重点解决 skill 元信息质量不足、触发词覆盖不清、正文过载、缺少场景索引、缺少渐进式披露与评估闭环的问题，从而提高 skill 的激活率、可维护性和可扩展性。

## 需求

### 需求 1 - Skill 定位与触发设计

**用户故事：** 作为维护 CloudBase AI Toolkit skill 体系的作者，我希望 Agent 在编写 skill 时先明确 skill 的目标、适用边界和触发方式，这样生成的对外 skill 更容易被正确激活，也更不容易和其他 skill 混淆。

#### 验收标准

1. When 用户提出“创建一个新 skill”或“优化现有 skill”时，CloudBase AI Toolkit shall 指导 Agent 先澄清 skill 的目标能力、目标用户任务、触发场景、非适用场景和预期输出。
2. When Agent 为 skill 编写 frontmatter 时，CloudBase AI Toolkit shall 要求 `description` 同时描述“skill 是什么”与“This skill should be used when...”触发语句。
3. While Agent 设计 skill 的触发文案时, when skill 涉及品牌、平台、任务或迁移场景时，CloudBase AI Toolkit shall 指导 Agent 将品牌词、平台词、场景词、动作词和能力词纳入触发文案。
4. When Agent 定义 skill 名称时，CloudBase AI Toolkit shall 指导 Agent 使用简短、稳定、聚焦主任务或主领域的命名，并避免过长或过于泛化的命名。
5. When Agent 编写 frontmatter 时，CloudBase AI Toolkit shall 指导 Agent 优先优化 `name` 与 `description` 的触发质量，并避免把非核心元字段作为主要设计重点。

### 需求 2 - Skill 正文结构与渐进式披露

**用户故事：** 作为 skill 作者，我希望 Agent 能把核心规则和细节资料分层组织，这样主 `SKILL.md` 更聚焦，复杂知识可以按需读取，减少上下文污染。

#### 验收标准

1. When Agent 生成 skill 结构时，CloudBase AI Toolkit shall 指导 Agent 将 `SKILL.md` 控制为聚焦的主入口文档，并将详细知识拆分到配套参考文档。
2. When skill 覆盖多个子领域、平台或变体时，CloudBase AI Toolkit shall 指导 Agent 在 `SKILL.md` 中提供场景选择规则，并将详细内容拆分到对应 `references/` 文档。
3. When Agent 在 `SKILL.md` 中引用外部参考文件时，CloudBase AI Toolkit shall 要求明确说明“何时阅读哪个文件”，而不是只罗列文件名。
4. While Agent 设计 skill 正文时, when 某部分内容是示例、模板、检查表或脚本型能力时，CloudBase AI Toolkit shall 指导 Agent 优先拆分为独立参考文件或脚本资源，避免主文档堆积实现细节。
5. When Agent 组织复杂参考文档时，CloudBase AI Toolkit shall 指导 Agent 提供场景索引、章节入口或目录提示，帮助后续 Agent 渐进式披露读取。

### 需求 3 - 编写规范与内容模板

**用户故事：** 作为 skill 作者，我希望 Agent 不只是生成一份说明文档，而是输出一套稳定的写作规范和模板，这样团队能持续写出风格一致、易触发、易维护的 skill。

#### 验收标准

1. When Agent 编写 skill 指令正文时，CloudBase AI Toolkit shall 指导 Agent 使用清晰、可执行的祈使句或流程化表达，而不是模糊描述。
2. When Agent 为 skill 编写示例时，CloudBase AI Toolkit shall 指导 Agent 提供贴近真实用户表达的触发示例、输入输出示例或反例。
3. When Agent 设计 skill 内容模板时，CloudBase AI Toolkit shall 提供至少 frontmatter 模板、正文结构模板和参考文档组织建议。
4. While Agent 优化 skill 文案时, when 发现触发范围过宽或过窄时，CloudBase AI Toolkit shall 指导 Agent 在精准率与召回率之间进行权衡，并给出改写检查清单。
5. When Agent 编写或改写 skill 时，CloudBase AI Toolkit shall 提供针对名称、描述、触发语句、关键词覆盖、边界说明和结构分层的自检清单。

### 需求 4 - 评估与迭代指导

**用户故事：** 作为 skill 作者，我希望 Agent 在产出 skill 后还能指导我验证效果并持续迭代，这样 skill 不会停留在“看起来合理”，而是能逐步优化触发和使用效果。

#### 验收标准

1. When Agent 完成 skill 初稿时，CloudBase AI Toolkit shall 指导 Agent 产出一组贴近真实使用场景的测试 prompt，用于验证 skill 是否应该被触发以及触发后是否按预期工作。
2. When Agent 设计评估样例时，CloudBase AI Toolkit shall 指导 Agent 同时覆盖 should-trigger 与 should-not-trigger 的近邻场景。
3. While Agent 复盘 skill 效果时, when 测试结果暴露触发不准、内容冗余或结构不清时，CloudBase AI Toolkit shall 指导 Agent 回到 frontmatter、正文结构或参考文档组织进行迭代。
4. When Agent 为用户总结 skill 优化建议时，CloudBase AI Toolkit shall 输出可执行的修改方向，例如收紧触发词、补充近邻反例、拆分参考文档或新增模板示例。

### 需求 5 - 仓库落地与复用方式

**用户故事：** 作为 CloudBase AI Toolkit 维护者，我希望这个 skill 能按照现有对外 skills 仓库规范落地，便于后续被构建、发布和继续维护，同时保持 `skills/` 目录作为源码维护位置。

#### 验收标准

1. When 该 skill 在仓库中落地时，CloudBase AI Toolkit shall 将其源码放置在 `skills/<skill-name>/` 目录下，并保持该目录结构适合后续对外发布。
2. When Agent 为该 skill 设计文件结构时，CloudBase AI Toolkit shall 支持主 `SKILL.md` 配合 `references/` 等子目录的组织方式，以适配对外 skill 的组织方式。
3. When 后续需要发布 skills 仓库时，CloudBase AI Toolkit shall 使该 skill 的元信息和目录结构可被后续发布流程消费并用于生成技能列表或发布产物。

### 需求 6 - 英文内容与对外可读性

**用户故事：** 作为对外 skill 的使用者，我希望这个 skill 的正文、参考文档、模板和示例都采用自然、专业的英文撰写，这样我可以直接安装和使用，而不需要再做语言转换。

#### 验收标准

1. When 该 skill 对外发布时，CloudBase AI Toolkit shall 使用英文编写主 `SKILL.md`、参考文档、模板文档和示例文档。
2. When skill 提供示例、模板或评估说明时，CloudBase AI Toolkit shall 使用面向公开用户的专业英文表达，而不是仓库内部语境或中文说明。
3. While 用户通过 skills 仓库浏览该 skill 时, when 用户阅读 `description`、路由、模板或评估指引时，CloudBase AI Toolkit shall 提供语义一致、术语统一的英文内容。
