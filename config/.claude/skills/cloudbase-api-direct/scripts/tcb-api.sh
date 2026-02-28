#!/bin/bash
#
# CloudBase TCB API 通用调用脚本
#
# 使用方式:
#   ./tcb-api.sh --action <Action> [--params <JSON>] [--service <service>]
#
# 环境变量:
#   SECRET_ID   - 腾讯云 SecretId (必填)
#   SECRET_KEY  - 腾讯云 SecretKey (必填)
#   ENV_ID      - CloudBase 环境 ID (可选)
#
# 示例:
#   ./tcb-api.sh --action DescribeEnvs
#   ./tcb-api.sh --action DescribeDatabaseACL --params '{"EnvId":"xxx","CollectionName":"users"}'
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_MODULES_DIR="$SCRIPT_DIR/node_modules"
PACKAGE_JSON="$SCRIPT_DIR/package.json"

# 检查并安装依赖
ensure_dependencies() {
    # 检查 node_modules 是否存在
    if [ ! -d "$NODE_MODULES_DIR" ] || [ ! -d "$NODE_MODULES_DIR/@cloudbase/manager-node" ]; then
        echo "📦 Installing dependencies..." >&2
        
        # 如果没有 package.json，创建一个
        if [ ! -f "$PACKAGE_JSON" ]; then
            cat > "$PACKAGE_JSON" << 'EOF'
{
  "name": "tcb-api-scripts",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@cloudbase/manager-node": "^4.0.0"
  }
}
EOF
        fi
        
        # 安装依赖
        cd "$SCRIPT_DIR"
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
  -e, --env-id <id>       环境 ID (默认: 从 ENV_ID 环境变量读取)
  -h, --help              显示帮助

环境变量:
  SECRET_ID               腾讯云 SecretId (必填)
  SECRET_KEY              腾讯云 SecretKey (必填)
  ENV_ID                  CloudBase 环境 ID (可选)

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
    if [ -z "$SECRET_ID" ] || [ -z "$SECRET_KEY" ]; then
        echo "❌ 缺少环境变量 SECRET_ID 或 SECRET_KEY" >&2
        echo "   请设置腾讯云 API 密钥:" >&2
        echo "   export SECRET_ID=\"your-secret-id\"" >&2
        echo "   export SECRET_KEY=\"your-secret-key\"" >&2
        exit 1
    fi
    
    # 确保依赖已安装
    ensure_dependencies
    
    # 调用 TypeScript 脚本
    npx tsx "$SCRIPT_DIR/lib/tcb-api.ts" "$@"
}

main "$@"

