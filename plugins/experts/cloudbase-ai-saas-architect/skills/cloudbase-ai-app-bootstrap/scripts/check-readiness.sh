#!/usr/bin/env bash
# CloudBase 全栈应用环境就绪检查
# 用法: bash check-readiness.sh [ENV_ID]
#
# 检查项:
#   1. CloudBase 连接器是否已连接
#   2. 用户是否已登录
#   3. EnvId 是否有效（alias 会解析为完整 EnvId）
#
# 注意: 本脚本不能直接调用 MCP 工具，需要在 AI 对话中由 Agent 执行对应的 MCP 调用。
# 本脚本的作用是列出检查清单，Agent 按清单逐项执行。

set -e

ENV_ID="${1:-}"

echo "🔍 CloudBase 全栈应用环境就绪检查"
echo "=================================="
echo ""

# 1. 连接器状态
echo "[1/3] CloudBase 连接器检查"
echo "  在「设置 - 连接器」中确认 CloudBase 已连接"
echo "  AI 执行: 尝试调用 mcp__connector-proxy 的 cloudbase MCP 工具"
echo "  ✅ 通过条件: MCP 工具可正常调用"
echo ""

# 2. 登录态
echo "[2/3] CloudBase 登录态检查"
echo "  AI 执行: 调用 auth 工具确认登录状态"
echo "  ✅ 通过条件: 已通过设备码登录，可获取 access token"
echo ""

# 3. EnvId
echo "[3/3] EnvId 检查"
if [ -z "$ENV_ID" ]; then
  echo "  ⚠️  未传入 EnvId，请向用户确认"
  echo "  AI 执行: envQuery(action=list) 列出可用环境"
else
  echo "  传入 EnvId: $ENV_ID"
  echo "  AI 执行:"
  echo "    - 如果是 alias/短名: envQuery(action=list, alias='$ENV_ID', aliasExact=true) 解析为完整 EnvId"
  echo "    - 如果是完整 EnvId: 直接使用"
fi
echo "  ✅ 通过条件: 拿到完整的 envId (env-xxxxxxx)"
echo ""

echo "=================================="
echo "检查完毕。Agent 按上述清单逐项执行 MCP 调用。"
echo "所有检查通过后，再进入资源准备 + 代码实现阶段。"
echo ""
echo "后续资源准备清单（按场景）:"
echo "  小程序场景: auth-wechat provider + 文档库集合 + 安全规则"
echo "  Web 场景:   auth-web provider (用户名/密码) + PG 建表 + RLS 策略 + 存储域"
echo "  云函数:     runtime 确认 + scf_bootstrap 配置"
echo "  CloudRun:   Dockerfile + CORS + 环境变量"
