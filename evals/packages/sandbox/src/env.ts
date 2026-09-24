/**
 * 环境生命周期。本包不创建云环境：开实例要 booker 拍板。
 * 真跑只接受调用方已经提供的 envId；干跑用固定占位，不发任何云请求。
 */

export interface SandboxEnv {
  envId: string;
  mode: 'dry-run' | 'live';
}

export function openSandbox(env: NodeJS.ProcessEnv = process.env): SandboxEnv {
  const envId = env.CLOUDBASE_ENV_ID?.trim();
  if (!envId) {
    return { envId: 'dry-run', mode: 'dry-run' };
  }
  return { envId, mode: 'live' };
}

/** 真跑缺环境时拒绝，避免静默去 createOneEnv。 */
export function requireLiveEnv(env: NodeJS.ProcessEnv = process.env): SandboxEnv {
  const opened = openSandbox(env);
  if (opened.mode !== 'live') {
    throw new Error(
      'CLOUDBASE_ENV_ID is required for a live run. This runner does not create environments.',
    );
  }
  return opened;
}
