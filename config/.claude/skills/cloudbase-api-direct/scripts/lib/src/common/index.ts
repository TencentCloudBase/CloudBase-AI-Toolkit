import { Environment } from "../environment";
import { CloudBaseError } from "../error";
import { CloudService } from "../utils";

interface ICommonApiServiceOption {
  Action: string; // 接口名称
  Param: Record<string, any>; // 接口传参
}
/**
 * 公共的云api调用方法 透传用户参数 无业务逻辑处理
 * @export
 * @class CommonService
 */

const ActionVersionMap = {
  tcb: "2018-06-08",
  flexdb: "2018-11-27",
  scf: "2018-04-16",
  sts: "2018-04-16",
  cam: "2019-01-16",
  lowcode: "2021-01-08",
};

export class CommonService {
  private commonService: CloudService;
  private environment: Environment;

  constructor(
    environment: Environment,
    serviceType: string,
    serviceVersion: string,
  ) {
    this.environment = environment;
    this.commonService = new CloudService(
      environment.cloudBaseContext,
      serviceType,
      serviceVersion || ActionVersionMap[serviceType],
    );
  }

  /**
   * 公共方法调用
   * @param {ICommonApiServiceParam} param
   * @returns {Promise<any>}
   * @memberof CommonService
   */
  public async call(options: ICommonApiServiceOption): Promise<any> {
    const { Action, Param = {} } = options;
    if (!Action) {
      throw new CloudBaseError("缺少必填参数 Action");
    }

    const res = await this.commonService.request(Action, { ...Param });

    return res;
  }
}
