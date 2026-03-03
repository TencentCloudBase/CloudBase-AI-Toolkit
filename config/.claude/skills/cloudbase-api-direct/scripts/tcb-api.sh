#!/bin/bash
#
# CloudBase TCB API 通用调用脚本
#
# 使用方式:
#   ./tcb-api.sh --action <Action> [--params <JSON>] [--service <service>]
#
# 环境变量:
#   TENCENTCLOUD_SECRETID   - 腾讯云 SecretId (必填)
#   TENCENTCLOUD_SECRETKEY  - 腾讯云 SecretKey (必填)
#   CLOUDBASE_ENV_ID        - CloudBase 环境 ID (必填)
#
# 示例:
#   ./tcb-api.sh --action DescribeEnvs
#   ./tcb-api.sh --action DescribeDatabaseACL --params '{"EnvId":"xxx","CollectionName":"users"}'
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# 检查并安装依赖
ensure_dependencies() {
    # 检查 lib/node_modules 是否存在
    if [ ! -d "$LIB_DIR/node_modules" ]; then
        echo "📦 Installing dependencies..." >&2
        cd "$LIB_DIR"
        npm install --silent --no-audit --no-fund 2>&1 | grep -v "^npm" >&2 || true
        echo "✅ Dependencies installed" >&2
    fi
}

# 显示帮助
show_help() {
    cat << 'EOF'
CloudBase TCB API 通用调用脚本

使用方式:
  ./tcb-api.sh --action <Action> [选项]

选项:
  -a, --action <name>     API Action 名称 (必填)
  -p, --params <json>     API 参数 JSON 字符串 (默认: {})
  -s, --service <name>    服务类型 (默认: tcb)
  -h, --help              显示帮助

环境变量:
  TENCENTCLOUD_SECRETID   腾讯云 SecretId (必填)
  TENCENTCLOUD_SECRETKEY  腾讯云 SecretKey (必填)
  CLOUDBASE_ENV_ID        CloudBase 环境 ID (必填)

示例:
  # 获取环境列表
  ./tcb-api.sh --action DescribeEnvs

  # 获取数据库权限
  ./tcb-api.sh --action DescribeDatabaseACL --params '{"EnvId":"xxx","CollectionName":"users"}'

  # 调用其他服务
  ./tcb-api.sh --service scf --action ListFunctions --params '{"Namespace":"default"}'
EOF
}

# 主逻辑
main() {
    # 如果是帮助命令，直接显示帮助
    for arg in "$@"; do
        if [ "$arg" = "-h" ] || [ "$arg" = "--help" ]; then
            show_help
            exit 0
        fi
    done
    
    # 检查环境变量
    if [ -z "$TENCENTCLOUD_SECRETID" ] || [ -z "$TENCENTCLOUD_SECRETKEY" ]; then
        echo "❌ 缺少环境变量 TENCENTCLOUD_SECRETID 或 TENCENTCLOUD_SECRETKEY" >&2
        echo "   请设置腾讯云 API 密钥:" >&2
        echo "   export TENCENTCLOUD_SECRETID=\"your-secret-id\"" >&2
        echo "   export TENCENTCLOUD_SECRETKEY=\"your-secret-key\"" >&2
        exit 1
    fi

    if [ -z "$CLOUDBASE_ENV_ID" ]; then
        echo "❌ 缺少环境变量 CLOUDBASE_ENV_ID" >&2
        echo "   请设置 CloudBase 环境 ID:" >&2
        echo "   export CLOUDBASE_ENV_ID=\"your-env-id\"" >&2
        exit 1
    fi
    
    # 确保依赖已安装
    ensure_dependencies
    
    # 调用 TypeScript 脚本
    npx tsx "$LIB_DIR/src/tcb-api.ts" "$@"
}

main "$@"

