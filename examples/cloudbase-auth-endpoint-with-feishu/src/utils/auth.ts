import { CLOUDBASE_ENV_ID } from '../config';

/**
 * CloudBase User Info HTTP API 返回结构
 */
export interface CloudBaseUserInfo {
  sub?: string;
  user_id?: string;
  name?: string;
  email?: string;
  providers?: Array<{
    id: string;
    provider_user_id: string;
    name?: string;
  }>;
  status?: string;
}

/**
 * 使用 HTTP API 验证 cloudbase_access_token 并获取用户信息。
 *
 * 对应 API: GET /auth/v1/user/me
 * 文档: https://docs.cloudbase.net/http-api/auth/user-me
 *
 * @param accessToken - 待验证的 CloudBase access_token
 * @returns 用户信息，包含 user_id 和 providers
 * @throws 如果 token 无效或 API 调用失败
 */
export async function verifyCloudBaseAccessToken(
  accessToken: string,
): Promise<CloudBaseUserInfo> {
  const url = `https://tcb.cloud.tencent.com/auth/v1/user/me`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-CloudBase-EnvId': CLOUDBASE_ENV_ID,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `CloudBase token verification failed: ${response.status} ${errorBody}`,
    );
  }

  const userInfo: CloudBaseUserInfo = await response.json() as CloudBaseUserInfo;

  if (!userInfo.user_id && !userInfo.sub) {
    throw new Error('CloudBase token verification: invalid response (missing user_id)');
  }

  return userInfo;
}
