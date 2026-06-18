# cloudbase-lint: CloudBase 代码检查脚本

> 安全说明：本目录不提交可执行脚本文件。下面只提供可审阅的 JavaScript 代码块；仅在用户明确同意时，将其复制到临时本地文件 `cloudbase-lint.mjs` 后运行。

## 使用方法

```bash
# 可选：用户同意后，从下方代码块复制全部内容到临时 cloudbase-lint.mjs
# 然后在项目根目录运行
node cloudbase-lint.mjs --project-dir .
```

## 脚本代码

```javascript
#!/usr/bin/env node

/**
 * cloudbase-lint: CloudBase 项目代码检查脚本
 *
 * 检查 CloudBase 项目中的常见错误：
 * - auth 路由守卫误用（getUser 代替 getSession）
 * - 密码错误 API（signInWithEmailAndPassword 等）
 * - PG 表未创建
 * - 安全域名未配置
 * - 存储 URL 拼接
 * - 已废弃 API 使用
 *
 * 返回 0 表示无错误，返回 1 表示发现问题。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const projectDirIdx = args.indexOf('--project-dir');
const projectDir = projectDirIdx >= 0 ? resolve(args[projectDirIdx + 1]) : process.cwd();

if (!existsSync(projectDir)) {
  console.error(`[cloudbase-lint] project-dir not found: ${projectDir}`);
  process.exit(1);
}

function findSourceFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
      results.push(...findSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx|html|sql|json)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function readFileSafe(filePath) {
  try {
    const stat = statSync(filePath);
    if (stat.size > 1024 * 1024) return '';
    return readFileSync(filePath, 'utf-8');
  } catch { return ''; }
}

const results = [];

function record(ruleId, severity, message, filePath, line) {
  results.push({ ruleId, severity, message, filePath, line });
}

// ─── Auth Rules ─────────────────────────────────────────────────────────────

function checkAuthGetUser(files) {
  const authGuardFiles = files.filter(f =>
    /(auth|guard|ProtectedRoute|checkAuth)/i.test(f) || /auth\.(ts|tsx|js)$/i.test(f)
  );
  for (const file of authGuardFiles) {
    const content = readFileSafe(file);
    if (!content) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/auth\.getUser\s*\(\s*\)/.test(lines[i]) && !content.includes('getSession')) {
        record('AUTH001', 'error',
          `路由守卫中使用 auth.getUser()。accessKey 自动创建匿名会话，getUser() 在未登录时也返回 user 对象。应使用 auth.getSession() 并检查 data?.session。`,
          file, i + 1);
      }
    }
  }
}

function checkEmailPasswordApi(files) {
  const pattern = /sign(?:In|Up)WithEmailAndPassword\s*\(/;
  for (const file of files.filter(f => /auth|login|register|sign/i.test(f))) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (pattern.test(line)) {
        record('AUTH-WEB-004', 'error',
          `用户名场景禁止使用 signInWithEmailAndPassword / signUpWithEmailAndPassword。应使用 auth.signInWithPassword({ username, password }) / auth.signUp({ username, password })`,
          file, i + 1);
      }
    });
  }
}

function checkLoginFormType(files) {
  for (const file of files.filter(f => /login|register/i.test(f))) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (/type\s*=\s*["']email["']/.test(line) && /user|account|用户名|账号/.test(content)) {
        record('AUTH-WEB-005', 'error',
          `登录/注册表单中 input type="email" 不适用于用户名场景。应使用 type="text"。`,
          file, i + 1);
      }
    });
  }
}

function checkPlaceholderAccessKey(files) {
  const pattern = /accessKey\s*:\s*['"]<.+>['"]|accessKey\s*:\s*['"]envId['"]|accessKey\s*:\s*['"]YOUR_/;
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (pattern.test(line)) {
        record('AUTH-WEB-010', 'error',
          `accessKey 被设置为占位符或 envId 字符串。必须使用真实的 publishable key。`,
          file, i + 1);
      }
    });
  }
}

function checkGetLoginState(files) {
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (/getLoginState\s*\(\s*\)/.test(line)) {
        record('AUTH-WEB-012', 'error',
          `使用了已废弃的 auth.getLoginState()。应使用 auth.getSession()。`,
          file, i + 1);
      }
    });
  }
}

function checkOldWebAuthApi(files) {
  const pattern = /auth\.(hasLoginState|getCurrentUser|toDefaultLoginPage)\s*\(/;
  for (const file of files.filter(f => /auth|login|register|guard|ProtectedRoute|App\.(tsx|jsx|ts|js)$/i.test(f))) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (pattern.test(line)) {
        record('AUTH-WEB-013', 'error',
          `使用了旧 CloudBase Web Auth API（hasLoginState/getCurrentUser/toDefaultLoginPage）。应使用 auth.getSession()、signInWithPassword/signInWithOtp/signUp 等 Supabase-like API，并先通过 auth-tool 配置 provider。`,
          file, i + 1);
      }
    });
  }
}

function checkCdnRef(files) {
  for (const file of files.filter(f => /\.html$|index\.html|\.(tsx|jsx)$/i.test(f))) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (/static\.cloudbase\.net.*(cloudbase|tcb)/i.test(line) && /script/i.test(line)) {
        record('AUTH-WEB-017', 'warning',
          `使用了 CDN script 引用。现代 Web 项目应使用 npm install @cloudbase/js-sdk。`,
          file, i + 1);
      }
    });
  }
}

function checkAnonymousSession(files) {
  for (const file of files.filter(f => /auth|guard|ProtectedRoute/i.test(f))) {
    const content = readFileSafe(file);
    if (!content) continue;
    if (content.includes('getSession') && !content.includes('is_anonymous') &&
        /guard|ProtectedRoute|Navigate.*\/login/i.test(content)) {
      record('AUTH-WEB-018', 'warning',
        `路由守卫使用了 getSession() 但未检查匿名用户（data.session.user?.is_anonymous）。`,
        file, 0);
    }
  }
}

function checkOldLoginStrategy(files) {
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (/lowcode.*LoginStrategy|DescribeLoginStrategy|ModifyLoginStrategy/i.test(line)) {
        record('AUTH-TOOL-009', 'error',
          `使用了 lowcode/DescribeLoginStrategy/ModifyLoginStrategy。应使用 DescribeLoginConfig / ModifyLoginConfig。`,
          file, i + 1);
      }
    });
  }
}

// ─── NoSQL Rules ────────────────────────────────────────────────────────────

function checkWxCloudDatabase(files) {
  for (const file of files.filter(f => /app\.(ts|tsx|js|jsx)$|backend\.(ts|tsx|js)$|main\.(ts|tsx|js)$/i.test(f))) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (/wx\.cloud\.database\s*\(/.test(line) && !file.includes('miniprogram') && !file.includes('wx')) {
        record('NOSQL-001', 'error',
          `浏览器代码中使用 wx.cloud.database()。Web 项目必须使用 app.database()。`,
          file, i + 1);
      }
    });
  }
}

function checkOpenidManual(files) {
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (/['"]_openid['"]\s*[:=]\s*['"]/.test(line) && /\.(add|insert|update|set)\s*\(/.test(content)) {
        record('NOSQL-004', 'error',
          `手动设置了 _openid。_openid 由 SDK 自动管理，禁止手动传入。`,
          file, i + 1);
      }
    });
  }
}

function checkAddResultId(files) {
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/\.\s*add\s*\(/.test(lines[i]) && !/\.add\s*\(\s*\)/.test(lines[i])) {
        const ctx = lines.slice(i, i + 5).join('\n');
        if (/result\.id\b/.test(ctx) && !/result\._id\b/.test(ctx)) {
          record('NOSQL-006', 'warning',
            `.add() 返回文档 ID 在 result._id，不是 result.id。`,
            file, i + 1);
        }
      }
    }
  }
}

// ─── Storage Rules ─────────────────────────────────────────────────────────

function checkStorageUrlConcat(files) {
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content) continue;
    content.split('\n').forEach((line, i) => {
      if (/envId.*bucket|bucket.*envId|拼接.*URL|fileID.*\.com\/|tcb\.com\/.*\$\{/i.test(line)) {
        record('STO-002', 'warning',
          `检测到可能的 URL 拼接。上传后应使用 fileID + app.getTempFileURL() 获取可访问 URL。`,
          file, i + 1);
      }
    });
  }
}

function checkLocalhostDomain(files) {
  const all = files.map(f => readFileSafe(f)).join('\n');
  if (!/(uploadFile|upload|cloudbase|tcb)/i.test(all)) return;
  const pkgPath = join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = readFileSafe(pkgPath);
    if (pkg && !all.includes('localhost:5173') && !all.includes('CreateAuthDomain') && !all.includes('authDomain')) {
      record('STORAGE001', 'error',
        '需要将 localhost:5173 加入安全域名，否则浏览器上传会因跨域失败。',
        pkgPath, 0);
    }
  }
}

function checkPgStorageApiRecommendation(files) {
  const all = files.map(f => readFileSafe(f)).join('\n');
  const usesPg = /app\.rdb\s*\(|\.rdb\s*\(|db\s*\.\s*from\s*\(/.test(all);
  if (!usesPg) return;

  for (const file of files.filter(f => /storage|upload|backend/i.test(f))) {
    const content = readFileSafe(file);
    if (!content) continue;
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (/app\.storage\s*\(/.test(line)) {
        record('PG-CR004', 'error',
          'PG Web 文件/图片上传禁止调用 app.storage()；app.storage 是属性。推荐使用 app.storage.from("bucket").upload("key", file)。',
          file, i + 1);
      }
      if (/app\.uploadFile\s*\(/.test(line)) {
        record('PG-CR004', 'warning',
          'PG Web 文件/图片上传不推荐优先使用旧式 app.uploadFile(...)；推荐使用 app.storage.from("bucket").upload("key", file)。',
          file, i + 1);
      }
      if (/\.upload\s*\(\s*\{[^}]*cloudPath|\.upload\s*\(\s*\{[^}]*filePath/.test(line)) {
        record('PG-CR004', 'warning',
          'PG Web Storage 推荐 app.storage.from("bucket").upload("key", file) 参数形态，不推荐 upload({ cloudPath, filePath })。',
          file, i + 1);
      }
      if (/app\.storage\.from\(\s*['"]([^'"]+)['"]\s*\)\.upload\(\s*['"]\1\//.test(line)) {
        record('PG-CR004', 'warning',
          'PG Web Storage 的 bucket 已经传给 from("bucket")，upload("key", file) 的 key 不要重复 bucket 前缀。',
          file, i + 1);
      }
    });
  }
}

// ─── PostgreSQL Rules ───────────────────────────────────────────────────────

function checkCreateTable(files) {
  const tables = new Set();
  const fromPattern = /db\s*\.\s*from\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const file of files) {
    const c = readFileSafe(file);
    if (!c) continue;
    let m;
    while ((m = fromPattern.exec(c)) !== null) tables.add(m[1]);
  }
  if (tables.size === 0) return;
  let hasCreate = false;
  for (const file of files) {
    const c = readFileSafe(file);
    if (!c) continue;
    if (/CREATE\s+TABLE|createTable|create_table|executePgSql|managePgDatabase/i.test(c)) { hasCreate = true; break; }
    if (/\.sql$/i.test(file) && /CREATE\s+TABLE/i.test(readFileSafe(file))) { hasCreate = true; break; }
  }
  if (!hasCreate) {
    for (const t of tables) record('PG-CR001', 'error',
      `代码中使用 db.from("${t}") 但未找到 CREATE TABLE。PG 表不会自动创建。`,
      '', 0);
  }
}

function checkUploadConfig(files) {
  const sf = files.find(f => /storage|upload/i.test(f) || /cms-service|article/i.test(f));
  if (!sf) return;
  const c = readFileSafe(sf);
  if (!c) return;
  if (c.includes('upload') && !c.includes('STORAGE_NOT_EXIST') && !c.includes('getStorage')) {
    const all = files.map(f => readFileSafe(f)).join('\n');
    if (!all.includes('localhost')) record('PG-CR003', 'warning',
      '图片上传需要 localhost:5173 已加入安全域名，否则 CORS 会失败。',
      sf, 0);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.error(`[cloudbase-lint] Scanning: ${projectDir}`);
const files = findSourceFiles(projectDir);
console.error(`[cloudbase-lint] Files: ${files.length}`);

checkAuthGetUser(files);
checkEmailPasswordApi(files);
checkLoginFormType(files);
checkPlaceholderAccessKey(files);
checkGetLoginState(files);
checkOldWebAuthApi(files);
checkCdnRef(files);
checkAnonymousSession(files);
checkOldLoginStrategy(files);
checkWxCloudDatabase(files);
checkOpenidManual(files);
checkAddResultId(files);
checkStorageUrlConcat(files);
checkLocalhostDomain(files);
checkPgStorageApiRecommendation(files);
checkCreateTable(files);
checkUploadConfig(files);

const report = {
  timestamp: new Date().toISOString(),
  projectDir,
  filesScanned: files.length,
  results,
  summary: {
    errors: results.filter(r => r.severity === 'error').length,
    warnings: results.filter(r => r.severity === 'warning').length,
    passed: results.length === 0,
  },
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.summary.errors > 0 ? 1 : 0);
```

## 规则清单

| 规则 ID | 严重性 | 检查内容 |
|---------|--------|---------|
| AUTH001 | error | 路由守卫用 getUser() 而非 getSession() |
| AUTH-WEB-004 | error | 用户名场景用 signInWithEmailAndPassword |
| AUTH-WEB-005 | error | 登录表单 type="email" |
| AUTH-WEB-010 | error | accessKey 设为占位符 |
| AUTH-WEB-012 | error | 使用废弃的 getLoginState() |
| AUTH-WEB-013 | error | 使用旧 Web Auth API（hasLoginState/getCurrentUser/toDefaultLoginPage） |
| AUTH-WEB-017 | warning | CDN 引用而非 npm |
| AUTH-WEB-018 | warning | getSession 缺 is_anonymous 检查 |
| AUTH-TOOL-009 | error | 使用旧的 DescribeLoginStrategy |
| NOSQL-001 | error | Web 代码用 wx.cloud.database() |
| NOSQL-004 | error | 手动设置 _openid |
| NOSQL-006 | warning | .add() 用 result.id 而非 result._id |
| STO-002 | warning | URL 拼接替代 getTempFileURL |
| STORAGE001 | error | 缺少 localhost:5173 安全域名 |
| PG-CR001 | error | db.from() 无对应 CREATE TABLE |
| PG-CR003 | warning | 上传缺少存储配置 |
| PG-CR004 | mixed | PG Web 文件/图片上传推荐 app.storage.from("bucket").upload("key", file)；app.storage() 为错误 |
| PG-CR005 | error | PG 模式下存储上传缺少 storage.objects RLS 配置 |
