# dsh-plugin Handoff 2026-09-30

接手先读本文。8 月那份右侧面板 handoff 已作废，不要按它恢复 details 面板、typert 数据通道或把 skill 拷进 `~/.dsh/skills`。

## 现在在哪

- 仓库 `~/Projects/CloudBase-MCP`，分支 `main`，HEAD `4f7989301`。
- 插件 `@cloudbase/dsh-plugin@0.2.2`，npm `latest` 已是这一版。
- MCP `@cloudbase/cloudbase-mcp@2.34.7`，npm `latest` 已是这一版。启动器写死 `npx @cloudbase/cloudbase-mcp@latest`，项目根修复靠 MCP 发版，不靠插件版本。
- 本机桌面端：`/Applications/DeepSeek Harness.app`，版本 `0.2.0-rc.2`（feed 没有更新的包）。插件装在 `~/.dsh/profiles/desktop`，已是 `0.2.2`。
- 列表简介：`CloudBase backend for DeepSeek Harness — database, storage, authentication, and frontend/backend deployment`。

## 已发布

| 版本 | PR | 内容 |
| --- | --- | --- |
| 插件 `0.2.0` | [#1111](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/1111) | 父 skill 用 `registerProvider` 注册，all-in-one 构建生成。MCP 改为 `mcp-launch.mjs` 继承 stdio，去掉会话自动 `set_env` 和 `list_bound_envs`。 |
| 插件 `0.2.1` + MCP `2.34.7` | [#1115](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/1115) | 黑底图标 `dsh-plugin/icon.png`。项目目录集中到 `resolveProjectRoot`，落在 `~/.dsh` 下就拒绝。`downloadTemplate` 没有 `targetPath`。 |
| 插件 `0.2.2` | [#1117](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/1117) | 简介改成数据库、存储、认证、前后端部署。 |

发版：从 `main` 切功能分支，合进 `main` 后在合并提交上打 tag。插件 tag 是 `dsh-plugin-vX.Y.Z`，MCP tag 是 `vX.Y.Z`。现在 tag push 会自己触发 `.github/workflows/npm-publish-dsh-plugin.yaml` 和 `npm-publish.yaml`。`0.2.0` 那次 tag 没触发，是手动 `workflow_dispatch`；`0.2.1` / `0.2.2` 已自动跑通。npm 返回 “may take a few minutes” 后，`registry.npmjs.org` 会先于本机 `npm view` 缓存看到新版本。

## 未提交

- `dsh-plugin/README.md`：数据库那句已改成「文档库和 PostgreSQL」。npm `0.2.2` 的 README 仍写着 MySQL。简介字段本身没有 MySQL。要让安装包里的 README 一致，需要再发 `0.2.3`。
- `skills/git-workflows/references/source-commands.md` 有一份无关改动，不要带进 DSH 提交。

## 不要翻案

- 不恢复右侧 details 面板，也不要为面板做第二套 MCP 进程、`mcp-env-proxy.mjs`、`SessionEnvCache`、`list_bound_envs`。
- 不把 skill 摊平拷进 `~/.dsh/skills`。只注册父 skill `cloudbase`，rank `BUNDLED_SKILL_RANK = 600`。子 skill 是生成目录 `skills/cloudbase/references/*/SKILL.md`，由 `scripts/generate-skills.mjs` 调仓库根的 `scripts/build-allinone-skill.ts`。该目录 gitignore，靠 `dsh-plugin/.npmignore` 打进 npm。不要再注册 31 个 provider。
- `downloadTemplate` 不接受调用方传入的写入路径。相对路径按项目根解析。项目根顺序：显式路径、`WORKSPACE_FOLDER_PATHS`、`PROJECT_ROOT`、`GITHUB_WORKSPACE`、`CI_PROJECT_DIR`、`BUILD_SOURCESDIRECTORY`，最后才是 `process.cwd()`。结果在 `~/.dsh` 下抛 `ProjectRootError`。CloudRun 自己的 `targetPath` 是另一件事，留着。
- 不要在 `cordis.patch.yml` 里写死 `WORKSPACE_FOLDER_PATHS`。一个 MCP 进程服务多个会话。DSH 的对应开关是 MCP 配置的 `cwd`，桌面端进程 cwd 是 `~/.dsh/profiles/desktop`。宿主侧还没做按会话注入。
- 文案不要提 MySQL，后面会下掉。`src/shared/write-op.ts` 里的 MySQL 确认文案先留着，因为 `manageMysqlDatabase` 还在。
- 插件运行时依赖保持为空。MCP 运行时依赖保持精确版本。
- 兼容串 `DSH_COMPAT` 仍是 `>=0.1.0-rc.6 <0.2.0`（`src/shared/constants.ts`、README、AGENTS.md、`scripts/demo.md`）。它只是文档，不是安装门槛。桌面端 `0.2.0-rc.2` 已经验证父 skill、子 skill 和 MCP 调用可用。若改，上限至少放到 `<0.3.0`，并写明 `0.2.0-rc.2` 已验证。

## 本机桌面端

更新插件前先退出 DeepSeek Harness，配置目录由 Electron 占用。

```bash
osascript -e 'quit app "DeepSeek Harness"'
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add @cloudbase/dsh-plugin@<version>
open -a "DeepSeek Harness"
```

pnpm 有约 24 小时的 `minimumReleaseAge`。刚发布的版本会被拒。`~/.dsh/profiles/desktop/pnpm-workspace.yaml` 里已有 `0.2.0` / `0.2.1` / `0.2.2` 的 `minimumReleaseAgeExclude`。`dsh plugin add 0.2.2` 仍在校验旧 lockfile 时拒绝了 `0.2.1`。当时绕过的办法是在 profile 目录执行：

```bash
node "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/pnpm/bin/pnpm.mjs" \
  add @cloudbase/dsh-plugin@0.2.2 --config.minimumReleaseAge=0
```

这个 flag 没有写进 profile 配置。不要把 `minimumReleaseAge` 永久改成 0。

`downloadTemplate` 曾经把模板写进 `~/.dsh/profiles/desktop/`（`src/`、`public/`、`cloudfunctions/`、`index.html`、`cloudbaserc.json` 等）。这些文件还在。不要删 profile 自己的 `cordis.yml`、`cordis.patch.yml`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`node_modules`、`.npmrc`、`.plugin-manager`。

## 下一步

1. 若要让已安装的 README 去掉 MySQL，发插件 `0.2.3`。只含 `dsh-plugin/README.md`。
2. 兼容范围从 `<0.2.0` 提到至少 `<0.3.0`。四处一起改：`DSH_COMPAT`、README、AGENTS.md、`scripts/demo.md`。
3. 宿主按会话把工作区交给 MCP（`cwd` 或等价环境），而不是在 patch 里写死一个路径。
4. 把误下到 `~/.dsh/profiles/desktop/` 的模板文件移走。先跟用户确认哪些是模板。
