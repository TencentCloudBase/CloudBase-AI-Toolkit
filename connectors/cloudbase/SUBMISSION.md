# cloudbase 连接器（国内站）提交说明

WorkBuddy 连接器，`source = cloudbase`，市场 id `cloudbase`。
平台资产：`oc_3aab57c3456a918f`（主体 `org_zhw4mj8x`，腾讯云CloudBase）。

## 为什么单独一个包

国内站连接器原先由内部市场分发（`connector-plugins-internal.zip`），2026-10-28 起改为在
open.workbuddy.cn 自助提审，和专家包走同一套流程。这个目录就是它的提审源。

国际站是另一个连接器（[`../cloudbase-intl`](../cloudbase-intl)），`source = cloudbase-intl`，
独立资产独立版本——两个包共用 `config/source/**` 这一份内容源，打包时各自动各自的区域改写。

## 怎么重新打包

```bash
pnpm run build:connector        # → dist/cloudbase-connector.zip
```

构建会做四件事：跑 `scripts/build-allinone-skill.ts` 把 `config/source/**` 聚合成一个技能 →
拷进 `skills/` → 给每个技能入口补回 `LICENSE.md` → 校验并打包。

版本号在 `connector-meta.json` 的 `version`。内容一改就必须递增，否则提审报
「包内版本号必须大于当前最新版本」。main 上的 `bump-connector-versions.mjs` 会在重建后自动 patch +1。

## `skills/` 是生成物

不要手改 `connectors/cloudbase/skills/**`，改 `config/source/**` 再重新构建，并且**在同一个 commit
里提交重新生成的树**——它和仓库里其它生成镜像一样，漂了就没人发现。

## 关于每个技能目录里的 LICENSE.md

`build-allinone-skill.ts` 会主动丢掉 35 份重复的 `LICENSE.md`（它自己的 bundle 只需要根目录一份，
少带这些能让 all-in-one 少 35 个文件）。但连接器提审读的是**技能入口同级的那份 LICENSE**——
只写 frontmatter 会被判缺失。所以构建脚本在聚合之后又把它们补回去，这一步不能省。

## 提交时要在市场侧登记的字段

`id` 与 `visible_in` 不在 `connector-meta.json` 里（文档的 meta 字段表里没有这两项），
只能在提交时写进市场配置。构建日志每次都会把这两个值打出来，照抄即可：

```
id         = "cloudbase"
visible_in = ["internal", "iOA", "cloudhosted", "selfhosted"]
```

## 包的形态

```
connectors/cloudbase/
├── connector-meta.json   # 名称/描述/示例/source/type/version/minWorkbuddyVersion
├── mcp.json              # 单 server：npx -y @cloudbase/npm-launcher@1.1.0 @cloudbase/cloudbase-mcp@latest（stdio）
├── cli.json              # tcb 的 init / auth / status / unAuth，preAuth 用
├── icon.svg              # 市场图标（源自 scripts/cloudbase-logo.svg）
└── skills/               # 生成物：SKILL.md + references/（31 个子技能）
```

`mcp.json` 里有四个字段值得别动，动了就踩坑：

| 字段 | 为什么 |
| --- | --- |
| `timeout: 150000` | 首次运行由 launcher 在后台下载约 20 MB 的 MCP 包，前台最多等待 120 秒；默认 30 秒不够，也不能短于这段等待 |
| `npmRegistries` | 国内优先 npmmirror、官方兜底；客户端按序回退 |
| `env.CLOUDBASE_MCP_CLIENT` | 遥测的 `client` 来源标识，缺了统计里分不出 WorkBuddy |
| `preAuth: "cli"` | 连接前先跑 `cli.json` 的认证；`cli.json` 本身不是另一种接入方式 |
