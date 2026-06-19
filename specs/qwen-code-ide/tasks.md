# 实施计划

- [ ] 1. 创建 Qwen Code 规则文件模板
  - 参考 config/.gemini/GEMINI.md 和 config/CLAUDE.md，编写 .qwen/QWEN.md，保持结构、内容风格一致，补充 Qwen Code 特色说明
  - _需求: 1

- [ ] 2. 配置 MCP 服务器示例
  - 参考 config/.gemini/settings.json，编写 .qwen/settings.json，补充 Qwen Code 支持的参数（如 API_KEY、cwd、timeout、trust 等）
  - _需求: 1

- [ ] 3. 更新硬链接脚本
  - 在 scripts/fix-config-hardlinks.sh 中添加 .qwen/QWEN.md 及 .qwen/settings.json 的硬链接目标，确保与 config/ 规则文件同步
  - _需求: 1

- [ ] 4. 编写 IDE 配置文档
  - 在 doc/ide-setup/qwen-code.md 编写 Qwen Code 适配文档，结构参考 doc/ide-setup/gemini-cli.md，内容包括安装、API 配置、MCP 配置、规则文件、特色功能、常见问题、与 Gemini CLI 异同点等
  - _需求: 1

- [ ] 5. 更新支持列表文档
  - 在 README.md、doc/index.md、doc/faq.md、README-EN.md 等文档中补充 Qwen Code 支持说明，英文文档同步，banner 保持英文
  - _需求: 1

- [ ] 6. 本地测试与验证
  - 在本地 Qwen Code 环境下，测试规则文件识别、MCP 配置、文档跳转、硬链接同步等全流程，确保体验与 Gemini CLI 一致
  - _需求: 1 