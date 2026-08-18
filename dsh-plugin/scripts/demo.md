# Demo / acceptance script

Target: DSH `>=0.1.0-rc.6 <0.2.0`, local tcb login, plugin built.

## 1. Install

```bash
cd dsh-plugin && npm install && npm test && npm run build
dsh plugin --profile web add .
dsh --profile web --dump-config | grep -E 'cloudbase|mcp-cloudbase'
```

Headless (no `build:web`):

```bash
dsh plugin --profile headless add .
dsh --profile headless "列出所有 mcp__cloudbase__ 工具，然后调用 queryEnv action=list"
```

Expect ~38 `mcp__cloudbase__*` tools and a real EnvList.

## 2. Full-stack todo (PG)

Prompt:

> 帮我做一个全栈待办应用，用 PostgreSQL 存数据，然后部署上线。

Check:

- `downloadTemplate(react)`
- Vite preview URL
- `managePgDatabase` create `todos`
- `queryPgDatabase` → DataTableCard (copy JSON / export CSV)
- `manageHosting upload` → DeployPreviewCard iframe + Open (no rollback button)
- turnTail deliverable row with domain

## 3. Details panel (click every tab)

- 数据库：表树、行数据、SQL（CodeMirror）、运行只读、写操作确认弹窗
- 存储：list + 临时链接提示
- 认证：status + 登录方式（无假数据）
- 配置：完整环境 ID + 复制成功反馈
- 分析：指标卡 SVG、用量产品名（无 FLEXDB/SCF/TDSQL）、最近错误或 CLS 未开通的真实空态
