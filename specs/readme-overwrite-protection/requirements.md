# 需求文档

## 介绍

当用户使用 `downloadTemplate` 工具下载 rules 模板时，模板包中的 README.md 文件会覆盖用户项目原有的 README.md 文件，这会导致用户项目的重要文档丢失。

## 需求

### 需求 1 - README.md 文件保护

**用户故事：** 作为项目开发者，我希望在下载 rules 模板时，如果项目中已经存在 README.md 文件，系统能够保护这个文件不被覆盖，避免丢失项目的重要文档信息。

#### 验收标准

1. When 用户下载 rules 模板时，if 项目中已存在 README.md 文件，then 系统 shall 跳过 README.md 文件的复制，保护原有文件不被覆盖。
2. When 用户下载 rules 模板时，if 项目中不存在 README.md 文件，then 系统 shall 正常复制模板中的 README.md 文件。
3. When 用户下载其他模板（react、vue、miniprogram、uniapp）时，then 系统 shall 保持原有行为不变。
4. When 用户明确设置 `overwrite=true` 参数时，then 系统 shall 允许覆盖 README.md 文件。
5. When 文件被跳过时，then 系统 shall 在输出信息中明确说明跳过了 README.md 文件。 