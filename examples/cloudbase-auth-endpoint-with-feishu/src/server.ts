import express from 'express';
import cors from 'cors';
import { randomBytes } from 'crypto';
import rateLimit from 'express-rate-limit';
import {
  getDeviceRecord,
  findDeviceByUserCode,
  saveDeviceRecord,
  updateDeviceRecord,
  deleteDeviceRecord,
  getRefreshRecord,
  saveRefreshRecord,
  deleteRefreshRecord,
  cleanupExpiredRecords,
  findApiKeyByEnvId,
} from './utils/device-store';
import { generateDeviceCode, generateUserCode, INVALID_GRANT_ERROR, AUTHORIZATION_PENDING_ERROR } from './utils/oauth';
import { createEnv, createApiKey, findEnvByAlias } from './utils/tcb';
import { resolvePublicDir } from './utils/public-dir';
import { verifyCloudBaseAccessToken, CloudBaseUserInfo } from './utils/auth';
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
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(resolvePublicDir()));

// ── 限流 ──────────────────────────────────────
const deviceCodeLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', error_description: 'Too many device code requests. Please try again later.' },
});
const verifyLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', error_description: 'Too many verification requests. Please try again later.' },
});
const tokenLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', error_description: 'Too many token requests. Please try again later.' },
});

// ── 定期清理过期记录（CloudBase 数据库）──
setInterval(() => { cleanupExpiredRecords().catch(err => console.error('cleanup error:', err)); }, 60_000);

// ─────────────────────────────────────────────
// GET / — 健康检查
// ─────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ ok: true, boot: Date.now() - startTime + 'ms' });
});

// ─────────────────────────────────────────────
// GET /check-status — 轮询查询设备码对应的环境状态
// ─────────────────────────────────────────────
app.get('/check-status', async (req, res) => {
  const userCode = req.query.user_code as string;
  if (!userCode) {
    return res.json({ status: 'invalid', message: '缺少 user_code' });
  }
  const record = await findDeviceByUserCode(userCode);
  if (!record) {
    return res.json({ status: 'not_found' });
  }
  if (record.status === 'consumed' && record.envId) {
    return res.json({ status: 'ready', envId: record.envId });
  }
  return res.json({ status: 'pending' });
});

// ─────────────────────────────────────────────
// GET /config — 返回前端 SDK 初始化配置
// ─────────────────────────────────────────────
app.get('/config', (_req, res) => {
  res.json({
    envId: CLOUDBASE_ENV_ID,
    region: CLOUDBASE_REGION,
    publishableKey: CLOUDBASE_PUBLISHABLE_KEY,
  });
});

// ─────────────────────────────────────────────
// POST /device/code — 申请设备授权码
// ─────────────────────────────────────────────
app.post('/device/code', deviceCodeLimiter, async (req, res) => {
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

  await saveDeviceRecord(record);

  res.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${BASE_URL}/cli-auth.html`,
    expires_in: EXPIRES_IN,
    interval: INTERVAL,
  });
});

// ─────────────────────────────────────────────
// POST /verify-cloudbase — CloudBase 托管登录页认证后的回调
// 浏览器端完成 OAuth 后调用此接口完成设备码授权
// ─────────────────────────────────────────────
app.post('/verify-cloudbase', verifyLimiter, async (req, res) => {
  const {
    user_code: userCode,
    cloudbase_uid: cloudbaseUid,
    cloudbase_access_token: cloudbaseAccessToken,
  } = req.body;

  if (!userCode || !cloudbaseUid || !cloudbaseAccessToken) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'user_code, cloudbase_uid and cloudbase_access_token are required',
    });
  }

  // 校验 access token 归属，并只信任已验证的用户身份。
  let verifiedUserInfo: CloudBaseUserInfo;
  try {
    verifiedUserInfo = await verifyCloudBaseAccessToken(cloudbaseAccessToken);
  } catch (err) {
    console.warn('verify-cloudbase token check failed:', (err as Error).message);
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'cloudbase_access_token is invalid or expired',
    });
  }

  const verifiedUid = verifiedUserInfo.user_id || verifiedUserInfo.sub;
  if (!verifiedUid || verifiedUid !== cloudbaseUid) {
    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'cloudbase_uid does not match cloudbase_access_token',
    });
  }

  // 查找设备码记录（CloudBase 数据库，跨容器共享）
  let record: AuthorizationRecord | null;
  try {
    record = await findDeviceByUserCode(userCode);
  } catch (err) {
    console.error('find device record error:', err);
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to query device authorization record',
    });
  }
  if (!record || record.status !== 'pending' || Date.now() > record.expiresAt) {
    return res.status(400).json(INVALID_GRANT_ERROR);
  }

  const provider = verifiedUserInfo.providers?.[0];

  // 授权确认：记录 cloudbaseUid 到设备码记录
  // 环境和 API Key 在 POST /auth/token 轮询时按需创建
  try {
    await updateDeviceRecord(record.deviceCode, {
      status: 'authorized',
      cloudbaseUid: verifiedUid,
      providerId: provider?.id,
      providerUserId: provider?.provider_user_id,
    });
  } catch (err) {
    console.error('update device record error:', err);
    return res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to update device authorization record',
    });
  }

  res.json({ status: 'ok', env_id: '' });
});

// ─────────────────────────────────────────────
// POST /device/verify — 原确认接口（兼容简单场景）
// ─────────────────────────────────────────────
app.post('/device/verify', async (req, res) => {
  const { user_code: userCode } = req.body;
  if (!userCode) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'user_code is required' });
  }

  const record = await findDeviceByUserCode(userCode);
  if (!record || record.status !== 'pending') return res.status(400).json(INVALID_GRANT_ERROR);

  await updateDeviceRecord(record.deviceCode, { status: 'authorized' });
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────
// POST /token — 轮询/续期/退出
// ─────────────────────────────────────────────
app.post('/token', tokenLimiter, async (req, res) => {
  const { grant_type, device_code: deviceCode, refresh_token: refreshToken, client_id: clientId } = req.body;

  // ── device_code（轮询） ──
  if (grant_type === 'device_code') {
    const record = await getDeviceRecord(deviceCode);
    if (!record || Date.now() > record.expiresAt) return res.status(400).json(INVALID_GRANT_ERROR);

    if (record.status === 'pending') {
      return res.json(AUTHORIZATION_PENDING_ERROR);
    }

    if (record.status !== 'authorized') {
      return res.status(400).json(INVALID_GRANT_ERROR);
    }

    // 按需创建环境 + API Key（首次轮询时触发）
    if (!record.envId && record.cloudbaseUid) {
      try {
        let envId = await findEnvByAlias(record.cloudbaseUid);
        let apiKey: string, apiKeyId: string;
        if (envId) {
          // 已有环境，复用之前签发的 API Key
          const existing = await findApiKeyByEnvId(envId);
          if (existing) {
            apiKey = existing.apiKey;
            apiKeyId = existing.apiKeyId;
          } else {
            ({ apiKey, apiKeyId } = await createApiKey(envId, `user-${record.cloudbaseUid}`, 7 * 24 * 3600));
          }
        } else {
          envId = await createEnv(record.cloudbaseUid);
          ({ apiKey, apiKeyId } = await createApiKey(envId, `user-${record.cloudbaseUid}`, 7 * 24 * 3600));
        }
        record.envId = envId;
        record.apiKey = apiKey;
        record.apiKeyId = apiKeyId;
        await updateDeviceRecord(deviceCode, { envId, apiKey, apiKeyId, status: 'consumed' });
      } catch (err) {
        console.error('token poll - deferred env setup error:', err);
        return res.json({ error: 'authorization_pending', error_description: 'Environment creation in progress, please retry' });
      }
    } else if (record.status === 'authorized') {
      await updateDeviceRecord(deviceCode, { status: 'consumed' });
    }

    // 签发 refresh token
    const newRefreshToken = randomBytes(32).toString('hex');
    const refreshRecord: RefreshTokenRecord = {
      refreshToken: newRefreshToken,
      clientId: clientId || 'default',
      uin: record.uin,
      ownerUin: record.ownerUin,
      regionId: record.regionId,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      cloudbaseUid: record.cloudbaseUid,
      envId: record.envId,
      apiKey: record.apiKey,
      apiKeyId: record.apiKeyId,
      providerId: record.providerId,
      providerUserId: record.providerUserId,
    };
    await saveRefreshRecord(refreshRecord);

    return res.json({
      access_token: record.apiKey || '',
      refresh_token: newRefreshToken,
      expires_in: 7 * 24 * 3600,
      token_type: 'Bearer',
      env_id: record.envId,
      api_key_id: record.apiKeyId,
      cloudbase_uid: record.cloudbaseUid,
      provider_id: record.providerId,
      provider_user_id: record.providerUserId,
    });
  }

  // ── refresh_token（续期） ──
  if (grant_type === 'refresh_token') {
    const record = await getRefreshRecord(refreshToken);
    if (!record) return res.status(400).json(INVALID_GRANT_ERROR);
    if (Date.now() > record.expiresAt) {
      await deleteRefreshRecord(refreshToken);
      return res.status(400).json(INVALID_GRANT_ERROR);
    }

    // Token Rotation
    const newRefreshToken = randomBytes(32).toString('hex');
    const newRecord: RefreshTokenRecord = { ...record, refreshToken: newRefreshToken, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    await saveRefreshRecord(newRecord);
    await deleteRefreshRecord(refreshToken);

    return res.json({
      access_token: record.apiKey || '',
      refresh_token: newRefreshToken,
      expires_in: 7 * 24 * 3600,
      token_type: 'Bearer',
      env_id: record.envId,
      api_key_id: record.apiKeyId,
      cloudbase_uid: record.cloudbaseUid,
      provider_id: record.providerId,
      provider_user_id: record.providerUserId,
    });
  }

  // ── revoke_token（退出） ──
  if (grant_type === 'revoke_token') {
    if (refreshToken) {
      await deleteRefreshRecord(refreshToken).catch(() => {});
    }
    if (deviceCode) {
      await deleteDeviceRecord(deviceCode).catch(() => {});
    }
    return res.json({ status: 'ok' });
  }

  return res.status(400).json({ error: 'unsupported_grant_type', error_description: `grant_type '${grant_type}' is not supported` });
});

// ── 启动 ──
const startTime = Date.now();
app.listen(PORT, '127.0.0.1', () => {
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
