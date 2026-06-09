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
 * 为指定环境创建一个 API Key
 * @param envId 目标环境 ID
 * @param desc API Key 描述
 */
export async function createApiKey(envId: string, desc: string): Promise<{ apiKeyId: string; apiKey: string }> {
  const client = getClient();
  const result = await client.CreateApiKey({
    EnvId: envId,
    Remark: desc,
  });
  return { apiKeyId: result.ApiKeyId!, apiKey: result.ApiKey! };
}

/**
 * 通过别名查找已有环境
 */
export async function findEnvByAlias(alias: string): Promise<string | null> {
  const envs = await listEnvs();
  const match = envs.find(e => e.Alias === `user-${alias}`);
  return match?.EnvId || null;
}
