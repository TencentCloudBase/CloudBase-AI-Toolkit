import { ERROR } from "./constant";
import { CloudBaseContext } from "./context";
import { Environment } from "./environment";

export class EnvironmentManager {
  private cloudBaseContext: CloudBaseContext;

  private envs: object = {};

  private currentEnv: Environment = null;

  constructor(context: CloudBaseContext) {
    this.cloudBaseContext = context;
  }

  public getCurrentEnv(): Environment {
    if (!this.currentEnv) {
      throw new Error(ERROR.CURRENT_ENVIRONMENT_IS_NULL);
    }
    return this.currentEnv;
  }

  public add(envId: string): void {
    if (!this.envs[envId]) {
      this.envs[envId] = new Environment(this.cloudBaseContext, envId);
    }
    if (!this.currentEnv) {
      this.currentEnv = this.envs[envId];
    }
  }

  public remove(envId: string): void {
    this.envs[envId] = null;
    delete this.envs[envId];
  }

  public get(envId: string): Environment | null {
    return this.envs[envId] || null;
  }

  public switchEnv(envId: string): boolean {
    const env = this.envs[envId];
    if (env) {
      this.currentEnv = env;
      return true;
    } else {
      return false;
    }
  }
}
