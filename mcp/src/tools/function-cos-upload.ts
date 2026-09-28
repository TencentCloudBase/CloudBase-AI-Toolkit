/**
 * 云函数 ZIP 两段式部署·阶段 A：生成 COS 预签名上传地址。
 *
 * 通道来源（R1 探针实测裁决，见 output/2026-09-23-functions-zip-two-phase-design.md §4）：
 * - DescribeBuildServiceCosInfo / build-service 上传 / GetTempCosInfo 三条通道全部判死
 *   （CosTimestamp 稳定 InternalError；SCF 拉代码强制给桶名拼 -appid 后缀，共享 build 桶
 *   永远拉不到；tempcos 桶全 region 404）。
 * - 活通道：用环境自有存储桶（DescribeEnvs → Storages[0].Bucket/Region）+ 用户凭据
 *   本地铸 COS q-sign 预签名 PUT URL。CloudBase 临时凭据可直接用于 COS（manager-node
 *   storage 同款 SecretId+SecretKey+token 范式），但必须把 x-cos-security-token 纳入
 *   签名 Headers 且请求时携带同名头。
 *
 * 设计约束：
 * - 纯函数、零第三方依赖（node:crypto 即可）：签名算法从 cos-nodejs-sdk-v5 getAuth
 *   逐行复刻，测试里与 SDK 真实现做黄金值对照，防止复刻漂移。
 * - 预签名是本地 HMAC 计算：CAM 零新增权限、不暴露 appId（URL 用全桶名，阶段 B 回传
 *   TCB 的 CosBucketName 用短名）、国际站天然可用。
 */

import { createHash, createHmac, randomBytes } from "crypto";

/** 环境存储桶全名形如 `mybucket-1258016615`；TCB CosBucketName 只收短名（不带 -appid 后缀）。 */
export function stripAppIdSuffix(bucket: string): string {
  return bucket.replace(/-\d+$/, "");
}

/** 复刻 cos-nodejs-sdk-v5 util.camSafeUrlEncode：encodeURIComponent 强制编码 !'()* 五个字符。 */
export function camSafeUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/** 复刻 SDK getObjectKeys：原始 key 按小写比较排序（排序在编码之前）。 */
function sortedKeys(obj: Record<string, string>): string[] {
  return Object.keys(obj).sort((a, b) => {
    a = a.toLowerCase();
    b = b.toLowerCase();
    return a === b ? 0 : a > b ? 1 : -1;
  });
}

/** 复刻 SDK obj2str(obj, true)：key 编码后小写、value 编码，按 key 升序以 & 连接。 */
function encodeKv(obj: Record<string, string>): string {
  return sortedKeys(obj)
    .map((key) => {
      const k = camSafeUrlEncode(key).toLowerCase();
      const v = camSafeUrlEncode(obj[key] ?? "");
      return `${k}=${v}`;
    })
    .join("&");
}

export interface CosPutAuthOptions {
  secretId: string;
  secretKey: string;
  /** 存储桶全名（含 -appid 后缀），用于签名 Host 头。 */
  bucket: string;
  region: string;
  objectKey: string;
  /** CloudBase 临时凭据的 session token；永久密钥（ SecretKey 签发）时省略。 */
  securityToken?: string;
  /** 形如 "1690000000;1690003600"；测试注入固定值以获得确定性签名。缺省按 now 推导。 */
  keyTime?: string;
  /** keyTime 未指定时的有效期（秒），默认 3600。 */
  expiresInSeconds?: number;
  /** Unix 秒，仅测试注入。 */
  now?: number;
}

/**
 * 生成 COS q-sign 预签名授权串（PUT 方法）。
 * 算法逐行复刻 cos-nodejs-sdk-v5 getAuth：
 *   signKey      = HMAC-SHA1(SecretKey, KeyTime)
 *   formatString = method \n pathname \n query-str \n header-str \n
 *   stringToSign = sha1 \n KeyTime \n sha1(formatString) \n
 *   signature    = HMAC-SHA1(signKey, stringToSign)
 * Host 头始终签入（对齐 SDK ForceSignHost 默认 true），query 为空故 q-url-param-list 为空。
 */
export function buildCosPutAuthorization(options: CosPutAuthOptions): string {
  const {
    secretId,
    secretKey,
    bucket,
    region,
    objectKey,
    securityToken,
    expiresInSeconds = 3600,
  } = options;

  if (!secretId) throw new Error("missing param SecretId");
  if (!secretKey) throw new Error("missing param SecretKey");
  if (!bucket) throw new Error("missing param Bucket");
  if (!region) throw new Error("missing param Region");
  if (!objectKey) throw new Error("missing param objectKey");

  const headers: Record<string, string> = {
    host: `${bucket}.cos.${region}.myqcloud.com`,
  };
  if (securityToken) {
    headers["x-cos-security-token"] = securityToken;
  }

  const keyTime =
    options.keyTime ??
    (() => {
      const now = options.now ?? Math.floor(Date.now() / 1000);
      return `${now - 1};${now + expiresInSeconds}`;
    })();

  // 与请求 URL 一致的编码路径（对象 key 仅允许安全字符时与原始 key 相同）。
  const pathname = `/${objectKey.split("/").map(encodeURIComponent).join("/")}`;

  const signKey = createHmac("sha1", secretKey).update(keyTime).digest("hex");
  const formatString = ["put", pathname, "", encodeKv(headers), ""].join("\n");
  const stringToSign = [
    "sha1",
    keyTime,
    createHash("sha1").update(Buffer.from(formatString, "utf8")).digest("hex"),
    "",
  ].join("\n");
  const signature = createHmac("sha1", signKey).update(stringToSign).digest("hex");

  const headerList = sortedKeys(headers)
    .map((key) => camSafeUrlEncode(key).toLowerCase())
    .join(";");

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
}

export interface FunctionZipUploadResult {
  /** 预签名 PUT URL，含签名 query。携带签名与凭据绑定信息，禁止写入日志。 */
  uploadUrl: string;
  /** 临时凭据时需随 PUT 请求携带的请求头（x-cos-security-token）；永久密钥为空数组。 */
  uploadHeaders: Array<{ Key: string; Value: string }>;
  /** 短桶名（不含 -appid 后缀），阶段 B 直接作为 code.cosBucketName 回传 TCB。 */
  cosBucketName: string;
  cosBucketRegion: string;
  /** 上传对象 key，阶段 B 直接作为 code.cosObjectName 回传 TCB。 */
  cosObjectName: string;
  expiresInSeconds: number;
}

export interface BuildFunctionZipUploadParams {
  /** 环境自有存储桶（DescribeEnvs → Storages[0]）。 */
  storage: { bucket: string; region: string };
  credential: { secretId: string; secretKey: string; token?: string };
  /** 可选，仅用于生成可读的对象 key（如 `fnzip-upload/.../helloWorld.zip`）。 */
  functionName?: string;
  expiresIn?: number;
  /** 仅测试注入。 */
  now?: number;
  keyTime?: string;
  /** 仅测试注入，替代随机后缀。 */
  randomSuffix?: string;
}

/**
 * 生成两段式部署阶段 A 的完整返回体：预签名 PUT URL + 阶段 B 所需的 COS 三元组。
 * 对象 key 形如 `fnzip-upload/{ts}-{rand}/{functionName|code}.zip`，全部为 COS 签名
 * 安全字符（字母数字与 -_. /），保证签名 pathname 与请求 URL 一致。
 */
export function buildFunctionZipUpload(
  params: BuildFunctionZipUploadParams,
): FunctionZipUploadResult {
  const { storage, credential, functionName } = params;
  const expiresIn = params.expiresIn ?? 3600;

  const ts = params.now ?? Math.floor(Date.now() / 1000);
  const rand =
    params.randomSuffix ?? randomBytes(8).toString("hex");
  const objectKey = `fnzip-upload/${ts}-${rand}/${functionName || "code"}.zip`;

  const keyTime =
    params.keyTime ?? `${ts - 1};${ts + expiresIn}`;

  const authorization = buildCosPutAuthorization({
    secretId: credential.secretId,
    secretKey: credential.secretKey,
    bucket: storage.bucket,
    region: storage.region,
    objectKey,
    securityToken: credential.token || undefined,
    keyTime,
  });

  return {
    uploadUrl: `https://${storage.bucket}.cos.${storage.region}.myqcloud.com/${objectKey}?${authorization}`,
    uploadHeaders: credential.token
      ? [{ Key: "x-cos-security-token", Value: credential.token }]
      : [],
    cosBucketName: stripAppIdSuffix(storage.bucket),
    cosBucketRegion: storage.region,
    cosObjectName: objectKey,
    expiresInSeconds: expiresIn,
  };
}
