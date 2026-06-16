import { createHash } from 'crypto';
import * as tencentcloud from 'tencentcloud-sdk-nodejs-tcb';
import {
  TENCENTCLOUD_SECRET_ID,
  TENCENTCLOUD_SECRET_KEY,
  CLOUDBASE_REGION,
  CLOUDBASE_USER_ENV_AUTO_VOUCHER,
  CLOUDBASE_USER_ENV_PACKAGE_ID,
  CLOUDBASE_USER_ENV_PERIOD,
  CLOUDBASE_USER_ENV_READY_TIMEOUT_MS,
  CLOUDBASE_USER_ENV_RESOURCES,
} from '../config';

const TcbClient = tencentcloud.tcb.v20180608.Client;
const ENV_READY_POLL_INTERVAL_MS = 5_000;

function getClient(): InstanceType<typeof TcbClient> {
  return new TcbClient({
    credential: {
      secretId: TENCENTCLOUD_SECRET_ID,
      secretKey: TENCENTCLOUD_SECRET_KEY,
    },
    region: CLOUDBASE_REGION,
  });
}

/**
 * 生成符合 CreateEnv Alias 契约的用户环境别名。
 * CreateEnv 要求 Alias 仅包含小写字母、数字、减号，且长度不超过 20 位。
 */
function getUserEnvAlias(subject: string): string {
  const digest = createHash('sha256').update(subject).digest('hex').slice(0, 18);
  return `u-${digest}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 查询主账号下的所有环境列表
 */
export async function listEnvs(): Promise<Array<{ EnvId: string; Alias: string; Status?: string }>> {
  const client = getClient();
  const result = await client.DescribeEnvs({});
  return (result.EnvList || [])
    .filter(env => env.EnvId && env.Alias)
    .map(env => ({ EnvId: env.EnvId!, Alias: env.Alias!, Status: env.Status }));
}

async function waitForEnvReady(envId: string): Promise<void> {
  const client = getClient();
  const deadline = Date.now() + CLOUDBASE_USER_ENV_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await client.DescribeEnvs({ EnvId: envId });
    const env = result.EnvList?.find(item => item.EnvId === envId) || result.EnvList?.[0];
    if (env?.Status === 'NORMAL') return;
    await sleep(ENV_READY_POLL_INTERVAL_MS);
  }

  throw new Error(`CloudBase environment ${envId} is not ready before timeout`);
}

/**
 * 为用户创建一个新的 CloudBase 环境（1+N 中的"用户环境"）
 * 注意：此操作需要 TENCENTCLOUD_SECRET_ID 具备 tcb:CreateEnv 权限
 * @param subject 用户稳定身份标识
 * @returns 新环境 ID
 */
export async function createEnv(subject: string): Promise<string> {
  const client = getClient();
  const result = await client.CreateEnv({
    Alias: getUserEnvAlias(subject),
    PackageId: CLOUDBASE_USER_ENV_PACKAGE_ID,
    Resources: CLOUDBASE_USER_ENV_RESOURCES,
    Period: CLOUDBASE_USER_ENV_PERIOD,
    AutoVoucher: CLOUDBASE_USER_ENV_AUTO_VOUCHER,
  });

  if (!result.EnvId) {
    throw new Error('CreateEnv did not return EnvId');
  }

  await waitForEnvReady(result.EnvId);
  return result.EnvId;
}

/**
 * 为指定环境创建 API Key（服务端管理员凭证）
 * 该 key 以管理员身份签发，拥有该环境完整数据流权限（数据库/云函数/存储/托管等）
 * 支持设置有效期，不设置则永不过期；单环境最多创建 5 个 api_key
 *
 * @see https://cloud.tencent.com/document/api/876/129835
 *
 * @param envId 目标环境 ID
 * @param keyName 密钥名称（可选）
 * @param expireIn 有效期（秒），不传则永不过期。最短 7200 秒
 */
export async function createApiKey(
  envId: string,
  keyName?: string,
  expireIn?: number,
): Promise<{ apiKeyId: string; apiKey: string }> {
  const client = getClient();
  const params = {
    EnvId: envId,
    KeyType: 'api_key',
    ...(keyName ? { KeyName: keyName } : {}),
    ...(expireIn ? { ExpireIn: expireIn } : {}),
  };

  const result = await client.CreateApiKey(params);
  if (!result.KeyId || !result.ApiKey) {
    throw new Error('CreateApiKey did not return KeyId or ApiKey');
  }

  return { apiKeyId: result.KeyId, apiKey: result.ApiKey };
}

/**
 * 通过用户稳定身份标识查找已有环境
 */
export async function findEnvByAlias(subject: string): Promise<string | null> {
  const envs = await listEnvs();
  const match = envs.find(e => e.Alias === getUserEnvAlias(subject));
  if (match?.EnvId && match.Status !== 'NORMAL') {
    await waitForEnvReady(match.EnvId);
  }
  return match?.EnvId || null;
}
