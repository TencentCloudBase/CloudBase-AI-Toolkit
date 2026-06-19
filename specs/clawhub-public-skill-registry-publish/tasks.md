# 实施计划

- [x] 1. 建立 ClawHub 发布单元白名单与目标解析
  - 新增发布单元定义脚本，集中维护 `miniprogram-development`、`all-in-one` 的元信息
  - 实现目标名称解析、非法目标报错、registry 名称映射
  - _需求: 需求 1, 需求 2, 需求 5

- [x] 2. 实现 ClawHub 发布产物构建脚本
  - 新增 `scripts/build-clawhub-publish-artifacts.mjs`
  - 支持从 `config/source/skills/miniprogram-development/` 构建独立发布目录
  - 支持复用 `scripts/build-allinone-skill.ts` 生成 `all-in-one` 发布目录
  - 输出 `manifest.json` 供后续发布步骤消费
  - _需求: 需求 1, 需求 4, 需求 5

- [x] 3. 补齐发布前结构与元数据校验
  - 校验目标单元对应产物目录存在 `SKILL.md`
  - 校验 frontmatter 中至少包含 `name` 与 `description`
  - _需求: 需求 1, 需求 4

- [x] 4. 实现 ClawHub CLI 发布执行脚本
  - 新增 `scripts/publish-to-clawhub.mjs`
  - 读取 `manifest.json` 并逐单元执行发布
  - 按真实 CLI 参数传递 `clawhub sync --root --all --bump --changelog --tags`
  - 预留 `dry-run` 模式，仅打印将要发布的单元和目录
  - 汇总成功与失败结果，并在失败时返回非 0 退出码
  - _需求: 需求 2, 需求 3, 需求 4

- [x] 5. 新增 GitHub Actions 发布工作流
  - 创建 `.github/workflows/publish-clawhub-registry.yml`
  - 提供 `targets`、`bump`、`changelog`、`tags`、`dry_run` 输入参数
  - 在 workflow 中安装 `clawhub` CLI 并通过 Secret 注入凭证
  - 使用非交互 token 登录完成认证
  - 生成 job summary，输出每个目标单元的发布结果
  - _需求: 需求 2, 需求 3, 需求 5

- [x] 6. 增加脚本级自动化测试与回归保护
  - 新增发布单元解析测试，防止默认发布范围回退为全量 skills
  - 新增产物构建测试，覆盖 `miniprogram-development`、`all-in-one`、非法目标等场景
  - 保持现有 `build-skills-repo` 与 `build-allinone-skill` 测试不回退
  - _需求: 需求 4, 需求 5

- [x] 7. 本地验证发布链路的构建与 dry-run 行为
  - 运行新增测试与必要的现有测试
  - 本地执行发布产物构建脚本验证 `manifest.json` 与目录结构
  - 以 `dry-run` 方式验证 workflow 所依赖的发布脚本参数与输出
  - _需求: 需求 3, 需求 4, 需求 5
