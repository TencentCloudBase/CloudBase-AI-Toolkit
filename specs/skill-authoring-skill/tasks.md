# 实施计划

- [x] 1. 调整对外发布的源码落地边界
  - 明确该 skill 的源码维护目录为 `skills/skill-authoring/`
  - 明确目标是对外发布，而不是仅供内部维护
  - 在 spec 文档中统一目录、用途和发布边界表述
  - _需求: 需求5

- [x] 2. 将主 `SKILL.md` 改造为公开 skill 入口
  - 补充标准 frontmatter，包括 `name`、`description` 和 `alwaysApply`
  - 将定位说明、使用场景、非适用场景、routing 和自检内容改写为专业英文
  - 使正文更贴近现有公开 skills 的写法风格
  - _需求: 需求1, 需求2, 需求3, 需求6

- [x] 3. 将 frontmatter 与触发设计参考文档改为英文
  - 用英文整理 `name`、`description` 的编写原则
  - 用英文表达关键词桶方法和 precision / recall 权衡
  - 用英文提供改写检查清单
  - _需求: 需求1, 需求3, 需求6

- [x] 4. 将结构与渐进式披露参考文档改为英文
  - 用英文定义 skill anatomy、routing 和 progressive disclosure
  - 说明 `references/`、`assets/`、`scripts/` 的职责与拆分阈值
  - 使结构规范可直接被公开用户理解和使用
  - _需求: 需求2, 需求3, 需求6

- [x] 5. 将模板与示例参考文档改为英文
  - 提供面向公开用户的新建 skill 模板和 review 模板
  - 用英文整理正例、反例和改写示例
  - 使示例更贴近真实用户表达和触发场景
  - _需求: 需求3, 需求6

- [x] 6. 将评估参考文档改为英文并对齐公开发布标准
  - 用英文描述 should-trigger / should-not-trigger prompts 设计
  - 用英文定义 run-and-review 闭环、acceptance dimensions 和 pass criteria
  - 提供面向公开用户的评估记录模板与总结模板
  - _需求: 需求4, 需求6

- [x] 7. 验证公开发布就绪状态
  - 检查 `skills/skill-authoring/` 下文件是否齐全且引用路径正确
  - 检查 skill 内容是否全部为英文，且没有中文残留
  - 检查 frontmatter 和目录结构是否满足公开 skill 的基本要求
  - _需求: 需求5, 需求6
