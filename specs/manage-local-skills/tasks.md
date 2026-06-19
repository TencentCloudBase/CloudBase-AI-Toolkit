# 实施计划

- [x] 1. 固化 `manage-local-skills` 的源码落点与主入口
  - 在 `skills/manage-local-skills/` 下建立标准 skill 目录
  - 创建主 `SKILL.md`，明确该 skill 解决的是本地 skills 的整理、标准化、挂载与映射维护问题
  - 在主文档中说明其与 `skills` CLI 的关系、边界和适用场景
  - _需求: 需求4, 需求8

- [x] 2. 沉淀对齐 `skills` CLI 的本地安装模型参考文档
  - 编写 `references/cli-alignment.md`，总结 canonical 目录、project/global scope、universal Agent、symlink fallback 等语义
  - 明确第一版与 `skills` CLI 的一致项和暂不覆盖项
  - 让后续 Agent 在执行本地 skills 管理时优先按该语义工作
  - _需求: 需求4, 需求6

- [x] 3. 编写本地 skills 来源识别与迁移方法文档
  - 编写 `references/source-classification.md`，定义标准、非标准、混合来源的识别规则
  - 编写 `references/migration-playbook.md`，说明如何把历史目录内容拆分到 `SKILL.md`、`references/`、`scripts/`、`assets/`
  - 覆盖来源信息不足时的确认策略与可追溯性要求
  - _需求: 需求1, 需求2, 需求7

- [x] 4. 编写本地 skills 挂载与映射扩展文档
  - 编写 `references/install-workflow.md`，说明本地 skill 的挂载流程、scope 选择、冲突处理和 dry-run 策略
  - 编写 `references/mapping-extension.md`，说明如何新增 Agent / IDE 映射
  - 让 skill 使用者能独立理解如何把一份本地 skills 源挂载到多个 Agent
  - _需求: 需求3, 需求5, 需求6

- [x] 5. 实现来源分析脚本
  - 新增 `scripts/inspect-source.mjs`，用于识别标准 skill、非标准目录和混合来源
  - 输出候选 skill 名称、文件分类建议、警告信息和迁移计划
  - 设计 `--json` 输出，便于 Agent 将分析结果纳入后续流程
  - _需求: 需求1, 需求2, 需求6, 需求7

- [x] 6. 实现本地 skill 挂载脚本与公共库
  - 新增 `scripts/install-skill.mjs`，按 `skills` CLI 模型实现 canonical 安装、soft link 优先、失败回退 copy
  - 新增 `scripts/lib/agent-mappings.mjs`、`scripts/lib/path-safety.mjs`、`scripts/lib/install-model.mjs`
  - 初始覆盖 `universal`、`claude-code`、`cursor`、`codex` 等高频 Agent 映射
  - 支持 `--scope`、`--mode`、`--dry-run`、冲突检查与结果输出
  - _需求: 需求3, 需求4, 需求5, 需求6, 需求7

- [x] 7. 实现标准 skill 结构与安装结果校验脚本
  - 新增 `scripts/validate-skill.mjs`，校验 `SKILL.md` frontmatter、目录结构和引用文件存在性
  - 支持校验 canonical 路径和 Agent 目标路径是否正确生成
  - 对软链接目标错误、复制不完整等情况给出明确失败信息
  - _需求: 需求2, 需求4, 需求7

- [x] 8. 为 `manage-local-skills` 增加自动化测试
  - 在 `tests/` 中新增来源识别、canonical 路径计算、Agent 映射、symlink/copy 回退和校验脚本测试
  - 使用临时目录构建隔离测试场景，避免依赖本机真实 Agent 目录
  - 覆盖至少一个非标准迁移分析场景和一个多 Agent 挂载场景
  - _需求: 需求1, 需求3, 需求4, 需求5, 需求7

- [x] 9. 完成本地验证并收敛交付说明
  - 运行相关脚本和测试，确认 `manage-local-skills` 可被实际触发和复用
  - 校对英文内容、命名一致性和引用路径
  - 总结第一版已支持能力、未覆盖的 `skills` CLI 差异项和后续扩展入口
  - _需求: 需求4, 需求6, 需求7, 需求8
