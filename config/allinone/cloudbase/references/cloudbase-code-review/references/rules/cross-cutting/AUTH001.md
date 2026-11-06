# AUTH001 路由守卫必须用 `auth.getSession()` 而非 `auth.getUser()`

- **Module**: cross-cutting (auth)
- **Severity**: error
- **Stage**: code-generation
- **适用于**: Web, MiniProgram, Node.js

---

## 正则检查 (Lint)

`references/lint-rules/README.md` 中可选 lint 代码块的扫描条件：

- 查找文件名匹配 `auth | guard | ProtectedRoute | checkAuth` 的文件
- 检查文件内容是否包含 `auth.getUser()`
- 如果发现 `auth.getUser()` 且同一文件 **没有** `getSession`，触发 AUTH001

## LLM 检查

请人工或 LLM 审查以下问题：

1. 项目中的路由守卫（通常是 `ProtectedRoute.tsx` 或类似组件）如何判断用户是否已登录？
2. 是否使用了 `auth.getSession()` 来获取当前会话？
3. 检查 `data?.session` 而非 `data?.user`？

   ```typescript
   // ✅ 正确写法
   const { data } = await auth.getSession()
   if (!data?.session) return <Navigate to="/login" replace />

   // ❌ 错误写法 — getUser() 不是可靠登录证明；显式 signInAnonymously() 后也会返回匿名 user
   const { data } = await auth.getUser()
   if (!data?.user) return <Navigate to="/login" replace />  // 匿名用户会绕过
   ```

4. 是否也检查了 `data.session.user?.is_anonymous` 来排除显式匿名登录？

## 修复指引

1. 在路由守卫中将 `auth.getUser()` 替换为 `auth.getSession()`
2. 将判断条件从 `data?.user` 改为 `data?.session`
3. 可选：增加 `data.session.user?.is_anonymous` 检查

```typescript
const { data, error } = await auth.getSession()
if (error || !data?.session) {
  // 未登录或会话已过期，重定向到登录页
  return <Navigate to="/login" replace />
}
// data.session 存在；若产品不允许匿名，再检查 is_anonymous
```

## 根因

Publishable `accessKey` 仅初始化 SDK，**不会**自动创建可供 gateway 鉴权的匿名会话。`@cloudbase/js-sdk` **3.x** 下 NoSQL `app.database()` CRUD 前必须显式 `await auth.signInAnonymously()`（或等价登录），否则 gateway **401**。

路由守卫侧：不要用 `auth.getUser()` 判断是否已登录——在调用过 `signInAnonymously()` 后它会返回匿名 user，导致「需真实登录」的守卫被绕过；废弃的 `getLoginState()` 甚至可能在未登录时返回误导性 `uid`。应使用 `auth.getSession()`：未登录时 `data.session === undefined`。若产品不允许匿名访问，再检查 `data.session.user?.is_anonymous`。
