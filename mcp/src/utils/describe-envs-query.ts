/**
 * 账号级 DescribeEnvs 的查询口径 —— 唯一真源。
 *
 * EnvTypes 是白名单语义（不为空时以该字段为准）：少写一个值不会报错，只会静默
 * 少一类环境。2026-10 的客户案例就是这样：平台侧代建的环境 EnvType=platform，
 * 控制台能列、MCP 拉不到，用户看到的是「请先创建环境」，现场没有任何错误可看。
 *
 * - baas / weda：标准云开发、微搭，MCP 工具主要面向这两类
 * - platform：平台侧代建的环境（site-* 一类），控制台列这类
 *
 * 未纳入 hosting / run（云托管）、tcbgw、paas：MCP 历史上就没列过，加进来会让
 * 用户在环境候选里看到一堆用不了的托管环境。授权页那份白名单多一个 hosting，
 * 是历史原因，两边差异是有意的。
 */

/** 允许出现在环境候选列表里的 EnvType */
export const DESCRIBE_ENVS_ENV_TYPES = ["baas", "weda", "platform"];

/**
 * IsVisible=false 表示 Channels 是「排除列表」：
 * 这 4 个渠道创建的环境不参与环境候选，其余渠道（含控制台的 qc_console）正常返回。
 */
export const DESCRIBE_ENVS_EXCLUDED_CHANNELS = ["dcloud", "iotenable", "tem", "scene_module"];

export interface DescribeEnvsFilter {
    EnvTypes: string[];
    IsVisible: boolean;
    Channels: string[];
}

/** 生成 DescribeEnvs 的 Param 过滤段；每次返回新数组，避免调用方改到共享常量 */
export function buildDescribeEnvsFilter(): DescribeEnvsFilter {
    return {
        EnvTypes: [...DESCRIBE_ENVS_ENV_TYPES],
        IsVisible: false,
        Channels: [...DESCRIBE_ENVS_EXCLUDED_CHANNELS],
    };
}
