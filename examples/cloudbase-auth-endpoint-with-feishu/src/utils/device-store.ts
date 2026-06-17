import cloudbase from '@cloudbase/node-sdk';
import { AuthorizationRecord, RefreshTokenRecord } from '../types';
import { CLOUDBASE_ENV_ID, CLOUDBASE_REGION, CONSUMED_TTL_MS } from '../config';

const CB_SECRET_ID = process.env.CB_SECRET_ID || '';
const CB_SECRET_KEY = process.env.CB_SECRET_KEY || '';

const app = cloudbase.init({
  env: CLOUDBASE_ENV_ID,
  region: CLOUDBASE_REGION,
  secretId: CB_SECRET_ID,
  secretKey: CB_SECRET_KEY,
});

const db = app.database();
const devices = db.collection('auth_devices');
const refreshTokens = db.collection('auth_refresh_tokens');

const _ = db.command;

// ── 设备码 ──

export async function getDeviceRecord(deviceCode: string): Promise<AuthorizationRecord | null> {
  const res = await devices.where({ deviceCode }).get();
  if (res.data.length === 0) return null;
  return res.data[0] as unknown as AuthorizationRecord;
}

export async function findDeviceByUserCode(userCode: string): Promise<AuthorizationRecord | null> {
  const res = await devices.where({ userCode }).get();
  if (res.data.length === 0) return null;
  return res.data[0] as unknown as AuthorizationRecord;
}

export async function saveDeviceRecord(record: AuthorizationRecord): Promise<void> {
  await devices.add(record);
}

export async function updateDeviceRecord(deviceCode: string, updates: Partial<AuthorizationRecord>): Promise<void> {
  await devices.where({ deviceCode }).update(updates as any);
}

export async function deleteDeviceRecord(deviceCode: string): Promise<void> {
  await devices.where({ deviceCode }).remove();
}

// ── Refresh Token ──

export async function getRefreshRecord(refreshToken: string): Promise<RefreshTokenRecord | null> {
  const res = await refreshTokens.where({ refreshToken }).get();
  if (res.data.length === 0) return null;
  return res.data[0] as unknown as RefreshTokenRecord;
}

export async function saveRefreshRecord(record: RefreshTokenRecord): Promise<void> {
  await refreshTokens.add(record);
}

export async function deleteRefreshRecord(refreshToken: string): Promise<void> {
  await refreshTokens.where({ refreshToken }).remove();
}

// ── 清理过期记录（定时调用） ──

export async function cleanupExpiredRecords(): Promise<void> {
  const now = Date.now();
  await devices.where({ expiresAt: _.lt(now) }).remove();
  await refreshTokens.where({ expiresAt: _.lt(now) }).remove();
}
