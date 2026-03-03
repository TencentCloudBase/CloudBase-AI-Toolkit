import { INTERNAL_ENDPOINT_REGION, USE_INTERNAL_ENDPOINT } from "./constant";

export class CloudBaseContext {
  public readonly secretId: string;
  public readonly secretKey: string;
  public readonly token: string;
  public readonly proxy: string;
  public readonly envId: string;
  public readonly region: string;
  public readonly envType: string; // baas/run/weda/hosting
  public readonly useInternalEndpoint?: boolean;
  public readonly internalEndpointRegion?: string;

  constructor({
    secretId = "",
    secretKey = "",
    token = "",
    proxy = "",
    region = "",
    envType = "",
    useInternalEndpoint = undefined,
    internalEndpointRegion = undefined,
  }) {
    this.secretId = secretId;
    this.secretKey = secretKey;
    this.token = token;
    this.proxy = proxy;
    this.region = region;
    this.envType = envType;
    this.useInternalEndpoint = useInternalEndpoint;
    this.internalEndpointRegion = internalEndpointRegion;
  }

  public isInternalEndpoint() {
    return this.useInternalEndpoint !== undefined
      ? this.useInternalEndpoint
      : USE_INTERNAL_ENDPOINT;
  }

  public getInternalEndpointRegion() {
    return this.internalEndpointRegion || INTERNAL_ENDPOINT_REGION;
  }
}
