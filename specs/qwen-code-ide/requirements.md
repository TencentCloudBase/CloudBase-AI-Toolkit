# 需求文档

## 介绍

为 CloudBase AI Toolkit 项目新增对 Qwen Code AI IDE 的适配支持，使其像 Gemini CLI 一样可无缝集成，支持规则文件、MCP 服务器配置、文档与硬链接等全流程。

## 需求

### 需求 1 - Qwen Code AI IDE 适配

**用户故事：** 作为 CloudBase AI Toolkit 的用户，我希望能够在 Qwen Code AI IDE 下获得与 Gemini CLI 一致的体验，包括规则文件、MCP 服务器配置、文档说明和硬链接同步等，以便在 Qwen Code 环境下高效开发和管理 CloudBase 项目。

#### 验收标准

1. When 用户在项目根目录下使用 Qwen Code AI IDE 时，CloudBase AI Toolkit shall 检测并支持 `.qwen/QWEN.md` 规则文件。
2. When 用户需要配置 MCP 服务器时，CloudBase AI Toolkit shall 支持在 `.qwen/settings.json` 文件中添加 `mcpServers` 配置块，结构与官方文档一致。
3. When 用户查阅 IDE 支持文档时，CloudBase AI Toolkit shall 在 `doc/ide-setup/qwen-code.md` 提供详细配置与使用说明。
4. When 用户执行硬链接同步脚本时，CloudBase AI Toolkit shall 自动将 `.qwen/QWEN.md` 及相关配置加入 `scripts/fix-config-hardlinks.sh` 并同步。
5. When 用户查阅支持列表时，CloudBase AI Toolkit shall 在 `README.md`、`doc/index.md`、`doc/faq.md` 中完整列出 Qwen Code 支持细节。
6. When 用户在英文文档中查阅 IDE 支持时，CloudBase AI Toolkit shall 在 `README-EN.md` 等英文文档中同步更新 Qwen Code 支持内容（banner 保持英文）。 