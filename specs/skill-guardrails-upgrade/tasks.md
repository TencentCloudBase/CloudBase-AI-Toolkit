# 实施计划

- [ ] 1. 收敛主 guideline 的共性护栏
  - 更新 `config/source/guideline/cloudbase/SKILL.md`，补齐全局验证闭环、spec reroute 和运行态风险提醒。
  - 保持共享规则在主 guideline 单点维护，不把相同规则复制到多个子 skill。
  - _需求: 需求 1, 需求 2, 需求 3, 需求 5

- [ ] 2. 强化 activation map 的高频路由语义
  - 调整 `config/source/guideline/cloudbase/activation-map.yaml` 中 Web、云函数、HTTP API、小程序等场景的 `beforeAction`、`thenRead` 或 `commonMistakes`。
  - 让任务拆分与错误近邻边界可以被路由测试锁定。
  - _需求: 需求 2, 需求 3, 需求 5

- [ ] 3. 改写 Web、云函数与 HTTP API 核心 skill
  - 更新 `web-development/SKILL.md`，增强验证闭环、spec reroute 与边界说明。
  - 更新 `cloud-functions/SKILL.md`，补充交付前验证、访问路径与运行态观察提醒。
  - 更新 `http-api/SKILL.md`，收紧 raw HTTP 边界并强化 OpenAPI 校验闭环。
  - _需求: 需求 1, 需求 2, 需求 3, 需求 5

- [ ] 4. 补齐小程序调试预览链路
  - 更新 `miniprogram-development/SKILL.md` 与 `references/cloudbase-integration.md`。
  - 新增 `references/devtools-debug-preview.md`，承载 DevTools、真机预览、`miniprogram-ci` 与发布前验证流程。
  - _需求: 需求 1, 需求 2, 需求 4, 需求 5

- [ ] 5. 固化运行态观察与诊断入口
  - 更新 `ops-inspector/SKILL.md`，明确其与开发类 skill 的切换关系。
  - 更新 `web-development/browser-testing.md`、`cloud-functions/checklist.md`、`http-api/checklist.md` 等文件，补齐 done criteria 与观察要点。
  - _需求: 需求 1, 需求 3, 需求 5

- [ ] 6. 更新质量契约与 prompts 同步面
  - 扩展 `tests/skill-quality-standards.test.js`，校验关键 reference、护栏文案与平台边界。
  - 必要时调整 `tests/skill-activation-routing.test.js`，锁定关键场景路由。
  - 根据 source 语义变化同步 `doc/prompts/web-development.mdx`、`cloud-functions.mdx`、`http-api.mdx`、`miniprogram-development.mdx`。
  - _需求: 需求 2, 需求 3, 需求 5
