# PG-CR002 RLS 策略不能只开启不配置

- **Module**: postgresql
- **Severity**: error
- **Stage**: code-generation
- **适用于**: Web, CloudRun

---

## 正则检查 (Lint)

不支持。RLS 策略的语义检查无法通过正则可靠判断，此规则仅通过 LLM 检查。

## LLM 检查

请人工或 LLM 审查以下问题：

1. 项目中是否在 PG 上启用了行级安全（RLS）？
2. 如果启用了 RLS，是否为每张表创建了对应的策略（policy）？
3. 检查策略是否覆盖了目标业务场景：

| 操作 | admin 策略 | editor 策略 |
|------|-----------|------------|
| SELECT | 所有文章可见 | 所有文章可见（或仅自己的？按需求） |
| INSERT | 可创建 | 可创建（author_id = uid） |
| UPDATE | 可更新所有 | 仅更新自己的（author_id = uid） |
| DELETE | 可删除所有 | 仅删除自己的（author_id = uid） |

4. **检查策略中是否使用了 `current_user` 或 `current_setting(...)`？** 这是常见错误！`current_user` 返回的是数据库角色名（如 `authenticated`），不是 CloudBase 认证用户 ID。必须使用 `auth.uid()`。
5. 检查策略是否使用了 `auth.uid()` 来获取当前用户 ID？
6. 仅开启了 RLS（`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`）但没有创建策略，等于拒绝所有访问。
7. 如果选择不放 RLS 而用在应用层（CRUD 代码中）做权限判断，确认后端/数据库层确实限制了 editor 只能操作自己的文章，而 admin 可以操作全部。

## 修复指引

```sql
-- 开启 RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- admin：所有操作放行（假设 admin 角色记录在业务角色表中）
CREATE POLICY admin_all ON public.articles
  FOR ALL
  USING (auth.uid() IN (
    SELECT uid FROM public.user_roles WHERE role = 'admin'
  ));

-- editor：只能操作自己的文章
CREATE POLICY editor_select ON public.articles
  FOR SELECT
  USING (true);  -- editor 可查看所有

CREATE POLICY editor_insert ON public.articles
  FOR INSERT
  WITH CHECK (author_id = auth.uid());

CREATE POLICY editor_update ON public.articles
  FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY editor_delete ON public.articles
  FOR DELETE
  USING (author_id = auth.uid());
```

## 根因

只执行 `ENABLE ROW LEVEL SECURITY` 而不创建策略，所有操作会被默认拒绝（等同于 `FOR ALL USING (false)`）。agent 经常只做了"开启 RLS"这一步，但没创建实际策略。
