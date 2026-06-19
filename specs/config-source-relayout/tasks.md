# 实施计划

- [ ] 1. 建立 `config/source/*` 目录结构并迁移 source 文件
  - 将 `skills/` 迁移到 `config/source/skills/`
  - 将 `guideline/` 迁移到 `config/source/guideline/`
  - 将 `editor-config/` 迁移到 `config/source/editor-config/`
  - _需求: 1, 4_

- [ ] 2. 更新脚本读取路径
  - 修改 compat build、mirror sync、skills repo、all-in-one、prompts 生成脚本
  - 修改使用旧 root-level source 路径的辅助脚本
  - _需求: 1, 2, 3_

- [ ] 3. 保持 Claude skills 镜像链可用
  - 确保 `config/.claude/skills/` 仍从新 source 路径同步
  - 确保 drift check 与 sync workflow 仍通过
  - _需求: 2, 3, 4_

- [ ] 4. 更新兼容产物与发布链
  - 确保 `.generated/compat-config/` 仍可从新路径生成
  - 确保 template sync、skills repo、all-in-one 构建不回退
  - _需求: 2, 3_

- [ ] 5. 更新测试与 CI
  - 修正所有依赖旧 source 路径的测试
  - 跑 mirror、compat、prompts、skills repo、all-in-one 回归
  - _需求: 2, 3_

- [ ] 6. 更新维护文档
  - 更新 `AGENTS.md`
  - 更新 `CLAUDE.md`
  - 更新 `CONTRIBUTING.md`
  - 更新 `config/README.md`
  - _需求: 4_
