import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 3000;
export const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
export const EXPIRES_IN = Number(process.env.EXPIRES_IN) || 600;
export const INTERVAL = Number(process.env.INTERVAL) || 3;
export const CONSUMED_TTL_MS = 10_000;

export const CLOUDBASE_ENV_ID = process.env.CLOUDBASE_ENV_ID || '';
export const CLOUDBASE_PUBLISHABLE_KEY = process.env.CLOUDBASE_PUBLISHABLE_KEY || '';
export const CLOUDBASE_REGION = process.env.CLOUDBASE_REGION || 'ap-shanghai';

export const TENCENTCLOUD_SECRET_ID = process.env.TENCENTCLOUD_SECRET_ID || '';
export const TENCENTCLOUD_SECRET_KEY = process.env.TENCENTCLOUD_SECRET_KEY || '';
export const STS_TOKEN_DURATION = Number(process.env.STS_TOKEN_DURATION) || 1800;
