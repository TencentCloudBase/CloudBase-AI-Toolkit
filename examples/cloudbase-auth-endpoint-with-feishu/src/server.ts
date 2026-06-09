import express from 'express';
import { randomBytes } from 'crypto';
import { cleanupExpired, scheduleExpiry } from './utils/device-store';
import { generateDeviceCode, generateUserCode, INVALID_GRANT_ERROR, AUTHORIZATION_PENDING_ERROR } from './utils/oauth';
import { createEnv, createApiKey, findEnvByAlias } from './utils/tcb';
import { resolvePublicDir } from './utils/public-dir';
import {
  PORT,
  BASE_URL,
  EXPIRES_IN,
  INTERVAL,
  CLOUDBASE_ENV_ID,
  CLOUDBASE_PUBLISHABLE_KEY,
  CLOUDBASE_REGION,
} from './config';
import { AuthorizationRecord, RefreshTokenRecord } from './types';

const app = express();
app.use(express.json());
app.use(express.static(resolvePublicDir()));

// ── 内存存储（生产环境请替换为 Redis/数据库） ──
const deviceStore = new Map<string, AuthorizationRecord>();
const userCodeIndex = new Map<string, string>();
const refreshTokenStore = new Map<string, RefreshTokenRecord>();

// ── 定期清理过期记录 ──
setInterval(() => cleanupExpired(deviceStore, userCodeIndex), 30_000);

// ─────────────────────────────────────────────
// GET /auth/config — 返回前端 SDK 初始化配置
// ─────────────────────────────────────────────
app.get('/auth/config', (_req, res) => {
  res.json({
    envId: CLOUDBASE_ENV_ID,
    region: CLOUDBASE_REGION,
    publishableKey: CLOUDBASE_PUBLISHABLE_KEY,
  });
});

// ─────────────────────────────────────────────
// POST /auth/device/code — 申请设备授权码
// ─────────────────────────────────────────────
app.post('/auth/device/code', (req, res) => {
  const clientId = req.body?.client_id || 'default';
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresAt = Date.now() + EXPIRES_IN * 1000;

  const record: AuthorizationRecord = {
    deviceCode,
    userCode,
    clientId,
    status: 'pending',
    uin: '',
    ownerUin: '',
    regionId: CLOUDBASE_REGION,
    expiresAt,
  };

  deviceStore.set(deviceCode, record);
  userCodeIndex.set(userCode, deviceCode);

  scheduleExpiry(deviceStore, userCodeIndex, deviceCode, userCode, EXPIRES_IN * 1000);

  res.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${BASE_URL}/cli-auth.html`,
    expires_in: EXPIRES_IN,
    interval: INTERVAL,
  });
});

// ─────────────────────────────────────────────
// POST /auth/verify-cloudbase — CloudBase 托管登录页认证后的回调
// 浏览器端完成 OAuth 后调用此接口完成设备码授权
// ─────────────────────────────────────────────
app.post('/auth/verify-cloudbase', async (req, res) => {
  const { user_code: userCode, cloudbase_uid: cloudbaseUid } = req.body;

  if (!userCode || !cloudbaseUid) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'user_code and cloudbase_uid are required' });
  }

  const deviceCode = userCodeIndex.get(userCode);
  if (!deviceCode) {
    return res.status(400).json(INVALID_GRANT_ERROR);
  }

  const record = deviceStore.get(deviceCode);
  if (!record || record.status !== 'pending') {
    return res.status(400).json(INVALID_GRANT_ERROR);
  }

  try {
    // 1. 查找用户是否已有环境（通过 cloudbaseUid 作为别名标识）
    let envId = await findEnvByAlias(cloudbaseUid);

    // 2. 首次登录：自动创建环境 + 签发 API Key
    if (!envId) {
      envId = await createEnv(cloudbaseUid);
      const { apiKey, apiKeyId } = await createApiKey(envId, `user-${cloudbaseUid}`);
      record.envId = envId;
      record.apiKey = apiKey;
    }

    // 3. 标记为已授权
    record.status = 'authorized';
    record.cloudbaseUid = cloudbaseUid;

    res.json({ status: 'ok', env_id: envId });
  } catch (err) {
    console.error('verify-cloudbase error:', err);
    record.status = 'pending'; // 失败则恢复待授权状态
    res.status(500).json({ error: 'server_error', error_description: 'Failed to create environment or API key' });
  }
});

// ─────────────────────────────────────────────
// POST /auth/device/verify — 原确认接口（兼容简单场景）
// ─────────────────────────────────────────────
app.post('/auth/device/verify', (req, res) => {
  const { user_code: userCode } = req.body;
  if (!userCode) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'user_code is required' });
  }

  const deviceCode = userCodeIndex.get(userCode);
  if (!deviceCode) return res.status(400).json(INVALID_GRANT_ERROR);

  const record = deviceStore.get(deviceCode);
  if (!record || record.status !== 'pending') return res.status(400).json(INVALID_GRANT_ERROR);

  record.status = 'authorized';
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────
// POST /auth/token — 轮询/续期/退出
// ─────────────────────────────────────────────
app.post('/auth/token', async (req, res) => {
  const { grant_type, device_code: deviceCode, refresh_token: refreshToken, client_id: clientId } = req.body;

  // ── device_code（轮询） ──
  if (grant_type === 'device_code') {
    const record = deviceStore.get(deviceCode);
    if (!record) return res.status(400).json(INVALID_GRANT_ERROR);

    if (record.status === 'pending') {
      return res.json(AUTHORIZATION_PENDING_ERROR);
    }

    if (record.status !== 'authorized') {
      return res.status(400).json(INVALID_GRANT_ERROR);
    }

    // 签发 refresh token
    const newRefreshToken = randomBytes(32).toString('hex');
    const refreshRecord: RefreshTokenRecord = {
      refreshToken: newRefreshToken,
      clientId: clientId || 'default',
      uin: record.uin,
      ownerUin: record.ownerUin,
      regionId: record.regionId,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 天
      cloudbaseUid: record.cloudbaseUid,
      envId: record.envId,
    };
    refreshTokenStore.set(newRefreshToken, refreshRecord);

    record.status = 'consumed';

    return res.json({
      access_token: record.apiKey || record.envId,
      refresh_token: newRefreshToken,
      expires_in: 7 * 24 * 3600,
      token_type: 'Bearer',
      env_id: record.envId,
      cloudbase_uid: record.cloudbaseUid,
    });
  }

  // ── refresh_token（续期） ──
  if (grant_type === 'refresh_token') {
    const record = refreshTokenStore.get(refreshToken);
    if (!record) return res.status(400).json(INVALID_GRANT_ERROR);

    // Token Rotation: 颁发新 refresh_token，使旧 token 失效
    const newRefreshToken = randomBytes(32).toString('hex');
    const newRecord: RefreshTokenRecord = { ...record, refreshToken: newRefreshToken, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    refreshTokenStore.set(newRefreshToken, newRecord);
    refreshTokenStore.delete(refreshToken);

    return res.json({
      access_token: record.envId || '',
      refresh_token: newRefreshToken,
      expires_in: 7 * 24 * 3600,
      token_type: 'Bearer',
      env_id: record.envId,
    });
  }

  // ── revoke_token（退出） ──
  if (grant_type === 'revoke_token') {
    if (refreshToken) {
      refreshTokenStore.delete(refreshToken);
    }
    if (deviceCode) {
      deviceStore.delete(deviceCode);
    }
    return res.json({ status: 'ok' });
  }

  return res.status(400).json({ error: 'unsupported_grant_type', error_description: `grant_type '${grant_type}' is not supported` });
});

// ── 启动 ──
app.listen(PORT, () => {
  const base = BASE_URL;
  console.log(`\n  🚀 企业自有品牌授权服务已启动\n`);
  console.log(`  授权页面:    ${base}/cli-auth.html`);
  console.log(`  授权回调页:  ${base}/cli-auth-callback.html`);
  console.log(`  设备码 API:  POST ${base}/auth/device/code`);
  console.log(`  验证 API:    POST ${base}/auth/verify-cloudbase`);
  console.log(`  Token API:   POST ${base}/auth/token`);
  console.log(`  配置 API:    GET  ${base}/auth/config`);
  console.log(`\n  管理中心环境: ${CLOUDBASE_ENV_ID || '(未配置)'}`);
  console.log(`  托管登录页:  ${CLOUDBASE_ENV_ID ? `https://tcb.cloud.tencent.com/dev?envId=${CLOUDBASE_ENV_ID}#/identity/login-manage` : '(未配置)'}\n`);
});
