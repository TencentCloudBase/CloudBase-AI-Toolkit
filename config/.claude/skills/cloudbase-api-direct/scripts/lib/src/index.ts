import { CommonService } from "./common";
import { CloudBaseContext } from "./context";
import { Environment } from "./environment";
import { EnvironmentManager } from "./environmentManager";

interface CloudBaseConfig {
  secretId?: string;
  secretKey?: string;
  token?: string;
  envId?: string;
  proxy?: string;
  region?: string;
  envType?: string;
  useInternalEndpoint?: boolean;
  internalEndpointRegion?: string;
}

class CloudBase {
  private static cloudBase: CloudBase;

  /**
   * init 初始化 为单例
   *
   * @static
   * @param {ManagerConfig} config
   * @returns {CloudBase}
   * @memberof CloudBase
   */
  public static init(config: CloudBaseConfig): CloudBase {
    if (!CloudBase.cloudBase) {
      CloudBase.cloudBase = new CloudBase(config);
    }

    return CloudBase.cloudBase;
  }

  private context: CloudBaseContext;
  private cloudBaseConfig: CloudBaseConfig = {};
  private environmentManager: EnvironmentManager;

  public constructor(config: CloudBaseConfig = {}) {
    let {
      secretId,
      secretKey,
      token,
      envId,
      proxy,
      region,
      envType,
      useInternalEndpoint,
      internalEndpointRegion,
    } = config;
    // config 中传入的 secretId secretkey 必须同时存在
    if ((secretId && !secretKey) || (!secretId && secretKey)) {
      throw new Error("secretId and secretKey must be a pair");
    }

    this.cloudBaseConfig = {
      secretId: secretId ? secretId.trim() : secretId,
      secretKey: secretKey ? secretKey.trim() : secretKey,
      token,
      envId,
      envType,
      proxy,
      region,
      useInternalEndpoint,
      internalEndpointRegion,
    };

    // 初始化 context
    this.context = new CloudBaseContext(this.cloudBaseConfig);

    this.environmentManager = new EnvironmentManager(this.context);
    this.environmentManager.add(envId || "");
  }

  public addEnvironment(envId: string): void {
    this.environmentManager.add(envId);
  }

  public currentEnvironment(): Environment {
    return this.environmentManager.getCurrentEnv();
  }

  public commonService(service?: string, version?: string): CommonService {
    return this.currentEnvironment().getCommonService(service, version);
  }

  public getEnvironmentManager(): EnvironmentManager {
    return this.environmentManager;
  }

  public getManagerConfig(): CloudBaseConfig {
    return this.cloudBaseConfig;
  }

  public get isInternalEndpoint(): Boolean {
    return this.context.isInternalEndpoint();
  }
}

export = CloudBase;
