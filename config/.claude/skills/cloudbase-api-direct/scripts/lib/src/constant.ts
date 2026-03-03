// // cloudbase cli 配置的字段名
// export class ConfigItems {
//     static credentail = 'credential'
// }

export const ENV_NAME = {
  ENV_SECRETID: "TENCENTCLOUD_SECRETID",
  ENV_SECRETKEY: "TENCENTCLOUD_SECRETKEY",
  ENV_SESSIONTOKEN: "TENCENTCLOUD_SESSIONTOKEN",
  ENV_TCB_ENV_ID: "TENCENTCLOUD_TCB_ENVID",
  ENV_RUNENV: "TENCENTCLOUD_RUNENV",
  ENV_RUNENV_SCF: "TENCENTCLOUD_RUNENV=SCF",
};

export const SDK_VERSION = "TCB-NODE-MANAGER/1.0.O";

export const RUN_ENV = {
  SCF: "SCF",
};

export const ENDPOINT = {
  TCB: "tcb.tencentcloudapi.com",
  SCF: "scf.tencentcloudapi.com",
  COS: "cos.tencentcloudapi.com",
  FLEXDB: "flexdb.tencentcloudapi.com",
};

export const SERVICE_TYPE = {
  TCB: "tcb",
};

export const ERROR = {
  MISS_SECRET_INFO_IN_ENV: "MISS_SECRET_INFO_IN_ENV",
  MISS_SECRET_INFO_IN_ARGS: "MISS_SECRET_INFO_IN_ARGS",
  CURRENT_ENVIRONMENT_IS_NULL: "CURRENT_ENVIRONMENT_IS_NULL",
  ENV_ID_NOT_EXISTS: "ENV_ID_NOT_EXISTS",
};

export const PUBLIC_RSA_KEY = `
-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC0ZLB0ZpWWFsHPnDDw++Nc2wI3
nl2uyOrIJ5FUfxt4GAmt1Faf5pgMxAnL9exEUrrUDUX8Ri1R0KyfnHQQwCvKt8T8
bgILIJe9UB8e9dvFqgqH2oA8Vqwi0YqDcvFLFJk2BJbm/0QYtZ563FumW8LEXAgu
UeHi/0OZN9vQ33jWMQIDAQAB
-----END PUBLIC KEY-----
`;
export const ROLE_NAME = {
  TCB: "TCB_QcsRole",
};

export const SCF_STATUS = {
  ACTIVE: "Active",
  CREATING: "Creating",
  UPDATING: "Updating",
  CREATE_FAILED: "CreateFailed",
  UPDATE_FAILED: "UpdateFailed",
  PUBLISHING: "Publishing",
  PUBLISH_FAILED: "PublishFailed",
  DELETING: "Deleting",
  DELETE_FAILED: "DeleteFailed",
};

// 是否使用内网域名
export const USE_INTERNAL_ENDPOINT = "USE_INTERNAL_ENDPOINT" in process.env;
export const INTERNAL_ENDPOINT_REGION = process.env.INTERNAL_ENDPOINT_REGION;

export const enum COS_ENDPOINT {
  INTERNAL = "{Bucket}.cos-internal.{Region}.tencentcos.cn",
  PUBLIC = "{Bucket}.cos.{Region}.tencentcos.cn",
}

export const COS_SDK_PROTOCOL = process.env.COS_SDK_PROTOCOL;
export const COS_SDK_KEEPALIVE = process.env.COS_SDK_KEEPALIVE;

// SCF 临时 COS 配置（用于函数代码上传）
export const SCF_TEMP_COS: {
  APPID: string;
  REGION_PREFIX_MAP: Record<string, string>;
  DEFAULT_REGION_PREFIX: string;
  DEFAULT_REGION: string;
} = {
  APPID: "1253665819",
  // 区域前缀映射：region -> bucket 前缀
  REGION_PREFIX_MAP: {
    "ap-shanghai": "sh",
    "ap-guangzhou": "gz",
    "ap-beijing": "bj",
    "ap-singapore": "sg",
  },
  DEFAULT_REGION_PREFIX: "sh",
  DEFAULT_REGION: "ap-shanghai",
};
