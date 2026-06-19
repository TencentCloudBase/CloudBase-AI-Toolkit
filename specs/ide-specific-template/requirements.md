# 需求文档

## 介绍

当前用户在下载CloudBase项目模板时，会下载所有AI编辑器的配置文件，导致项目文件混乱。用户希望只下载对应IDE的规则文件，以保持项目结构的整洁。

## 需求

### 需求 1 - IDE特定模板下载

**用户故事：** 作为开发者，我希望在下载CloudBase项目模板时能够选择只下载特定IDE的配置文件，这样我可以避免项目目录中出现不必要的文件，保持项目结构的整洁。

#### 验收标准

1. When 用户调用 `downloadTemplate` 工具时，the 系统 shall 提供 `ide` 参数选项，允许用户指定要下载的IDE类型。
2. When 用户指定了特定的IDE类型时，the 系统 shall 只下载该IDE相关的配置文件，而不是所有IDE的配置文件。
3. When 用户未指定IDE类型时，the 系统 shall 保持现有行为，下载所有IDE的配置文件（向后兼容）。
4. When 用户指定了不支持的IDE类型时，the 系统 shall 返回错误信息并列出支持的IDE类型。
5. The 系统 shall 支持以下IDE类型：cursor, windsurf, codebuddy, claude-code, cline, gemini-cli, opencode, qwen-code, baidu-comate, openai-codex-cli, augment-code, github-copilot, roocode, tongyi-lingma, trae。
6. The 系统 shall 在下载完成后显示实际下载的文件列表和统计信息。

### 需求 2 - IDE配置文件映射关系

**用户故事：** 作为开发者，我希望系统能够正确识别每个IDE对应的配置文件，确保下载的配置文件与目标IDE完全匹配。

#### 验收标准

1. The 系统 shall 维护一个IDE到配置文件的映射关系表。
2. When 用户指定IDE类型时，the 系统 shall 根据映射关系表确定需要下载的配置文件。
3. The 系统 shall 确保每个IDE的配置文件路径和文件名与目标IDE的要求完全一致。
4. The 系统 shall 支持IDE配置文件的版本信息同步。 