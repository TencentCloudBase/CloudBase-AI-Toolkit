import * as tencentcloud from 'tencentcloud-sdk-nodejs-tcb';
import { TENCENTCLOUD_SECRET_ID, TENCENTCLOUD_SECRET_KEY, CLOUDBASE_REGION } from '../config';

const TcbClient = tencentcloud.tcb.v20180608.Client;

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
 * 查询主账号下的所有环境列表
 */
export async function listEnvs(): Promise<Array<{ EnvId: string; Alias: string }>> {
  const client = getClient();
  const result = await client.DescribeEnvs({});
  return result.EnvList || [];
}

/**
 * 为用户创建一个新的 CloudBase 环境（1+N 中的"用户环境"）
 * 注意：此操作需要 TENCENTCLOUD_SECRET_ID 具备 tcb:CreateEnv 权限
 * @param alias 环境别名，建议使用用户标识
 * @returns 新环境 ID
 */
export async function createEnv(alias: string): Promise<string> {
  const client = getClient();
  const result = await client.CreateEnv({
    EnvType: 'MINI',
    Alias: `user-${alias}`,
  });
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
  const params: Record<string, unknown> = {
    EnvId: envId,
    KeyType: 'api_key',
  };
  if (keyName) params.KeyName = keyName;
  if (expireIn) params.ExpireIn = expireIn;

  const result = await client.CreateApiKey(params);
  return { apiKeyId: result.KeyId!, apiKey: result.ApiKey! };
}

/**
 * 通过别名查找已有环境
 */
export async function findEnvByAlias(alias: string): Promise<string | null> {
  const envs = await listEnvs();
  const match = envs.find(e => e.Alias === `user-${alias}`);
  return match?.EnvId || null;
}
