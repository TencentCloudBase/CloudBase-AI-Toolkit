# 实施计划

- [x] 1. 强化 CloudBase Web 入口规则中的 CDN 提示
  - 更新 `config/source/guideline/cloudbase/SKILL.md`
  - 在 Web + BaaS 场景入口中补充官方 Web SDK CDN 地址与路由提醒
  - _需求: 需求 1, 需求 2

- [x] 2. 更新 Web 相关源 skill 的 SDK 接入说明
  - 更新 `config/source/skills/web-development/SKILL.md`
  - 补充 npm 与 CDN 的适用边界
  - 检查并修正 `config/source/skills/auth-web/SKILL.md` 中的对应描述，确保一致
  - _需求: 需求 1, 需求 2

- [x] 3. 修正 CloudRun 模板中的旧 CDN 地址
  - 更新 `mcp/src/tools/cloudrun.ts` 中 `createAgent` 生成 README 的 CDN 链接
  - 检查仓库内是否仍存在旧的固定版本 CloudBase Web SDK CDN 地址
  - _需求: 需求 3

- [x] 4. 增加或更新回归测试
  - 为 CloudRun README 模板补充或更新聚焦测试
  - 验证生成内容包含最新地址且不包含旧版本地址
  - _需求: 需求 3, 需求 4

- [x] 5. 完成自检并说明产物同步范围
  - 自检源规则、模板源码与测试的一致性
  - 明确本次是否同步 `doc/prompts/*` 公开产物
  - _需求: 需求 4
