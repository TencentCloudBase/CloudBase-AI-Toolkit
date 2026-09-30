import { stripAppIdSuffix } from "./function-cos-upload.js";

/**
 * 云函数 ZIP 两段式部署的「上传目标」进程内登记。
 *
 * 阶段 A（queryFunctions action=getFunctionUploadUrl）铸造预签名上传地址时，
 * 在本进程登记这次铸造出来的 (envId, bucket, region, objectKey)；阶段 B
 * （manageFunctions createFunction / updateFunctionCode 带 code 三元组）只接受
 * 登记过的组合。
 *
 * 为什么需要它：code.cosObjectName 是模型可以自由填写的字符串，如果不校验，
 * 它可以指向环境桶里的任意对象，也可以指向另一个桶（包括调用方自己的桶）——
 * SCF 会用环境角色去拉取那个对象。登记把可用面收窄成「本进程刚为当前环境铸造
 * 出来的那个 key」。
 *
 * 取舍（刻意不做的事）：
 * - 不做「用一次即作废」：同一个 key 在保留期内可以重复提交。上传失败重试、
 *   updateFunctionCode 撞上 ResourceInUse 后的重试、以及同一份代码包重复部署
 *   都要能重放，收窄的只是「谁能成为目标」，不是「能用几次」。
 * - 不区分「没登记」与「登记在别的环境」：登记按 envId 隔离，跨环境查询直接
 *   未命中，调用方只需要知道「这个目标不在登记里，请重新取地址」。
 *
 * 登记只保存在当前 MCP 进程内存中，MCP Server 重启即丢失 —— 此时重新调用
 * getFunctionUploadUrl 取地址、重新上传即可。这与 function-deploy-task-store
 * 的语义一致（异步部署任务同样只活在进程内）。
 */

export const FUNCTION_UPLOAD_TARGET_LIMITS = {
  /**
   * 登记的保留时间。远长于上传地址本身的有效期（默认 300 秒）：地址过期只影响
   * 「还能不能 PUT」，而登记要覆盖「取地址 → 上传 → 提交部署」整条链在客户端
   * 可能的等待（大包上传、人工确认、agent 多轮编排）。
   */
  ttlMs: 60 * 60 * 1000,
  /** 最大登记数，超出时淘汰最旧的 */
  maxTargets: 500,
} as const;

export const FUNCTION_UPLOAD_TARGET_NOT_FOUND_ERROR_CODE =
  "FUNCTION_UPLOAD_TARGET_NOT_FOUND";

export interface FunctionUploadTarget {
  /** 登记时的环境 ID：校验时按它隔离，跨环境直接未命中 */
  envId: string;
  /** 环境存储桶全名（含 -appid 后缀），签发签名与归属比对都以它为准 */
  bucket: string;
  region: string;
  objectKey: string;
  createdAtMs: number;
}

export interface RegisterFunctionUploadTargetInput {
  envId: string;
  bucket: string;
  region: string;
  objectKey: string;
  /** 仅测试注入。 */
  now?: number;
}

export interface FunctionUploadTargetLookupInput {
  envId: string;
  /** 阶段 B 回传的桶名：短名或全名都可，按去掉 -appid 后缀后比对 */
  bucketName: string;
  region: string;
  objectKey: string;
  /** 仅测试注入。 */
  now?: number;
}

const uploadTargets = new Map<string, FunctionUploadTarget>();

/**
 * envId 与 objectKey 都不可能含 NUL，用它拼主键不会产生歧义；
 * 反过来，跨环境的查询无法构造出同一主键（前缀 envId 由服务端解析，调用方改不了）。
 */
function targetKey(envId: string, objectKey: string): string {
  return `${envId}\u0000${objectKey}`;
}

function cleanupUploadTargets(now: number): void {
  for (const [key, target] of uploadTargets) {
    if (now - target.createdAtMs > FUNCTION_UPLOAD_TARGET_LIMITS.ttlMs) {
      uploadTargets.delete(key);
    }
  }
}

/**
 * 达到上限时淘汰最旧的登记。
 *
 * 与部署任务表不同，这里每一条登记都可以淘汰 —— 淘汰最坏的结果是调用方重新
 * 取一次上传地址，不会影响任何正在进行中的云端操作，因此不需要 warn。
 */
function enforceMaxTargets(): void {
  const { maxTargets } = FUNCTION_UPLOAD_TARGET_LIMITS;
  if (uploadTargets.size < maxTargets) {
    return;
  }

  const oldestFirst = [...uploadTargets.entries()].sort(
    (left, right) => left[1].createdAtMs - right[1].createdAtMs,
  );
  for (const [key] of oldestFirst) {
    if (uploadTargets.size < maxTargets) {
      return;
    }
    uploadTargets.delete(key);
  }
}

/** 阶段 A 登记本次铸造的上传目标。 */
export function registerFunctionUploadTarget(
  input: RegisterFunctionUploadTargetInput,
): void {
  const now = input.now ?? Date.now();
  cleanupUploadTargets(now);
  enforceMaxTargets();

  uploadTargets.set(targetKey(input.envId, input.objectKey), {
    envId: input.envId,
    bucket: input.bucket,
    region: input.region,
    objectKey: input.objectKey,
    createdAtMs: now,
  });
}

/**
 * 阶段 B 校验：命中登记且桶、地域都对得上才返回目标，否则返回 undefined。
 *
 * 地域与桶都要比对 —— 只比对象 key 的话，仍然可以把同一个 key 指到别的桶或
 * 别的地域（例如把代码指到调用方自己的桶）上。
 */
export function findFunctionUploadTarget(
  input: FunctionUploadTargetLookupInput,
): FunctionUploadTarget | undefined {
  const now = input.now ?? Date.now();
  cleanupUploadTargets(now);

  const target = uploadTargets.get(targetKey(input.envId, input.objectKey));
  if (!target) {
    return undefined;
  }

  const bucketMatches =
    stripAppIdSuffix(input.bucketName) === stripAppIdSuffix(target.bucket);
  return bucketMatches && input.region === target.region ? target : undefined;
}

export function getFunctionUploadTargetCount(): number {
  return uploadTargets.size;
}

/** 测试用：清空登记表 */
export function resetFunctionUploadTargets(): void {
  uploadTargets.clear();
}
