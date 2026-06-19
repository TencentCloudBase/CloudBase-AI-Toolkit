# 实施计划

- [x] 1. 建立 attribution triage skill 的源码骨架
  - 在根目录 `skills/` 下新增维护型 skill 目录
  - 编写 `SKILL.md` frontmatter、适用边界、主流程和强约束
  - 明确 skill 仅处理 `report-api` 驱动的 `tool` 类 attribution issues
  - _需求: 目标 1, 目标 2, 目标 6

- [x] 2. 编写 report-api 排查与更新参考文档
  - 新增 `references/report-api-workflow.md`
  - 固化 issue 拉取、detail 查询、run 选择、`result/trace/evaluation-trace` 的读取顺序
  - 固化 `owner=codex`、`notes` 审计格式、`externalUrl` 与 `resolutionStatus` 更新规则
  - _需求: 目标 1, 目标 2, 目标 6

- [x] 3. 编写 `mcp/src` 价值判断与误报判定参考文档
  - 新增 `references/value-triage.md`
  - 建立 issue 类型到 `mcp/src/tools/*.ts` 的代码映射
  - 固化“值得修复 / 可标 invalid / 仅保持 todo 或 in_progress”的判断规则
  - _需求: 目标 3

- [x] 4. 编写 worktree 修复与 GitHub 闭环参考文档
  - 新增 `references/worktree-repair.md`
  - 明确一 issue 一 agent / 一 worktree 的隔离策略
  - 明确 `gh` 查找或创建 issue、修复分支、PR、以及 attribution 回写策略
  - _需求: 目标 4, 目标 5

- [x] 5. 对齐根目录内置 skill 的结构与可发现性
  - 对齐 `skills/skill-authoring`、`skills/manage-local-skills` 的目录结构与写法
  - 检查 `SKILL.md` 与 references 的相对路径是否可直接被仓库内 agent 使用
  - 明确该 skill 不接入 `config/source/skills/` 和对外 prompts 链路
  - _需求: 目标 1, 目标 6

- [x] 6. 执行本地验证并收敛实现结果
  - 检查 skill 文档结构、frontmatter、routing 与引用路径
  - 根据需要补充最小示例或模板文件，确保主 skill 不过载
  - 根据验证结果微调 skill 文案与 references
  - _需求: 目标 1, 目标 2, 目标 3, 目标 5, 目标 6
