---
name: cloudbase-api-direct
description: "Direct CloudBase API calling guide and scripts. Use this skill when: (1) calling CloudBase TCB APIs directly, (2) environments without SDK support (native apps, backend services), (3) testing or debugging CloudBase APIs, (4) managing CloudBase resources programmatically."
alwaysApply: false
---

# CloudBase API Direct Calling (直接调用 CloudBase API)

本技能提供直接调用腾讯云 CloudBase API 的工具和文档。

## When to use this skill

- 需要直接调用 CloudBase API（测试、调试、自动化）
- 开发无 SDK 支持的平台（iOS、Android、Flutter、Go、Rust 等）
- 需要查阅 API 文档了解参数和返回值

**不适用于**：Web/小程序/Node.js 开发（请使用对应的 SDK skill）

---

## 🚀 快速调用 API（推荐）

使用 `scripts/tcb-api.sh` 脚本直接调用 API，**无需手动计算签名**，**自动安装依赖**。

### 前置条件

设置环境变量：
```bash
export TENCENTCLOUD_SECRETID="your-secret-id"
export TENCENTCLOUD_SECRETKEY="your-secret-key"
export CLOUDBASE_ENV_ID="your-env-id"
```

### 使用方式

```bash
{baseDir}/scripts/tcb-api.sh --action <Action> [--params <JSON>]
```

### 示例

```bash
# 获取环境列表
{baseDir}/scripts/tcb-api.sh --action DescribeEnvs

# 获取数据库权限
{baseDir}/scripts/tcb-api.sh --action DescribeDatabaseACL \
  --params '{"CollectionName":"users"}'

# 查询数据库表
{baseDir}/scripts/tcb-api.sh --action DescribeDatabases

# 调用其他云服务（如 SCF）
{baseDir}/scripts/tcb-api.sh --service scf --action ListFunctions \
  --params '{"Namespace":"default"}'
```

### 脚本参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--action, -a` | API Action 名称 | 必填 |
| `--params, -p` | API 参数 JSON | `{}` |
| `--service, -s` | 服务类型 | `tcb` |
| `--help, -h` | 显示帮助 | - |

---

## 📖 查找 API 文档

**所有 CloudBase API 的详细文档都在 `references/` 目录中。**

### 查找步骤

1. **查看 API 概览**：阅读 `references/34809-云开发-CloudBase-API-概览_腾讯云.md` 了解所有可用的 API
2. **按功能搜索**：在 `references/` 目录中搜索关键词（如 "环境"、"数据库"、"MySQL"、"托管" 等）
3. **阅读具体文档**：每个 API 文档包含完整的输入参数、输出参数说明

### 文档命名规则

文件名格式：`{文档ID}-{API描述}.md`

例如：
- `34820-云开发-CloudBase-获取环境列表_腾讯云.md`
- `127880-云开发-CloudBase-执行SQL语句_腾讯云.md`

---

## ⚠️ 注意事项

1. **签名自动处理**：脚本已内置 TC3-HMAC-SHA256 签名算法，无需手动计算
2. **密钥安全**：不要将 SecretKey 硬编码在代码中
3. **频率限制**：默认 100 次/秒
