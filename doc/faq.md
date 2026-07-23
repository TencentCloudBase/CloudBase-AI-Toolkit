# 常见问题 FAQ

## CloudBase MCP 是什么？

云开发 CloudBase 是专为 AI Coding 提供的 **AI 原生后端服务**，通过 MCP 协议可以在 AI IDE 内一站式获得数据库、登录认证、云函数、容器托管、网站托管等后端集成和部署能力。换句话说，它把「云开发 CloudBase」变成了一个可以被 AI 直接调用的后端平台，让 AI 不止会写代码，还能帮你完成从数据存储、业务逻辑到上线部署的完整闭环。

CloudBase MCP 可以与多种 AI IDE 配合使用（例如 OpenClaw、Cursor、WindSurf、CodeBuddy、Claude Code、GitHub Copilot 等），只需要简单配置一次 MCP，后续你就可以在这些 IDE 里用自然语言完成：

- 设计和创建数据库表、集合
- 管理文件存储、网站托管和静态资源
- 开发和部署云函数、云托管服务
- 一键完成前后端项目的构建和上线

## 选择 CloudBase 的原因

### 为什么选择 CloudBase？

- **极速部署**：国内节点,访问速度比海外更快
- **稳定可靠**：330 万开发者选择的 Serverless 平台
- **开发友好**：专为AI时代设计的全栈平台，支持自动环境配置
- **成本优化**：Serverless 架构更具弹性，新用户开发期间可以免费体验

## 开始使用

### 我是新用户，如何快速开始？

1. 安装支持的 AI 开发工具（如 OpenClaw、Cursor、WindSurf 等）
2. 在腾讯云开发控制台开通环境（新用户免费）
3. 下载项目模板或在现有项目中配置 MCP
4. 对 AI 说"登录云开发"开始开发

### 支持哪些 AI 开发工具？
支持 CloudBase AI CLI、OpenClaw、Cursor、WindSurf、WorkBuddy、ZCode、Codex App、CodeBuddy、CLINE、GitHub Copilot、Claude Code、Gemini CLI、Codex CLI、OpenCode、Trae、通义灵码、RooCode、文心快码、Augment Code、Qwen Code、iFlow CLI 等主流 AI 开发工具。

## 技术问题


### 已有项目如何集成本模板和规则体系？

如果你已经有自己的项目，只需在配置好 MCP 后，对 AI 说 "在当前项目中下载云开发 AI 规则"，即可一键下载并补全 AI 编辑器规则配置到当前项目目录，无需手动操作。

如果你只想下载特定IDE的配置文件，避免项目文件混乱，可以指定IDE类型：
```
在当前项目中下载云开发 AI 规则，只包含Cursor配置
在当前项目中下载云开发 AI 规则，只包含WindSurf配置
在当前项目中下载云开发 AI 规则，只包含Claude Code配置
```

---

### 如何获取云开发环境 ID？

1. 访问 [腾讯云开发控制台](https://tcb.cloud.tencent.com/dev)开通环境，新用户可以免费开通体验
2. 在控制台「概览」页面右侧获取 **环境ID**  
   （后续部署需要此 ID）

---

### 如何更新 CloudBase AI ToolKit？

**更新 AI 规则**

如果你想在现有项目中更新到最新的云开发 AI 规则，只需对 AI 说：

```
下载云开发 AI 规则在当前项目中更新 rules
```

AI 会自动下载并更新最新的规则配置到你的项目目录。

**更新 MCP 工具**

当有新版本的 MCP 工具发布时，你可以通过以下方式更新：

1. **自动更新（推荐）**：在你的 AI 开发工具的 MCP 列表中，找到 cloudbase 并重新启用或刷新 MCP 列表即可自动安装最新版本

2. **手动更新**：如果自动更新不成功，可以先禁用再重新启用 cloudbase，或者重启你的 AI IDE

**注意事项**：
- MCP 配置中使用了 `@latest` 标签，通常会自动获取最新版本
- 如果遇到缓存问题，可以完全重启 AI IDE 后重新启用 MCP
- 建议定期检查更新以获得最新功能和修复

---

### MCP 显示工具数量为 0 怎么办？

如果在 AI 开发工具的 MCP 列表中看到 cloudbase-mcp 显示工具数量为 0，可以按以下步骤排查：

**1. 检查环境配置**
- 确保 Node.js 版本为 v18.15.0 及以上
- macOS 用户且使用 nvm 管理 Node.js 的，请务必设置默认 Node 版本为 v18.15.0 及以上，避免不同终端版本不一致导致的问题。
- 检查网络连接，建议设置 npm 源为腾讯镜像源：
  ```bash
  npm config set registry https://mirrors.cloud.tencent.com/npm/
  ```

**2. 重新启用 MCP**
- 在 AI 开发工具的 MCP 列表中禁用 cloudbase-mcp
- 重新启用 cloudbase 或刷新 MCP 列表
- 如果仍有问题，完全重启 AI IDE 后重试

**3. 手动重新安装**

一般情况下，在 MCP 列表中重新启用或刷新即可正常安装并显示工具。

参考下方的 如何全局安装 CloudBase MCP？ 的步骤进行操作

---

### MCP 配置后提示 MCP error -32001: Request timed out

如果在配置 MCP 时遇到 `MCP error -32001: Request timed out` 错误，可以按以下步骤解决：

参考下方的 如何全局安装 CloudBase MCP？ 的步骤进行操作

### 如何全局安装 CloudBase MCP？

#### 遇到的问题

在使用 CloudBase MCP 时，你是否遇到过以下问题？

- **安装速度慢** - 使用 `npx` 每次都要重新下载，等待时间过长
- **配置复杂** - 需要手动配置 npm 源、Node.js 版本等环境依赖
- **重复安装** - 在不同 AI IDE 中需要重复配置 MCP 服务
- **网络问题** - npm 安装时经常遇到网络超时或下载失败

#### 解决方案：CloudBase AI CLI 快速安装

推荐使用 **CloudBase AI CLI** 的快速安装方式，一次性解决以下问题：

- 快速安装：相比 npm 安装通常需要几分钟，一键安装脚本只需几秒即可完成
- 统一管理：一个命令管理多种 AI 编程 CLI 工具，包括内置的 CloudBase AI Toolkit MCP
- 使用场景丰富：可在小程序开发者工具、VS Code、GitHub Actions 等环境中运行
- 开箱即用：安装完成后自动配置 MCP 服务，无需额外配置

#### 快速安装步骤

**1. 使用 npm 安装**

```bash
npm install @cloudbase/cli@latest -g
```

**2. 验证安装**

安装完成后，CloudBase AI CLI 会自动安装 CloudBase AI Toolkit MCP 服务，并生成全局命令 `cloudbase-mcp`。

**3. 配置 MCP**

重启你的 AI IDE，然后修改 MCP 配置：

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "cloudbase-mcp"
    }
  }
}
```

**4. 验证 MCP 服务**

可以立即看到 CloudBase MCP 正常启动。

#### 支持的 AI IDE

CloudBase AI CLI 的快速安装方式适用于所有支持 MCP（Model Context Protocol）的 AI IDE，包括但不限于：

- **Cursor** - 基于 VS Code 的 AI 编程助手
- **WindSurf** - 腾讯云推出的 AI 编程工具
- **CodeBuddy** - 智能代码助手
- **Visual Studio Code** - 通过 CodeBuddy 插件支持
- **Claude Code** - Anthropic 的 AI 编程环境
- **GitHub Copilot** - 支持 MCP 的版本
- **其他支持 MCP 的 AI IDE**

这种统一的安装方式让你可以在不同的 AI IDE 之间无缝切换，无需重复配置。

- CodeBuddy中正常配置效果
![](https://qcloudimg.tencent-cloud.cn/raw/3ad6cefbfee790ad3b42eea0cdb752cb.png)

- Visual Studio Code 中 CodeBuddy 插件配置 CloudBase MCP 正常效果
![](https://qcloudimg.tencent-cloud.cn/raw/b6e70f722768d4a844280102378358fe.png)

- Cursor 中正常配置效果
![](https://qcloudimg.tencent-cloud.cn/raw/344fe2c5a96a3e19c6cafc2bcbe73f96.png)

#### 了解更多

CloudBase AI CLI 不仅内置了 CloudBase AI Toolkit MCP，还支持多种主流 AI 编程工具：

- **Claude Code** - Anthropic 的 AI 编程助手
- **OpenAI Codex** - OpenAI 的代码生成工具  
- **aider** - 开源的 AI 编程助手
- **Qwen Code** - 通义灵码

详细使用说明请参考：[CloudBase AI CLI 使用文档](/cli-v1/ai/introduce)

### MCP 配置不生效怎么办？

1. 检查配置格式是否正确
2. 重启 AI IDE
3. 确认 MCP 服务已启用

### Safari 浏览器无法完成授权登录怎么处理？

如果在使用 Safari 浏览器时遇到授权登录问题，建议切换到 Chrome 浏览器进行授权登录。

Safari 浏览器在某些情况下可能存在兼容性问题，影响授权流程的正常进行。Chrome 浏览器对云开发授权流程有更好的支持。

---

### 远程开发环境或服务端如何使用 MCP？

#### 遇到的问题

在远程开发环境中使用 CloudBase AI ToolKit 时，你是否遇到过这些挑战？

- **无法浏览器授权** - 服务器环境没有图形界面，无法完成浏览器登录
- **环境隔离** - 远程环境无法访问本地浏览器进行授权
- **自动化部署** - CI/CD 流水线中需要无交互的配置方式
- **权限管理** - 需要精确控制云开发资源的访问权限

#### 解决方案：环境变量配置

CloudBase AI CLI 支持通过环境变量进行无浏览器授权，完美解决远程环境的使用问题。

#### 安装 CloudBase AI CLI

```bash
npm install @cloudbase/cli@latest -g
```

安装完成后会自动生成 `cloudbase-mcp` 全局命令。

**方式一：CloudBase API Key（推荐）**

API Key 是环境级长期凭证，MCP 会自动换取临时密钥，过期后自动刷新，无需手动管理：

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "cloudbase-mcp",
      "env": {
        "CLOUDBASE_API_KEY": "你的 CloudBase API Key",
        "CLOUDBASE_ENV_ID": "云开发环境 ID"
      }
    }
  }
}
```

> 💡 API Key 可在 [云开发控制台](https://tcb.cloud.tencent.com/dev) 的环境设置中创建和管理。

**方式二：腾讯云 API 密钥**

在 MCP 配置中使用 `env` 环境变量来设置认证信息：

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "cloudbase-mcp",
      "args": ["--integration-ide", "YOUR_IDE"],
      "env": {
        "TENCENTCLOUD_SECRETID": "腾讯云 SecretId",
        "TENCENTCLOUD_SECRETKEY": "腾讯云 SecretKey",
        "TENCENTCLOUD_SESSIONTOKEN": "腾讯云临时密钥Token，如果使用临时密钥才需要传入",
        "CLOUDBASE_ENV_ID": "云开发环境 ID"
      }
    }
  }
}
```

**获取密钥信息：**
- 腾讯云 SecretId 和 SecretKey：在 [腾讯云访问管理控制台](https://console.cloud.tencent.com/cam/capi) 获取
- 云开发环境 ID：在 [腾讯云开发控制台](https://tcb.cloud.tencent.com/dev) 概览页面获取

这种方式特别适用于：
- 远程开发环境（如 GitHub Codespaces、云 IDE 等）
- 服务端自动化脚本
- CI/CD 流水线中的自动化部署

> **安全提示**：如果你需要在远程服务器上部署 MCP 并对外提供 HTTP 接口（而非仅在本机使用），**务必设置 `CLOUDBASE_MCP_CLOUD_MODE=true` 环境变量**。这会自动禁用 `downloadRemoteFile`、`manageCloudRun`（本地运行）、`manageApps`（本地代码上传）等涉及本地文件读写和进程启动的工具，防止远程调用方操作服务器本地资源。详见 [连接方式文档](connection-modes.mdx) 中的"自建服务器部署"章节。

---

### 支持哪些应用类型？

- **Web应用**：现代化前端 + 静态托管
- **微信小程序**：云开发小程序解决方案
- **后端服务**：云数据库 + 无服务器函数+云托管

---

### 开发微信小程序时有什么特别建议？

**推荐开发流程：**

1. **在微信开发者工具中开通云开发环境**
   - 直接在微信开发者工具里开通，确保小程序与云开发环境完美绑定

2. **AI IDE 登录时选择【小程序/公众号】登录**
   - 跳转登录腾讯云云开发时，选择【小程序/公众号】登录
   - 使用你的小程序来登录，而不是腾讯云主账号

这样可以保证权限一致性，避免环境配置问题。

---

### 如何在微信开发者工具中使用 CloudBase AI ToolKit？

CloudBase AI ToolKit 与微信开发者工具可以完美配合使用，提供更高效的开发体验。

#### 方式一：从 AI IDE 开始开发

如果你已经在 AI IDE（如 Cursor、WindSurf、CodeBuddy 等）中开始开发小程序项目：

1. **AI IDE 开发**：在 AI IDE 中使用 CloudBase AI ToolKit 进行代码编写和云开发资源管理
2. **导入微信开发者工具**：在微信开发者工具中导入整个项目文件夹
3. **实时同步**：AI IDE 中的文件变化会实时同步到微信开发者工具
4. **构建预览**：在微信开发者工具中执行构建和预览操作
5. **错误排查**：如果遇到构建或运行错误，可以复制错误信息到 AI IDE 中进行智能排障

**优势：**
- 享受 AI 智能编程的便利
- 利用微信开发者工具的原生调试能力
- 实时预览和真机调试
- 完整的开发工具链

#### 方式二：从微信开发者工具开始

如果你已有微信开发者工具中的小程序项目：

1. **打开项目**：在 AI IDE 中打开现有的小程序项目文件夹
2. **配置 MCP**：参考文档配置 CloudBase MCP 服务
3. **下载 AI 规则**：对 AI 说"下载云开发 AI 规则"获取开发规则
4. **开始 AI 开发**：使用 AI 进行代码编写和云开发资源管理
5. **微信开发者工具预览**：在微信开发者工具中进行实时预览和调试

**工作流程：**
- AI IDE：负责代码编写、云函数开发、数据库设计等
- 微信开发者工具：负责小程序预览、真机调试、性能分析等
- 两者协同工作，发挥各自优势

**注意事项：**
- 确保两个工具打开的是同一个项目文件夹
- 文件保存后会自动同步，无需手动操作
- 建议在 AI IDE 中完成主要开发工作，在微信开发者工具中进行最终测试

---

## 环境管理

### 如何切换云开发环境？

```
退出云开发
登录云开发
```

### 如何切换腾讯云账号？

如果需要切换到不同的腾讯云账号：

1. **清理本地登录态**：对 AI 说 `退出登录`
2. **浏览器退出登录**：到浏览器里面退出原来登录的腾讯云账号
3. **重新登录**：对 AI 说 `登录云开发`

这样就可以切换到新的腾讯云账号了。

### 如何确认当前环境？

```
查询当前云开发环境信息
```

## 问题排查

### 部署失败了怎么办？
把完整的错误信息发给 AI：
```
报错了，错误是xxxx
```

### 云函数运行异常如何调试？
让 AI 查看日志并修复：
```
云函数代码运行不符合需求，需求是 xxx，请查看日志和数据进行调试，并进行修复
```



## 技术交流群

遇到问题或想要交流经验？加入我们的技术社区！

### 🔥 微信交流群

<div align="center">
<img src="https://7463-tcb-advanced-a656fc-1257967285.tcb.qcloud.la/mcp/toolkit-qrcode.png" width="200" alt="微信群二维码"/>
<br/>
<i>扫码加入微信技术交流群</i>
</div>

## 技术支持

### 遇到问题如何获取帮助？

1. 查看常见问题 FAQ
2. 在 [GitHub Issues](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues) 提交问题
3. 加入微信技术交流群获取社区支持

### 如何参与社区？

- 加入微信技术交流群分享项目和交流经验
- 在 GitHub 上 Star 项目并提交 Issue 或 PR
- 关注官方文档获取最新功能更新
