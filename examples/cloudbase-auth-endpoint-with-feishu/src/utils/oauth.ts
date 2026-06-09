import { randomBytes } from 'crypto';

/**
 * 生成设备码（device_code）—— 随机字符串，供客户端轮询用
 */
export function generateDeviceCode(): string {
  return randomBytes(32).toString('hex');
}

/**
 * 生成用户码（user_code）—— 简短易输入格式：XXXX-XXXX
 */
export function generateUserCode(): string {
  const segment1 = randomBytes(2).readUInt16BE(0) % 10000;
  const segment2 = randomBytes(2).readUInt16BE(0) % 10000;
  return `${String(segment1).padStart(4, '0')}-${String(segment2).padStart(4, '0')}`;
}

export const INVALID_GRANT_ERROR = {
  error: 'invalid_grant',
  error_description: 'The authorization has been denied or expired.',
};

export const AUTHORIZATION_PENDING_ERROR = {
  error: 'authorization_pending',
  error_description: 'The user has not yet completed authorization.',
};
