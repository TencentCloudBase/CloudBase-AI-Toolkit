import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface CloudBaseCreds {
  envId: string;
  secretId: string;
  secretKey: string;
}

/** 旧评测仓同一组变量。缺任意一个就不当成现网登录。 */
export function readCloudBaseCreds(env: NodeJS.ProcessEnv = process.env): CloudBaseCreds | undefined {
  const envId = env.CLOUDBASE_ENV_ID?.trim();
  const secretId = (env.TENCENTCLOUD_SECRETID ?? env.TENCENTCLOUD_SECRET_ID)?.trim();
  const secretKey = (env.TENCENTCLOUD_SECRETKEY ?? env.TENCENTCLOUD_SECRET_KEY)?.trim();
  if (!envId || !secretId || !secretKey) return undefined;
  return { envId, secretId, secretKey };
}

export function buildMcpConfig(creds: CloudBaseCreds): string {
  return JSON.stringify({
    mcpServers: {
      cloudbase: {
        command: 'npx',
        args: ['-y', '@cloudbase/cloudbase-mcp@latest'],
        env: {
          CLOUDBASE_GUIDE_PROMPT: 'false',
          CLOUDBASE_EVALUATE_MODE: '1',
          CLOUDBASE_ENV_ID: creds.envId,
          TENCENTCLOUD_SECRETID: creds.secretId,
          TENCENTCLOUD_SECRETKEY: creds.secretKey,
        },
      },
    },
  });
}

function runTcb(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('tcb', args, { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

/**
 * 提前写入 CLI 登录态，做法对齐旧评测仓 setupTcbCli：
 * tcb login --apiKeyId/--apiKey，再写 cloudbaserc.json。
 */
export async function preseedCliLogin(workspace: string, creds: CloudBaseCreds): Promise<void> {
  const login = await runTcb(
    ['login', '--apiKeyId', creds.secretId, '--apiKey', creds.secretKey],
    workspace,
  );
  if (login.exitCode !== 0) {
    throw new Error(`tcb login failed (exit ${login.exitCode})`);
  }
  await writeFile(
    path.join(workspace, 'cloudbaserc.json'),
    `${JSON.stringify({ version: '2.0', envId: creds.envId }, null, 2)}\n`,
  );
}

/** 只读核对：登录后的环境列表里有没有目标 envId。不返回密钥。 */
export async function envIdIsListed(workspace: string, envId: string): Promise<boolean> {
  const listed = await runTcb(['env', 'list'], workspace);
  if (listed.exitCode !== 0) {
    throw new Error(`tcb env list failed (exit ${listed.exitCode})`);
  }
  return listed.stdout.includes(envId);
}
