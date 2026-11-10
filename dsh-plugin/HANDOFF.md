# dsh-plugin Handoff

接手先读本文。8 月那份右侧面板 handoff 已作废，不要按它恢复 details 面板、typert 数据通道或把 skill 拷进 `~/.dsh/skills`。

## 现在在哪

- 源码在 `dsh-plugin/`，npm 包 `@cloudbase/dsh-plugin@0.2.4`，`latest` 指向它。
- 兼容范围 `>=0.1.0-rc.6 <0.3.0` 写在 `package.json` 的 `engines.dsh`，DSH 0.2.1+ 在安装与启动时判定。四处文档副本由 `scripts/e2e/verify-dsh-plugin.mjs` 守着一致。
- 已按线上最新宿主 DSH `0.2.2-rc.1` 做过实装验收。`dsh-plugin/scripts/verify-host.mjs` 是可重跑的验收脚本，`npm run verify:host` 是入口。
- `.github/workflows/dsh-host-followup.yml` 每天取线上最新宿主版本跑一次验收；插件相关改动合进 main 时也会跑。运行摘要写明宿主版本、声明范围、结论和上次定时运行时间。
- 发版：在 main 的合并提交上打 `dsh-plugin-vX.Y.Z` tag，触发 `.github/workflows/npm-publish-dsh-plugin.yaml`（OIDC provenance）。轻量 tag 与 annotated tag 都能触发。
- 本机桌面端 profile 在 `~/.dsh/profiles/desktop`。更新插件前先退出 DeepSeek Harness，配置目录由 Electron 占用。

## 已发布

| 版本 | PR | 内容 |
| --- | --- | --- |
| `0.2.0` | [#1111](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/1111) | 父 skill 用 `registerProvider` 注册，all-in-one 构建生成。MCP 改为 `mcp-launch.mjs` 继承 stdio，去掉会话自动 `set_env` 和 `list_bound_envs`。 |
| `0.2.1` | [#1115](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/1115) | 黑底图标 `dsh-plugin/icon.png`。项目目录集中到 `resolveProjectRoot`，落在 `~/.dsh` 下就拒绝。`downloadTemplate` 没有 `targetPath`。 |
| `0.2.2` | [#1117](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/1117) | 简介改成数据库、存储、认证、前后端部署。 |
| `0.2.3` | [#1121](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/1121) | README 去掉 MySQL，兼容范围放宽到 `<0.3.0`。 |
| `0.2.4` | [#1325](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/1325) | 兼容范围写进 `engines.dsh`，四处文档同步并加门禁；README 补发布者、源码、许可、权限与凭据；新增可重跑的宿主验收与每日跟进。 |

## 怎么验

```bash
node scripts/e2e/verify-dsh-plugin.mjs   # 静态契约与四处文档一致
npm run verify:host                      # 需要 DSH_BIN，隔离环境里验装、配置、工具、卸载与升级
```

发布包核对：从 registry 下载 tarball，拆开看 `package/package.json` 的 `engines.dsh`、LICENSE、dist 产物、`cordis.patch.yml` 与图标。

## 发版后要注意

- `npm publish` 返回 `PUT 202` 后会附 "being processed"，官方 registry 约 1–2 分钟收录。本机 npm 默认走国内镜像，会更慢；判断有没有发出去要直查 `registry.npmjs.org` 的 packument（`versions` / `time` / `dist-tags`），别只信本机 `npm view`。
- pnpm 的发布冷却（`minimumReleaseAge`，默认 3 天）会让不写版本号的默认安装在冷却期内拿到上一版。显式写 `@X.Y.Z` 可立刻装到；不要把 `minimumReleaseAge` 改成 0，也不要把安装文档写成写死版本号。
- registry 上的 tarball 名是 `dsh-plugin-X.Y.Z.tgz`，与 publish 日志里本地生成的文件名不同，按后者拼 URL 会 404。

## 不要翻案

- 不恢复右侧 details 面板，也不要为面板做第二套 MCP 进程、`mcp-env-proxy.mjs`、`SessionEnvCache`、`list_bound_envs`。
- 不把 skill 摊平拷进 `~/.dsh/skills`。只注册父 skill `cloudbase`，rank `BUNDLED_SKILL_RANK = 600`。子 skill 是生成目录 `skills/cloudbase/references/*/SKILL.md`，由 `scripts/generate-skills.mjs` 调仓库根的 `scripts/build-allinone-skill.ts`。该目录 gitignore，靠 `dsh-plugin/.npmignore` 打进 npm。不要再注册 31 个 provider。
- `downloadTemplate` 不接受调用方传入的写入路径。相对路径按项目根解析。项目根顺序：显式路径、`WORKSPACE_FOLDER_PATHS`、`PROJECT_ROOT`、`GITHUB_WORKSPACE`、`CI_PROJECT_DIR`、`BUILD_SOURCESDIRECTORY`，最后才是 `process.cwd()`。结果在 `~/.dsh` 下抛 `ProjectRootError`。CloudRun 自己的 `targetPath` 是另一件事，留着。
- 不要在 `cordis.patch.yml` 里写死 `WORKSPACE_FOLDER_PATHS`。一个 MCP 进程服务多个会话。DSH 的对应开关是 MCP 配置的 `cwd`，桌面端进程 cwd 是 `~/.dsh/profiles/desktop`。宿主侧还没做按会话注入。
- 文案不要提 MySQL，后面会下掉。`src/shared/write-op.ts` 里的 MySQL 确认文案先留着，因为 `manageMysqlDatabase` 还在。
- 插件运行时依赖保持为空。MCP 运行时依赖保持精确版本。
- 兼容范围由 `engines.dsh` 声明，不再只是文档串。改范围前先在目标宿主版本上跑一次 `verify:host`，并同步四处文档。

## 边界

- 卡片在浏览器里的像素级渲染尚未验收；客户端注入、MCP 握手与工具表已验。
- 目录条目与官方作者计划的对外提交按各自流程办。
