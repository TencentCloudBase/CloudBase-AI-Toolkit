# 实施计划

- [ ] 1. 修正 skills 双源模型的需求与设计说明
  - 明确 `skills/` 与 `config/.claude/skills/` 是两套不同资产
  - 删除“镜像”作为默认架构假设
  - _需求: 需求1, 需求2

- [ ] 2. 更新仓库文档
  - 修改 `config/README.md`
  - 明确两套目录各自的消费对象与维护规则
  - _需求: 需求1, 需求2, 需求4

- [ ] 3. 调整 skills 相关脚本语义
  - 评估并修改 `scripts/sync-claude-skills-mirror.mjs`
  - 明确 `scripts/build-skills-repo.mjs` 构建的是哪一套 skills
  - 避免脚本默认覆盖 `config/.claude/skills/`
  - _需求: 需求2, 需求3

- [ ] 4. 调整相关测试
  - 删除或重构基于镜像一致性的测试
  - 确保测试符合双源模型
  - _需求: 需求3

- [ ] 5. 验证新的目录职责边界
  - 检查文档、脚本、测试的表述是否一致
  - 确认不会再把 `config/.claude/skills/` 视作 `skills/` 的镜像
  - _需求: 需求1, 需求2, 需求3, 需求4
