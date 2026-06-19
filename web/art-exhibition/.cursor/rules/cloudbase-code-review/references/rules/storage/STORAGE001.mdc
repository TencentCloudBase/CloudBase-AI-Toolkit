# STORAGE001 本地开发安全域名必须包含 `localhost:5173`

- **Module**: storage
- **Severity**: error
- **Stage**: config
- **适用于**: Web

---

## 正则检查 (Lint)

`references/lint-rules/README.md` 中可选 lint 代码块的扫描条件：

- 检查项目代码中是否包含 CloudBase 相关引用（`cloudbase` / `tcb` / `upload`）
- 如果是，检查所有文件的内容是否包含 `localhost:5173` 或 `CreateAuthDomain` 或 `authDomain`
- 如果都没有，触发 STORAGE001（仅在项目使用 CloudBase 时触发）

## LLM 检查

请人工或 LLM 审查以下问题：

1. 项目是否使用了 CloudBase 云存储？（上传文件、图片等）
2. 如果是，`localhost:5173`（Vite dev server 默认地址）是否已加入安全域名？
3. 加入方式：
   - 通过 MCP 的 `envDomainManagement` 工具？
   - 通过 CloudBase Console 手动添加？
   - 通过 `CreateAuthDomain` API？
4. 如果有其他开发端口（如 `5174`、`4173`），是否也加了？
5. 生产环境的域名是否也已在安全域名列表中？

## 修复指引

通过 MCP 工具 `envDomainManagement` 添加安全域名，或在 grader `before()` 阶段通过 `CreateAuthDomain` API 添加：

```typescript
// 通过 CreateAuthDomain API
await cloudbase.commonService("tcb", TCB_VERSION).call({
  Action: "CreateAuthDomain",
  Param: {
    EnvId: envId,
    Domains: ["localhost:5173"],
  },
});
```

> 注意：`localhost:5173` 是 Vite 默认 dev server 地址。如果修改了 Vite 配置（如使用 `--port` 或 `--host`），需相应调整。

## 根因

CloudBase 安全域名机制会拦截未注册的 origin 发出的请求。Vite 默认的 `localhost:5173` 不在白名单中，浏览器直传 CloudBase 存储时会因跨域失败。评测环境通过 grader 的 `before()` 预置了该域名，但 agent 在写本地项目时也需要主动配置。
