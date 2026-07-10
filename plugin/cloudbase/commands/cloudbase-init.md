---
description: "初始化 CloudBase 项目。下载模板、配置环境、生成 cloudbaserc.json。适合新项目。"
---

# 初始化 CloudBase 项目

为新项目下载 CloudBase 模板、配置环境 ID、生成 `cloudbaserc.json`，并按场景类型给出后续指引。适合从零开始的项目。

## Preflight

运行以下检查，失败时停止并给出可执行指引。

1. **MCP 连接检查** — 确认 `cloudbase-mcp` server 已连接。
   - 调用 `envQuery({action:"list"})` 验证连接。若失败，提示用户完成授权。
2. **目录空检查** — 检查当前工作目录是否为空（或仅包含 `.git` 等无关文件）。
   - 若目录非空：提示用户当前目录已有文件，模板可能覆盖现有文件。询问是否切换到新目录或继续。
   - 推荐做法：创建新子目录（如 `mkdir my-cloudbase-app && cd my-cloudbase-app`）。
3. **场景选择** — 使用 `AskUserQuestion` 工具让用户选择项目场景：

   | 场景 | 模板类型 | 说明 |
   |------|---------|------|
   | Web 项目 | `web` | React/Vue/原生 JS 前端项目，使用静态托管 |
   | 微信小程序 | `miniprogram` | 小程序云开发项目，使用云函数 + 数据库 |
   | 云托管 | `cloudrun` | CloudBase Run 后端服务，支持 Java/Go/Python/Node.js 等 |

4. **环境选择** — 若用户有多个环境，调用 `envQuery({action:"list"})` 让用户选择目标环境，用于后续 `cloudbaserc.json` 配置。

## Plan

根据用户选择的场景执行：

1. **下载模板** — 调用 `downloadTemplate` 下载对应场景的项目模板。
2. **复制文件** — 将模板内容复制到当前目录（含隐藏文件，如 `.gitignore`、`.env.example`）。
3. **生成配置** — 使用 `envQuery` 获取的 EnvId 生成 `cloudbaserc.json`。
4. **小程序场景** — 检查 `project.config.json` 的 `appid` 字段，缺失则询问用户。
5. **生成 README** — 生成包含项目结构、CloudBase 资源说明的 `README.md`。

无破坏性操作（仅创建文件，不修改已有项目），但目录非空时需确认覆盖风险。

## Commands

### 1. 下载模板

根据用户选择的场景调用模板下载：

```
downloadTemplate({
  templateName: "<scenario-template-name>"
})
```

模板类型映射：
- Web 项目 → 对应 web 模板名
- 微信小程序 → 对应 miniprogram 模板名
- 云托管 → 对应 cloudrun 模板名

下载完成后，将模板文件复制到当前目录。**注意包含隐藏文件**（如 `.gitignore`、`.env.example`、`.editorconfig` 等），这些文件对项目正常运行至关重要。

复制脚本示例（当 downloadTemplate 下载到临时目录时）：

```bash
# 复制所有文件，包括隐藏文件
cp -a /tmp/template/. ./
```

### 2. 生成 cloudbaserc.json

使用 `envQuery({action:"info"})` 获取的 EnvId 生成配置文件：

```json
{
  "envId": "<当前环境 ID>",
  "functionRoot": "cloudfunctions",
  "framework": "<框架名>",
  "version": "1.0.0"
}
```

- `envId` — 自动填入查询到的环境 ID，无需用户手动替换
- `functionRoot` — 云函数目录路径（小程序/云托管场景）
- `framework` — 根据模板类型自动设置

### 3. 小程序场景检查

若场景为微信小程序，检查 `project.config.json` 中的 `appid` 字段：

```bash
# 检查 appid 是否已配置
node -e "const c = require('./project.config.json'); console.log(c.appid || 'MISSING')"
```

若 `appid` 缺失或为默认占位值，使用 `AskUserQuestion` 询问用户：

> 请提供微信小程序的 AppID。可在微信公众平台（mp.weixin.qq.com）→ 开发 → 开发设置中获取。

获取后写入 `project.config.json`。

### 4. 生成 README.md

生成项目 README，包含：
- **项目名称** 和 **项目描述**
- **技术栈**（React / Vue / 小程序 / Node.js 等）
- **CloudBase 资源清单**：
  - 环境 ID
  - 使用的云函数列表
  - 数据库集合
  - 静态托管域名（如适用）
- **本地开发指引**（`npm install` → `npm run dev`）
- **部署指引**（指向 `/cloudbase-deploy`）

### 5. CLI Fallback

当 `downloadTemplate` 不可用时，回退到 `tcb` CLI：

```bash
# 初始化新项目
tcb init --envId <env-id> --template <template-name>

# 或使用 npx
npx @cloudbase/cli init --envId <env-id>
```

仅在 MCP 工具明确不可用时使用 CLI fallback，并在 Plan 中说明原因。

## Verification

初始化完成后，验证项目结构：

- [ ] 模板文件已完整复制到当前目录（含隐藏文件）
- [ ] `cloudbaserc.json` 已生成且 `envId` 正确
- [ ] 小程序场景下 `project.config.json` 的 `appid` 已配置（非占位值）
- [ ] `README.md` 已生成且包含 CloudBase 资源说明
- [ ] 目录结构与所选模板一致（`cloudfunctions/` / `src/` / `Dockerfile` 等）

验证命令：

```bash
# 检查关键文件是否存在
ls -la cloudbaserc.json README.md
# 小程序场景
cat project.config.json | grep appid
```

## Summary

```
## Init Result
- **Action**: init
- **Status**: success | partial | failed
- **Scenario**: web | miniprogram | cloudrun
- **Template**: <模板名称>
- **EnvId**: <配置的环境 ID>
- **Project Structure**: <关键目录和文件列表>
- **Details**: <初始化摘要>
```

若部分步骤失败，附加：

```
- **Warning**: <未完成的步骤>
```

## Next Steps

根据场景类型建议后续操作：

- **Web 项目** → "运行 `npm install` 安装依赖，然后 `npm run dev` 启动本地开发。完成后运行 `/cloudbase-deploy hosting` 部署到静态托管。"
- **微信小程序** → "使用微信开发者工具打开当前项目目录进行预览调试。确保 `project.config.json` 中的 `appid` 已正确配置。运行 `/cloudbase-deploy function` 部署云函数。"
  - 打开命令（macOS）：`/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project "$(pwd)"`
- **云托管** → "完善 `Dockerfile` 和服务代码后，运行 `/cloudbase-deploy cloudrun` 部署云托管服务。"
- **通用** → "运行 `/cloudbase-status` 检查环境状态和资源部署情况。运行 `/cloudbase-env info` 查看环境详情。"
- **配置不完整** → "补全缺失配置（如 `appid`）后重新运行 `/cloudbase-init` 或手动修复。"
