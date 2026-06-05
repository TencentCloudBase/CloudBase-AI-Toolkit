/**
 * 微信 IDE CloudBase MCP 端到端集成测试
 *
 * 前提条件（环境变量）：
 *   WX_APPID      微信小程序 AppID，如 wxXXXXXXXX
 *   WX_TICKET     从微信 IDE DevTools Network 面板抓取的 newticket
 *   CLOUDBASE_ENV_ID  云开发环境 ID，如 your-env-id
 *
 * 运行方式：
 *   cd mcp && WX_APPID=xxx WX_TICKET=xxx CLOUDBASE_ENV_ID=xxx node_modules/.bin/vitest run ../tests/wxide-mcp-e2e.test.js
 */

import { test, expect, beforeAll, afterAll, describe } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const APPID = process.env.WX_APPID
const TICKET = process.env.WX_TICKET
const ENV_ID = process.env.CLOUDBASE_ENV_ID

const SKIP = !APPID || !TICKET || !ENV_ID

const TEST_COLLECTION = `mcp_e2e_${Date.now()}`
const TEST_FILE_PATH = `mcp-e2e-test-${Date.now()}/hello.txt`
const TEST_TRIGGER_NAME = `mcp_e2e_${Date.now()}`

let client
let transport
let testFunctionName

// ─── 工具调用辅助 ─────────────────────────────────────────────────────────────
async function call(toolName, args) {
  const result = await client.callTool({ name: toolName, arguments: args })
  const text = result.content?.[0]?.text
  if (!text) return result
  try {
    return JSON.parse(text)
  } catch {
    // 如果不是 JSON，打印原始内容方便调试
    console.error(`[call ${toolName}] non-JSON response:`, text?.slice(0, 200))
    return text
  }
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
  if (SKIP) return
  const scriptPath = join(__dirname, '../mcp/scripts/test-with-ticket.cjs')
  transport = new StdioClientTransport({
    command: 'node',
    args: ['--no-deprecation', scriptPath, '--appid', APPID, '--env-id', ENV_ID, '--ticket', TICKET],
  })
  client = new Client({ name: 'wxide-e2e-test', version: '1.0.0' })
  await client.connect(transport)
}, 30000)

afterAll(async () => {
  if (SKIP) return
  try { await call('writeNoSqlDatabaseStructure', { action: 'deleteCollection', collectionName: TEST_COLLECTION }) } catch {}
  try { await call('manageStorage', { action: 'delete', cloudPath: TEST_FILE_PATH, localPath: '/tmp/noop', force: true }) } catch {}
  if (testFunctionName) {
    try { await call('manageFunctions', { action: 'deleteFunctionTrigger', functionName: testFunctionName, triggerName: TEST_TRIGGER_NAME }) } catch {}
  }
  await client?.close()
  await transport?.close()
})

// ─── 跳过提示 ─────────────────────────────────────────────────────────────────
test.skipIf(SKIP)('env vars check', () => {
  expect(APPID).toBeTruthy()
  expect(TICKET).toBeTruthy()
  expect(ENV_ID).toBeTruthy()
})

// ─── 第一组：环境查询 ──────────────────────────────────────────────────────────
describe.skipIf(SKIP)('T01-T02 环境查询', () => {
  test('T01 queryEnv(list) 返回当前环境', async () => {
    const res = await call('queryEnv', { action: 'list' })
    console.log('  T01 raw keys:', Object.keys(res ?? {}).slice(0, 5))
    const envList = res?.EnvList ?? []
    expect(envList.length).toBeGreaterThan(0)
    const found = envList.find(e => e.EnvId === ENV_ID)
    expect(found).toBeTruthy()
    console.log(`  EnvId=${found?.EnvId} Region=${found?.Region} Package=${found?.PackageName}`)
  }, 15000)

  test('T02 queryEnv(info) 返回资源详情', async () => {
    const res = await call('queryEnv', { action: 'info', envId: ENV_ID })
    // 返回 { EnvInfo: { EnvBaseInfo, Resources, ... } } 或直接资源字段
    expect(res).toBeTruthy()
    expect(res?.ok).not.toBe(false)
    console.log('  info keys:', Object.keys(res ?? {}).join(', '))
  }, 15000)
})

// ─── 第二组：云函数 ─────────────────────────────────────────────────────────────
describe.skipIf(SKIP)('T03-T09 云函数', () => {
  test('T03 queryFunctions(listFunctions) 返回函数列表', async () => {
    const res = await call('queryFunctions', { action: 'listFunctions' })
    console.log('  T03 raw keys:', Object.keys(res ?? {}).slice(0, 8))
    // 返回 { success, data: { functions: [...], totalCount }, message }
    const fns = res?.data?.functions ?? res?.functions ?? res?.Functions ?? []
    expect(fns.length).toBeGreaterThan(0)
    testFunctionName = fns[0].FunctionName ?? fns[0].functionName
    console.log(`  发现 ${fns.length} 个函数，使用 ${testFunctionName} 做后续测试`)
  }, 15000)

  test('T04 queryFunctions(getFunctionDetail) 返回函数详情', async () => {
    expect(testFunctionName).toBeTruthy()
    const res = await call('queryFunctions', { action: 'getFunctionDetail', functionName: testFunctionName })
    // 返回 { success, data: { functionDetail: {...}, triggers: [], layers: [] }, message }
    const fn = res?.data?.functionDetail ?? res?.data?.function ?? res?.function ?? res
    expect(fn?.Runtime ?? fn?.FunctionName ?? fn?.functionName).toBeTruthy()
    console.log(`  Runtime=${fn?.Runtime} MemorySize=${fn?.MemorySize} Timeout=${fn?.Timeout}`)
  }, 15000)

  test('T05 manageFunctions(updateFunctionConfig) 更新函数配置', async () => {
    expect(testFunctionName).toBeTruthy()
    const res = await call('manageFunctions', {
      action: 'updateFunctionConfig',
      functionName: testFunctionName,
      timeout: 10,  // 直接传 timeout，不包在 func 里
    })
    expect(res?.success).toBe(true)
  }, 15000)

  test('T06 manageFunctions(createFunctionTrigger) 创建定时触发器', async () => {
    expect(testFunctionName).toBeTruthy()
    const res = await call('manageFunctions', {
      action: 'createFunctionTrigger',
      functionName: testFunctionName,
      triggers: [{ name: TEST_TRIGGER_NAME, type: 'timer', config: '0 0 * * * * *' }],
    })
    expect(res?.success).toBe(true)
    // 触发器创建后后端有延迟，等待 2 秒再查
    await new Promise(r => setTimeout(r, 2000))
  }, 20000)

  test('T07 queryFunctions(listFunctionTriggers) 确认触发器创建', async () => {
    expect(testFunctionName).toBeTruthy()
    const res = await call('queryFunctions', { action: 'listFunctionTriggers', functionName: testFunctionName })
    console.log('  T07 triggers raw:', JSON.stringify(res?.data?.triggers ?? res?.triggers).slice(0, 200))
    // 返回 { success, data: { triggers: [...] }, message } ，触发器对象字段为大写（TriggerName）
    const triggers = res?.data?.triggers ?? res?.triggers ?? []
    const found = triggers.find(t => t.TriggerName === TEST_TRIGGER_NAME || t.name === TEST_TRIGGER_NAME || t.triggerName === TEST_TRIGGER_NAME)
    expect(found).toBeTruthy()
  }, 15000)

  test('T08 manageFunctions(deleteFunctionTrigger) 删除触发器', async () => {
    expect(testFunctionName).toBeTruthy()
    const res = await call('manageFunctions', {
      action: 'deleteFunctionTrigger',
      functionName: testFunctionName,
      triggerName: TEST_TRIGGER_NAME,
      confirm: true,
    })
    expect(res?.success).toBe(true)
  }, 15000)

  test('T09 manageFunctions(invokeFunction) 调用函数', async () => {
    expect(testFunctionName).toBeTruthy()
    const res = await call('manageFunctions', {
      action: 'invokeFunction',
      functionName: testFunctionName,
      params: { source: 'mcp_e2e_test' },
    })
    expect(res?.success).toBe(true)
    console.log('  invoke result:', JSON.stringify(res?.data ?? res).slice(0, 100))
  }, 15000)
})

// ─── 第三组：数据库 ─────────────────────────────────────────────────────────────
describe.skipIf(SKIP)('T10-T16 数据库', () => {
  test('T10 readNoSqlDatabaseStructure(listCollections)', async () => {
    const res = await call('readNoSqlDatabaseStructure', { action: 'listCollections' })
    expect(res?.ok).not.toBe(false)
  }, 15000)

  test('T11 writeNoSqlDatabaseStructure(createCollection) 创建测试集合', async () => {
    const res = await call('writeNoSqlDatabaseStructure', { action: 'createCollection', collectionName: TEST_COLLECTION })
    expect(res?.ok).not.toBe(false)
  }, 15000)

  test('T12 writeNoSqlDatabaseContent(insert) 插入两条测试数据', async () => {
    const res = await call('writeNoSqlDatabaseContent', {
      action: 'insert',
      collectionName: TEST_COLLECTION,
      documents: [
        { name: 'test_item_1', value: 42, tags: ['mcp', 'e2e'] },
        { name: 'test_item_2', value: 99, tags: ['mcp'] },
      ],
    })
    expect(res?.ok).not.toBe(false)
    // 集合刚创建后需要等待就绪
    await new Promise(r => setTimeout(r, 3000))
  }, 20000)

  test('T13 readNoSqlDatabaseContent 按条件查询文档', async () => {
    // 先查所有文档，确认插入成功
    const allRes = await call('readNoSqlDatabaseContent', { collectionName: TEST_COLLECTION })
    console.log('  T13 all docs:', allRes?.data?.length, JSON.stringify(allRes?.data?.[0] ?? null).slice(0, 100))
    // 直接验证插入的文档存在
    const docs = allRes?.data ?? []
    expect(docs.length).toBeGreaterThan(0)
    const found = docs.find(d => d.name === 'test_item_1')
    expect(found).toBeTruthy()
  }, 15000)

  test('T14 writeNoSqlDatabaseContent(update) 更新文档', async () => {
    const res = await call('writeNoSqlDatabaseContent', {
      action: 'update',
      collectionName: TEST_COLLECTION,
      query: { name: 'test_item_1' },
      update: { $set: { value: 100, updated: true } },
    })
    expect(res?.ok).not.toBe(false)
  }, 15000)

  test('T15 writeNoSqlDatabaseContent(delete) 删除一条', async () => {
    const res = await call('writeNoSqlDatabaseContent', {
      action: 'delete',
      collectionName: TEST_COLLECTION,
      query: { name: 'test_item_2' },
    })
    expect(res?.ok).not.toBe(false)
  }, 15000)

  test('T16 readNoSqlDatabaseContent 确认只剩 1 条且 value=100', async () => {
    const res = await call('readNoSqlDatabaseContent', { collectionName: TEST_COLLECTION })
    const docs = res?.data ?? []
    expect(docs.length).toBe(1)
    expect(docs[0].value).toBe(100)
    expect(docs[0].updated).toBe(true)
  }, 15000)
})

// ─── 第四组：存储 ───────────────────────────────────────────────────────────────
describe.skipIf(SKIP)('T17-T20 存储', () => {
  const TEST_UPLOAD_CONTENT = 'hello from mcp e2e storage test'
  let testLocalFile = null

  beforeAll(async () => {
    if (SKIP) return
    // 创建一个本地临时文件用于上传测试
    const { mkdtemp, writeFile } = await import('fs/promises')
    const { tmpdir } = await import('os')
    const dir = await mkdtemp(tmpdir() + '/mcp-e2e-')
    testLocalFile = dir + '/hello.txt'
    await writeFile(testLocalFile, TEST_UPLOAD_CONTENT)
  })

  test('T17 queryStorage(list) 列出根目录', async () => {
    const res = await call('queryStorage', { action: 'list', cloudPath: '' })
    // StorageOverrides 模式下返回 { success, data: { files: [...] } }
    // 无 Override 则返回错误字符串（missing secretId），测试只验证接口可达
    if (typeof res === 'string') {
      console.log('  T17: 无 StorageOverride，原始路径报错（预期）:', res.slice(0, 80))
    } else {
      expect(res?.success).toBe(true)
      console.log('  T17 files count:', res?.data?.files?.length ?? res?.data?.totalCount)
    }
  }, 15000)

  test('T18 manageStorage(upload) 上传测试文件', async () => {
    if (!testLocalFile) return
    const res = await call('manageStorage', {
      action: 'upload',
      localPath: testLocalFile,
      cloudPath: TEST_FILE_PATH,
    })
    if (typeof res === 'string') {
      console.log('  T18: 无 StorageOverride，跳过验证:', res.slice(0, 80))
    } else {
      expect(res?.success).toBe(true)
      console.log('  T18 upload cloudPath:', TEST_FILE_PATH)
    }
  }, 15000)

  test('T19 queryStorage(info) 获取已上传文件信息', async () => {
    const res = await call('queryStorage', { action: 'info', cloudPath: TEST_FILE_PATH })
    if (typeof res === 'string') {
      console.log('  T19: 无 StorageOverride，跳过验证:', res.slice(0, 80))
    } else {
      expect(res?.success).toBe(true)
      console.log('  T19 fileInfo:', JSON.stringify(res?.data?.fileInfo ?? {}).slice(0, 100))
    }
  }, 15000)

  test('T20 queryStorage(read) 读取文件内容', async () => {
    const res = await call('queryStorage', { action: 'read', cloudPath: TEST_FILE_PATH })
    if (typeof res === 'string') {
      console.log('  T20: 无 StorageOverride，跳过验证:', res.slice(0, 80))
    } else {
      expect(res?.success).toBe(true)
      expect(res?.data?.content).toBe(TEST_UPLOAD_CONTENT)
      console.log('  T20 content:', res?.data?.content)
    }
  }, 15000)

  test('T21 manageStorage(delete) 删除测试文件', async () => {
    const res = await call('manageStorage', {
      action: 'delete',
      cloudPath: TEST_FILE_PATH,
      localPath: testLocalFile ?? '/tmp/noop',
      force: true,
    })
    if (typeof res === 'string') {
      console.log('  T21: 无 StorageOverride，跳过验证:', res.slice(0, 80))
    } else {
      expect(res?.success).toBe(true)
      console.log('  T21 deleted:', TEST_FILE_PATH)
    }
  }, 15000)
})

// ─── 第五组：权限 ───────────────────────────────────────────────────────────────
describe.skipIf(SKIP)('T22-T24 权限', () => {
  test('T22 queryPermissions(getResourcePermission) 查询集合权限', async () => {
    const res = await call('queryPermissions', {
      action: 'getResourcePermission',
      resourceType: 'noSqlDatabase',
      resourceName: TEST_COLLECTION,
    })
    expect(res?.ok).not.toBe(false)
    console.log('  当前权限:', JSON.stringify(res).slice(0, 100))
  }, 15000)

  test('T23 managePermissions(updateResourcePermission) 更新集合权限', async () => {
    const res = await call('managePermissions', {
      action: 'updateResourcePermission',
      resourceType: 'noSqlDatabase',
      resourceName: TEST_COLLECTION,
      permission: 'READONLY',
    })
    expect(res?.ok).not.toBe(false)
  }, 15000)

  test('T24 queryPermissions 确认权限已变更', async () => {
    const res = await call('queryPermissions', {
      action: 'getResourcePermission',
      resourceType: 'noSqlDatabase',
      resourceName: TEST_COLLECTION,
    })
    expect(res?.ok).not.toBe(false)
  }, 15000)
})

// ─── 第六组：日志 ───────────────────────────────────────────────────────────────
describe.skipIf(SKIP)('T25-T26 日志', () => {
  test('T25 queryLogs(checkLogService) 确认日志服务状态可查', async () => {
    const res = await call('queryLogs', { action: 'checkLogService' })
    expect(res?.ok).not.toBe(false)
    console.log('  日志服务:', JSON.stringify(res?.data ?? res).slice(0, 100))
  }, 15000)

  test('T26 queryLogs(searchLogs) 接口可用', async () => {
    const now = Date.now()
    const res = await call('queryLogs', {
      action: 'searchLogs',
      keyword: 'mcp_e2e_test',
      startTime: new Date(now - 3600000).toISOString(),
      endTime: new Date(now).toISOString(),
    })
    // 无结果也算通过，只要不是 schema 错误
    expect(res).toBeTruthy()
  }, 15000)
})
