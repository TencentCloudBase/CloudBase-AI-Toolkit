/**
 * Runtime Validation Test
 *
 * 验证CloudBase Event函数是否支持Python/PHP/Java/Go运行时
 *
 * 运行方式:
 * cd mcp && npm test -- tests/runtime-validation.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';

// Load .env file manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../mcp/.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  });
  console.log('✅ Loaded .env file from:', envPath);
}

// Helper function to delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Detect if real CloudBase credentials are available
function hasCloudBaseCredentials() {
  const secretId = process.env.TENCENTCLOUD_SECRETID || process.env.CLOUDBASE_SECRET_ID;
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY || process.env.CLOUDBASE_SECRET_KEY;
  const envId = process.env.CLOUDBASE_ENV_ID;
  return Boolean(secretId && secretKey && envId);
}

describe('Runtime Validation - Event Function Multi-Language Support', () => {
  let testClient = null;
  let testTransport = null;
  const testFunctionsDir = join(__dirname, '../temp-runtime-test');
  const timestamp = Date.now();

  beforeAll(async () => {
    if (!hasCloudBaseCredentials()) {
      console.log('⚠️ No CloudBase credentials, skipping runtime validation tests');
      return;
    }

    // Create test client
    const client = new Client({
      name: 'runtime-validation-client',
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    const serverPath = join(__dirname, '../mcp/dist/cli.cjs');
    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        ...process.env,
      }
    });

    await client.connect(transport);
    await delay(2000);

    testClient = client;
    testTransport = transport;

    // Create test functions directory
    if (!existsSync(testFunctionsDir)) {
      mkdirSync(testFunctionsDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (testTransport) {
      await testTransport.close();
    }

    // Clean up test directory
    if (existsSync(testFunctionsDir)) {
      rmSync(testFunctionsDir, { recursive: true, force: true });
    }
  });

  // Helper function to create a simple Python Event function
  function createPythonFunction(functionName) {
    const functionDir = join(testFunctionsDir, functionName);
    mkdirSync(functionDir, { recursive: true });

    // Create index.py
    writeFileSync(join(functionDir, 'index.py'), `
def main_handler(event, context):
    return {
        'statusCode': 200,
        'body': 'Hello from Python!'
    }
`);

    return functionDir;
  }

  // Helper function to create a simple PHP Event function
  function createPhpFunction(functionName) {
    const functionDir = join(testFunctionsDir, functionName);
    mkdirSync(functionDir, { recursive: true });

    // Create index.php
    writeFileSync(join(functionDir, 'index.php'), `
<?php
function main_handler($event, $context) {
    return [
        'statusCode' => 200,
        'body' => 'Hello from PHP!'
    ];
}
?>
`);

    return functionDir;
  }

  test.skipIf(!hasCloudBaseCredentials())('Validate Python3.9 runtime support for Event function', async () => {
    if (!testClient) {
      console.log('⚠️ Test client not initialized, skipping');
      return;
    }

    const functionName = `test-python-${timestamp}`;
    const functionDir = createPythonFunction(functionName);

    console.log(`\n📝 Testing Python3.9 runtime for Event function: ${functionName}`);
    console.log(`📁 Function directory: ${functionDir}`);

    try {
      const result = await testClient.callTool({
        name: 'manageFunctions',
        arguments: {
          action: 'createFunction',
          functionRootPath: functionDir,
          force: true,
          func: {
            name: functionName,
            runtime: 'Python3.9',
            type: 'Event',
            handler: 'index.main_handler',
          }
        }
      });

      console.log('✅ Python3.9 Event function creation result:', JSON.stringify(result, null, 2));
      expect(result).toBeDefined();

      // Check if creation was successful or if there's an error
      if (result.isError) {
        console.error('❌ Python3.9 runtime NOT supported for Event functions');
        console.error('Error:', result.content?.[0]?.text || 'Unknown error');
      } else {
        console.log('✅ Python3.9 runtime IS supported for Event functions');
      }

    } catch (error) {
      console.error('❌ Python3.9 Event function creation failed:', error.message);
      throw error;
    }
  });

  test.skipIf(!hasCloudBaseCredentials())('Validate PHP7.4 runtime support for Event function', async () => {
    if (!testClient) {
      console.log('⚠️ Test client not initialized, skipping');
      return;
    }

    const functionName = `test-php-${timestamp}`;
    const functionDir = createPhpFunction(functionName);

    console.log(`\n📝 Testing PHP7.4 runtime for Event function: ${functionName}`);
    console.log(`📁 Function directory: ${functionDir}`);

    try {
      const result = await testClient.callTool({
        name: 'manageFunctions',
        arguments: {
          action: 'createFunction',
          functionRootPath: functionDir,
          force: true,
          func: {
            name: functionName,
            runtime: 'Php7.4',
            type: 'Event',
            handler: 'index.main_handler',
          }
        }
      });

      console.log('✅ PHP7.4 Event function creation result:', JSON.stringify(result, null, 2));
      expect(result).toBeDefined();

      if (result.isError) {
        console.error('❌ PHP7.4 runtime NOT supported for Event functions');
        console.error('Error:', result.content?.[0]?.text || 'Unknown error');
      } else {
        console.log('✅ PHP7.4 runtime IS supported for Event functions');
      }

    } catch (error) {
      console.error('❌ PHP7.4 Event function creation failed:', error.message);
      throw error;
    }
  });

  test.skipIf(!hasCloudBaseCredentials())('Summary: Runtime validation results', async () => {
    if (!testClient) {
      console.log('⚠️ No test client, skipping summary');
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 Runtime Validation Summary');
    console.log('='.repeat(80));
    console.log('');
    console.log('根据测试结果:');
    console.log('');
    console.log('如果Python3.9和PHP7.4都支持:');
    console.log('  ✅ 继续执行方案1 - 移除运行时限制');
    console.log('');
    console.log('如果Python3.9和PHP7.4不支持:');
    console.log('  ⚠️ 调整为方案2 - 引导用户使用HTTP函数');
    console.log('');
    console.log('='.repeat(80));
  });
});
