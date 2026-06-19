# 技术方案设计

## 概述

本次需求同时覆盖两层问题：

1. **规则层**：让 AI 在 CloudBase Web + BaaS 场景进入实现前，就能在入口规则中看到正确的 Web SDK CDN 地址。
2. **模板层**：修正仍然输出旧 CDN 地址的生成模板，避免旧地址继续通过脚手架或 README 传播。

本次以“单一语义源优先”为原则，优先修改 `config/source/` 下的源规则文件；模板问题则直接修复对应源码与测试。

## 目标文件

### 规则层

- `config/source/guideline/cloudbase/SKILL.md`
- `config/source/skills/web-development/SKILL.md`
- `config/source/skills/auth-web/SKILL.md`

### 模板层

- `mcp/src/tools/cloudrun.ts`
- 对应测试文件（若主分支不存在，则补充新测试）

## 设计原则

### 1. 把 CDN 地址放到“足够靠前”的位置

问题的核心不是仓库里完全没有正确地址，而是它没有在所有高频入口中足够早地出现。

因此本次将采用以下放置策略：

- `cloudbase` 总入口：增加一条 Web SDK 快速提醒，告知 CloudBase Web 项目接入 BaaS 时优先查看 `web-development` / `auth-web`，并直接给出 CDN 地址
- `web-development`：在 `CloudBase Web SDK Usage` 前置写明 npm 与 CDN 两种接入方式，并给出正确 CDN 地址
- `auth-web`：保留现有正确地址，并补一句“与 `web-development` 保持一致”

### 2. 明确 npm 与 CDN 的适用边界

仅写一个 CDN 地址还不够，AI 还需要知道何时用它。

规则中明确：

- **npm 包**：适用于 Vite、Webpack、Next.js、React、Vue 等现代工程化 Web 项目
- **CDN**：适用于无构建、静态 HTML、快速验证、低代码嵌入或 README 示例

这样既能满足“第一时间知道网址”，也不至于让 AI 在现代前端工程里默认退回 `<script>` 引入。

### 3. 模板层统一最新地址

`cloudrun.ts` 中 `createAgent` README 模板当前仍包含旧版 CDN 字符串。这里直接替换为：

`https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js`

同时增加或保留回归测试，确保后续模板不会回退到固定旧版本路径。

## 变更内容

### 规则层变更

#### `config/source/guideline/cloudbase/SKILL.md`

在 Web 项目相关入口附近加入“CloudBase Web SDK quick reminder”：

- 提醒 Web + BaaS 场景优先查看 `web-development` 与 `auth-web`
- 明确官方 CDN 地址
- 提示工程化项目优先 npm，纯静态页/快速接入可使用 CDN

#### `config/source/skills/web-development/SKILL.md`

在 `CloudBase Web SDK Usage` 章节前置增加：

- 官方 CDN 地址
- npm 与 CDN 的选择原则
- 如果用户需要“立刻可运行的静态页示例”，允许优先给 CDN 版本

#### `config/source/skills/auth-web/SKILL.md`

保持现有 CDN 地址，并略微强化：

- 标注这是当前官方 CDN
- 说明该地址应与 `web-development` 的描述一致

### 模板层变更

#### `mcp/src/tools/cloudrun.ts`

替换 `createAgent` 生成 README 内嵌的旧地址：

- 从 `//static.cloudbase.net/cloudbase-js-sdk/2.9.0/cloudbase.full.js`
- 改为 `https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js`

#### 测试

如果主分支缺少对应测试，则新增一个聚焦回归测试，检查生成 README 片段包含最新地址而非旧版本地址。

## 验证策略

### 文档检查

1. `cloudbase` / `web-development` / `auth-web` 中出现一致的正确 CDN 地址
2. `web-development` 明确说明 npm 与 CDN 的适用边界
3. 不新增互相冲突的描述

### 代码检查

1. `cloudrun.ts` 不再包含旧 `2.9.0` 地址
2. 模板测试覆盖最新地址
3. 仓库全文检索不再命中旧 CloudBase Web SDK CDN 固定版本地址

## 公开产物策略

本次优先修改源规则与模板源码。

- 若用户要求只修源规则，可暂不生成 `doc/prompts/*`
- 若本次要把规则修正对外同步，则需要补跑 prompts 生成流程

默认先按源文件与模板源码交付，再根据用户要求决定是否同步公开 prompt 产物。
