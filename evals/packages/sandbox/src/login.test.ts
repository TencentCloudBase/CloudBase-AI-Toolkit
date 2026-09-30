import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMcpConfig, readCloudBaseCreds } from './login.ts';

test('creds are absent unless env id and both secrets are set', () => {
  assert.equal(readCloudBaseCreds({}), undefined);
  assert.equal(readCloudBaseCreds({ CLOUDBASE_ENV_ID: 'env-1' }), undefined);
});

test('mcp config carries the same login env the old eval repo injects', () => {
  const config = JSON.parse(
    buildMcpConfig({ envId: 'env-1', secretId: 'sid', secretKey: 'skey' }),
  ) as { mcpServers: { cloudbase: { env: Record<string, string> } } };
  const env = config.mcpServers.cloudbase.env;
  assert.equal(env.CLOUDBASE_ENV_ID, 'env-1');
  assert.equal(env.TENCENTCLOUD_SECRETID, 'sid');
  assert.equal(env.TENCENTCLOUD_SECRETKEY, 'skey');
  assert.equal(env.CLOUDBASE_EVALUATE_MODE, '1');
});
