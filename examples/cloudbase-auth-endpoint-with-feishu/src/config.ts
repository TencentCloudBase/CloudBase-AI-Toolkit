import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 3000;
export const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
export const EXPIRES_IN = Number(process.env.EXPIRES_IN) || 600;
export const INTERVAL = Number(process.env.INTERVAL) || 3;
export const CONSUMED_TTL_MS = 10_000;

export const CLOUDBASE_ENV_ID = process.env.CLOUDBASE_ENV_ID || '';
export const CLOUDBASE_PUBLISHABLE_KEY = process.env.CLOUDBASE_PUBLISHABLE_KEY || '';
export const CLOUDBASE_REGION = process.env.CLOUDBASE_REGION || 'ap-shanghai';

export const CLOUDBASE_USER_ENV_PACKAGE_ID = process.env.CLOUDBASE_USER_ENV_PACKAGE_ID || 'baas_personal';
export const CLOUDBASE_USER_ENV_RESOURCES = (process.env.CLOUDBASE_USER_ENV_RESOURCES || 'flexdb,storage,function')
  .split(',')
  .map(resource => resource.trim())
  .filter(Boolean);
export const CLOUDBASE_USER_ENV_PERIOD = Number(process.env.CLOUDBASE_USER_ENV_PERIOD) || 1;
export const CLOUDBASE_USER_ENV_AUTO_VOUCHER = process.env.CLOUDBASE_USER_ENV_AUTO_VOUCHER !== 'false';
export const CLOUDBASE_USER_ENV_READY_TIMEOUT_MS = Number(process.env.CLOUDBASE_USER_ENV_READY_TIMEOUT_MS) || 120_000;

export const TENCENTCLOUD_SECRET_ID = process.env.TENCENTCLOUD_SECRET_ID || '';
export const TENCENTCLOUD_SECRET_KEY = process.env.TENCENTCLOUD_SECRET_KEY || '';
