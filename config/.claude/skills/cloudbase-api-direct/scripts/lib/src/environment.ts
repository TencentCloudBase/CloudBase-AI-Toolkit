import { CommonService } from "./common";
import { ENV_NAME, RUN_ENV } from "./constant";
import { CloudBaseContext } from "./context";
import { getEnvVar, getRuntime } from "./utils";

export class Environment {
  public cloudBaseContext: CloudBaseContext;
  private envId: string;

  constructor(context: CloudBaseContext, envId: string) {
    this.envId = envId;
    this.cloudBaseContext = context;
  }

  public getEnvId(): string {
    return this.envId;
  }

  public getCommonService(
    serviceType = "tcb",
    serviceVersion?: string,
  ): CommonService {
    return new CommonService(this, serviceType, serviceVersion);
  }

  public getAuthConfig() {
    let { secretId, secretKey, token, proxy, region } = this.cloudBaseContext;
    const envId = this.getEnvId();

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

    return {
      envId,
      secretId,
      secretKey,
      token,
      proxy,
      region,
    };
  }
}
