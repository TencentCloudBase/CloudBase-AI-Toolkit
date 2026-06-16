export interface AuthorizationRecord {
  deviceCode: string;
  userCode: string;
  clientId: string;
  status: 'pending' | 'authorized' | 'consumed' | 'expired';
  uin: string;
  ownerUin: string;
  regionId: string;
  expiresAt: number;
  /** 当通过 CloudBase 托管登录页认证时，记录用户 uid */
  cloudbaseUid?: string;
  /** 为该用户创建的环境 ID */
  envId?: string;
  /** 为该环境签发的 API Key Token（jwt 格式） */
  apiKey?: string;
  /** API Key 的 ID */
  apiKeyId?: string;
}

export interface RefreshTokenRecord {
  refreshToken: string;
  clientId: string;
  uin: string;
  ownerUin: string;
  regionId: string;
  expiresAt: number;
  cloudbaseUid?: string;
  envId?: string;
  apiKey?: string;
  apiKeyId?: string;
}

export interface DeviceCodeRequest {
  client_id?: string;
  scope?: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface VerifyRequest {
  user_code: string;
}

export interface TokenRequest {
  grant_type: 'device_code' | 'refresh_token' | 'revoke_token';
  device_code?: string;
  refresh_token?: string;
  client_id?: string;
}

export interface CloudBaseVerifyRequest {
  user_code: string;
  cloudbase_uid: string;
  cloudbase_access_token: string;
}
