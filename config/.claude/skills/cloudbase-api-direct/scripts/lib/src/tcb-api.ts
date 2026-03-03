#!/usr/bin/env npx tsx
/**
 * CloudBase TCB API 通用调用脚本
 *
 * 使用方式:
 *   npx tsx tcb-api.ts --action <Action> [--params <JSON>] [--service <service>]
 *
 * 环境变量:
 *   TENCENTCLOUD_SECRETID   - 腾讯云 SecretId (必填)
 *   TENCENTCLOUD_SECRETKEY  - 腾讯云 SecretKey (必填)
 *   CLOUDBASE_ENV_ID        - CloudBase 环境 ID (必填)
 *
 * 示例:
 *   npx tsx tcb-api.ts --action DescribeEnvs
 *   npx tsx tcb-api.ts --action DescribeDatabaseACL --params '{"CollectionName":"users"}'
 */

import CloudBase from './index'

interface CliArgs {
  action: string
  params: Record<string, any>
  service: string
  version?: string
  envId?: string
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const result: CliArgs = {
    action: '',
    params: {},
    service: 'tcb',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]

    switch (arg) {
      case '--action':
      case '-a':
        result.action = next || ''
        i++
        break
      case '--params':
      case '-p':
        try {
          result.params = JSON.parse(next || '{}')
        } catch {
          console.error('❌ 无效的 JSON 参数:', next)
          process.exit(1)
        }
        i++
        break
      case '--service':
      case '-s':
        result.service = next || 'tcb'
        i++
        break
      case '--version':
      case '-v':
        result.version = next
        i++
        break
      case '--env-id':
      case '-e':
        result.envId = next
        i++
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }

  return result
}

function printHelp() {
  console.log(`
CloudBase TCB API 通用调用脚本

使用方式:
  npx tsx tcb-api.ts --action <Action> [选项]

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
  npx tsx tcb-api.ts --action DescribeEnvs

  # 获取数据库权限
  npx tsx tcb-api.ts --action DescribeDatabaseACL --params '{"CollectionName":"users"}'

  # 调用其他服务
  npx tsx tcb-api.ts --service scf --action ListFunctions --params '{"Namespace":"default"}'
`)
}

// 未对外的云API，禁止使用
const tcbCapiForbidList = ['DescribeStorageACL', 'ModifyStorageACL'];

async function main() {
  const { action, params, service, version, envId } = parseArgs()

  // 验证必填参数
  if (!action) {
    console.error('❌ 缺少必填参数 --action')
    console.error('   使用 --help 查看帮助')
    process.exit(1)
  }

  const secretId = process.env.TENCENTCLOUD_SECRETID
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY
  const defaultEnvId = envId || process.env.CLOUDBASE_ENV_ID

  if (!secretId || !secretKey) {
    console.error('❌ 缺少环境变量 TENCENTCLOUD_SECRETID 或 TENCENTCLOUD_SECRETKEY')
    console.error('   请设置腾讯云 API 密钥:')
    console.error('   export TENCENTCLOUD_SECRETID="your-secret-id"')
    console.error('   export TENCENTCLOUD_SECRETKEY="your-secret-key"')
    process.exit(1)
  }

  if (!defaultEnvId) {
    console.error('❌ 缺少环境变量 CLOUDBASE_ENV_ID')
    console.error('   请设置 CloudBase 环境 ID:')
    console.error('   export CLOUDBASE_ENV_ID="your-env-id"')
    process.exit(1)
  }

  // 初始化 CloudBase Manager
  const manager = new CloudBase({
    secretId,
    secretKey,
    envId: defaultEnvId,
  })

  try {
    if (service === 'tcb') {
      if (tcbCapiForbidList.includes(action)) {
        console.error(`❌  ${service}/${action} 云API未对外或不存在，请使用其他API`)
        process.exit(1)
      }
    }
    console.error(`📡 调用 ${service}.${action}...`)

    const result = await manager.commonService(service, version).call({
      Action: action,
      Param: params,
    })

    // 输出 JSON 结果到 stdout
    console.log(JSON.stringify(result, null, 2))
  } catch (error: any) {
    console.error(`❌ API 调用失败: ${error.message}`)
    if (error.requestId) {
      console.error(`   RequestId: ${error.requestId}`)
    }
    if (error.code) {
      console.error(`   ErrorCode: ${error.code}`)
    }
    process.exit(1)
  }
}

main()

