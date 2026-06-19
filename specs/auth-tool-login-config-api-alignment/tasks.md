# 实施计划

- [x] 1. 重写 auth-tool 中的基础登录配置章节
  - 将 `Get Login Strategy` 改为 `Get Login Config`
  - 将匿名登录、用户名密码登录、短信登录的示例切换到 `DescribeLoginConfig` / `ModifyLoginConfig`
  - 删除旧 `lowcode/DescribeLoginStrategy` 与 `lowcode/ModifyLoginStrategy` 的默认指导
  - _需求: 需求 1

- [x] 2. 调整邮箱、provider、client 的能力边界说明
  - 在邮箱章节中区分邮箱登录开关与邮箱 provider SMTP 配置
  - 保持微信、Google 等 provider 示例不回退
  - 补充 `DescribeClient` / `ModifyClient` 的边界说明
  - _需求: 需求 2

- [x] 3. 保留并修正结构化参数示例
  - 保留现有高价值 JSON 请求示例风格
  - 为 `DescribeLoginConfig` 与 `ModifyLoginConfig` 补齐可直接复用的参数示例
  - 确保短信与邮箱示例保留关键参数字段
  - _需求: 需求 3

- [x] 4. 完成源 Skill 自检
  - 检查 `SKILL.md` 中不再出现旧 lowcode 登录策略 API
  - 检查基础登录方式、provider、client 三类能力边界清晰
  - 记录本次未同步 `doc/prompts/auth-tool.mdx`
  - _需求: 需求 4
