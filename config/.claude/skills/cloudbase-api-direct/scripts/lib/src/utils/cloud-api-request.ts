import crypto from "crypto";
import QueryString from "query-string";
import { URL } from "url";
import { ENV_NAME, RUN_ENV } from "../constant";
import { CloudBaseContext } from "../context";
import { CloudBaseError } from "../error";
import { getEnvVar, getRuntime } from "../utils";
import { fetch } from "./http-request";

function isObject(x) {
  return typeof x === "object" && !Array.isArray(x) && x !== null;
}

// 移除对象中的空值
function deepRemoveVoid(obj) {
  if (Array.isArray(obj)) {
    return obj.map(deepRemoveVoid);
  } else if (isObject(obj)) {
    let result = {};
    for (let key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (typeof value !== "undefined" && value !== null) {
          result[key] = deepRemoveVoid(value);
        }
      }
    }
    return result;
  } else {
    return obj;
  }
}

type HexBase64Latin1Encoding = "latin1" | "hex" | "base64";

function sha256(
  message: string,
  secret: string,
  encoding?: HexBase64Latin1Encoding,
) {
  const hmac = crypto.createHmac("sha256", secret);
  return hmac.update(message).digest(encoding);
}

function getHash(message: string): string {
  const hash = crypto.createHash("sha256");
  return hash.update(message).digest("hex");
}

function getDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = ("0" + (date.getUTCMonth() + 1)).slice(-2);
  // UTC 日期，非本地时间
  const day = ("0" + date.getUTCDate()).slice(-2);
  return `${year}-${month}-${day}`;
}

export class CloudService {
  service: string;
  version: string;
  url: string;
  action: string;
  method: "POST" | "GET";
  secretId: string; //
  secretKey: string; //
  token: string; //
  timeout: number;
  data: Record<string, any>;
  payload: Record<string, any>;
  baseParams: Record<string, any>;
  cloudBaseContext: CloudBaseContext;

  /* eslint-disable-next-line */
  constructor(
    context: CloudBaseContext,
    service: string,
    version: string,
    baseParams?: Record<string, any>,
  ) {
    this.service = service;
    this.version = version;
    this.timeout = 60000;
    this.baseParams = baseParams || {};
    this.cloudBaseContext = context;
  }

  get baseUrl() {
    const internalEndpoint = this.cloudBaseContext.isInternalEndpoint();
    const internalEndpointRegion =
      this.cloudBaseContext.getInternalEndpointRegion();
    const tcb = process.env.TCB_BASE_URL || "https://tcb.tencentcloudapi.com";
    const urlMap = {
      tcb,
      scf: "https://scf.tencentcloudapi.com",
      vpc: "https://vpc.tencentcloudapi.com",
      flexdb: "https://flexdb.tencentcloudapi.com",
      cam: "https://cam.tencentcloudapi.com",
      cdn: "https://cdn.tencentcloudapi.com",
    };

    // 云梯账号走内网域名
    const intranetUrlMap = Object.keys(urlMap)
      .map((service) => ({
        [service]: `https://${service}.internal.tencentcloudapi.com`,
      }))
      .reduce((acc, cur) => ({ ...acc, ...cur }), {});

    if (internalEndpoint) {
      if (internalEndpointRegion) {
        return `https://${this.service}.${internalEndpointRegion}.tencentcloudapi.woa.com`;
      }
      return (
        intranetUrlMap[this.service] ||
        `https://${this.service}.internal.tencentcloudapi.com`
      );
    }

    if (urlMap[this.service]) {
      return urlMap[this.service];
    } else {
      return `https://${this.service}.tencentcloudapi.com`;
    }
  }

  async request<T extends {}>(
    action: string,
    data: Record<string, any> = {},
    method: "POST" | "GET" = "POST",
  ): Promise<T> {
    this.action = action;
    this.data = deepRemoveVoid({ ...data, ...this.baseParams });
    this.method = method;

    this.url = this.baseUrl;

    let { secretId, secretKey, token } = this.cloudBaseContext;

    // 当在云函数环境下执行时，可init时不传入密钥，取环境变量中密钥使用
    // request执行时一般处于main函数内部，取环境变量逻辑写这里更可靠
    if (!secretId || !secretKey) {
      // 未主动传入密钥，从环境变量中读取
      const envSecretId = getEnvVar(ENV_NAME.ENV_SECRETID);
      const envSecretKey = getEnvVar(ENV_NAME.ENV_SECRETKEY);
      const envToken = getEnvVar(ENV_NAME.ENV_SESSIONTOKEN);
      if (!envSecretId || !envSecretKey) {
        if (getRuntime() === RUN_ENV.SCF) {
          throw new Error("missing authoration key, redeploy the function");
        } else {
          throw new Error("missing secretId or secretKey of tencent cloud");
        }
      } else {
        secretId = envSecretId;
        secretKey = envSecretKey;
        token = envToken;
      }
    }

    this.secretId = secretId;
    this.secretKey = secretKey;
    this.token = token;

    try {
      const data: Record<string, any> = await this.requestWithSign();

      if (data.Response.Error) {
        const tcError = new CloudBaseError(data.Response.Error.Message, {
          action,
          requestId: data.Response.RequestId,
          code: data.Response.Error.Code,
          original: data.Response.Error,
        });
        throw tcError;
      } else {
        return data.Response;
      }
    } catch (e) {
      if (e.name === "CloudBaseError") {
        throw e;
      } else {
        throw new CloudBaseError(e.message, {
          action,
          code: e.code,
        });
      }
    }
  }

  async requestWithSign() {
    // data 中可能带有 readStream，由于需要计算整个 body 的 hash，
    // 所以这里把 readStream 转为 Buffer
    // await convertReadStreamToBuffer(data)
    const timestamp = Math.floor(new Date().getTime() / 1000);
    const { proxy } = this.cloudBaseContext;

    const { method, timeout, data = {} } = this;

    if (method === "GET") {
      this.url += "?" + QueryString.stringify(data);
    }

    if (method === "POST") {
      this.payload = data;
    }

    const config: any = {
      method,
      timeout,
      headers: {
        Host: new URL(this.url).host,
        "X-TC-Action": this.action,
        // region 优先级 mock本地注入 > init 指定 > 云函数环境变量
        "X-TC-Region":
          process.env.TCB_REGION ||
          this.cloudBaseContext.region ||
          process.env.TENCENTCLOUD_REGION ||
          "ap-shanghai",
        "X-TC-Timestamp": timestamp,
        "X-TC-Version": this.version,
      },
    };

    if (this.token) {
      config.headers["X-TC-Token"] = this.token;
    }

    if (method === "GET") {
      config.headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    if (method === "POST") {
      config.body = JSON.stringify(data);
      config.headers["Content-Type"] = "application/json";
    }

    const sign = this.getRequestSign(timestamp);

    config.headers["Authorization"] = sign;

    return fetch(this.url, config, proxy);
  }

  getRequestSign(timestamp: number) {
    const { method = "POST", url, service, secretId, secretKey } = this;
    const urlObj = new URL(url);

    // 通用头部
    let headers = "";
    const signedHeaders = "content-type;host";
    if (method === "GET") {
      headers = "content-type:application/x-www-form-urlencoded\n";
    } else if (method === "POST") {
      headers = "content-type:application/json\n";
    }

    headers += `host:${urlObj.hostname}\n`;

    const path = urlObj.pathname;
    const querystring = urlObj.search.slice(1);

    const payloadHash = this.payload
      ? getHash(JSON.stringify(this.payload))
      : getHash("");

    const canonicalRequest = `${method}\n${path}\n${querystring}\n${headers}\n${signedHeaders}\n${payloadHash}`;

    const date = getDate(timestamp);

    const StringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${date}/${service}/tc3_request\n${getHash(
      canonicalRequest,
    )}`;

    const kDate = sha256(date, `TC3${secretKey}`);
    const kService = sha256(service, kDate);
    const kSigning = sha256("tc3_request", kService);
    const signature = sha256(StringToSign, kSigning, "hex");

    return `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${service}/tc3_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }
}
