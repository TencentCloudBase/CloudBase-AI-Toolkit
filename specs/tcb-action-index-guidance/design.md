# 技术方案设计

## 概述

本方案已经收敛为一条可复用的数据链路：

1. 将 CloudBase `tcb` 管控面 OpenAPI YAML 作为源码资产入仓
2. 用脚本展开多层 `$ref`
3. 生成一个适合 webpack 打包的轻量 TypeScript action map
4. 在 `callCloudApi(service="tcb")` 失败时，基于该 map 给出 Action 候选、参数键提示和带注释的 TS 参数类型参考

方案不新增 tool，不做调用前强制校验，也不在运行时解析原始 YAML。

## 当前实现对应

### 源数据

- [tcb-openapi.yaml](/Users/bookerzhao/Projects/cloudbase-turbo-delploy/mcp/assets/control-plane/tcb-openapi.yaml)
  - 作为 `tcb` 管控面 Action 的唯一语义源
  - 保留原始 OpenAPI 结构，供后续继续重生成

### 生成脚本

- [generate-tcb-action-index.mjs](/Users/bookerzhao/Projects/cloudbase-turbo-delploy/scripts/generate-tcb-action-index.mjs)
  - 读取 YAML
  - 解析 `paths -> operationId`
  - 递归展开 `#/components/schemas/*` 多层引用
  - 从请求 schema 提取顶层参数键、必填键、示例参数
  - 把 schema 转成带注释的 TS 参数类型字符串
  - 生成排序稳定的 TS 模块

### 运行时产物

- [tcb-action-index.ts](/Users/bookerzhao/Projects/cloudbase-turbo-delploy/mcp/src/generated/tcb-action-index.ts)
  - 被 `capi.ts` 直接 import
  - 随 webpack 进入最终 MCP bundle
  - 不再要求运行时访问 YAML 文件

### 接入点

- [capi.ts](/Users/bookerzhao/Projects/cloudbase-turbo-delploy/mcp/src/tools/capi.ts)
  - `tcb` Action 名不存在时给出相近候选
  - 参数错误时给出常见参数键、必填键和 TS 参数类型参考
  - 非 `tcb` service 保持现有通用引导逻辑

## 数据结构

当前生成出的运行时 map 结构是：

```ts
export type TcbActionIndexEntry = {
  action: string;
  path: string;
  method: string;
  description: string;
  paramKeys: string[];
  requiredKeys: string[];
  exampleParams?: Record<string, unknown>;
  paramsType: string;
};
```

设计取舍：
- 保留 `paramKeys` / `requiredKeys`，用于短提示
- 保留 `exampleParams`，用于后续构造更贴近真实的请求示例
- 保留 `paramsType`，用于直接向 AI 返回 TS 风格提示
- 不再保留完整 `requestShape` JSON，避免 token 和 bundle 体积膨胀

## TS 类型生成策略

`paramsType` 的目标不是生成完美 SDK 类型，而是生成“足够短、足够可复用、适合提示”的 TS 片段。

当前规则：

1. 顶层输出 `type XxxParams = ...`
2. 对象字段根据 `required` 生成必填或可选属性
3. 基础类型映射：
   - `string -> string`
   - `integer/number -> number`
   - `boolean -> boolean`
   - `array -> (...)[]`
4. 多层 `$ref` 展开后继续递归生成嵌套对象类型
5. 字段 `description` 会转成 TS 注释
6. 如果 YAML 中存在正式 `enum`，会生成字面量联合类型
7. 当前这份 `tcb` YAML 几乎没有标准 `enum` 字段，因此更多是把“可选值说明”保留在注释里

示例输出形态：

```ts
/**
 * 销毁环境
 */
type DestroyEnvParams = {
  /**
   * 环境Id
   */
  "EnvId": string;
  /**
   * 是否绕过资源检查...
   */
  "BypassCheck"?: boolean;
};
```

## 运行时行为

### Action 错误

当 `callCloudApi(service="tcb")` 返回“Action 不存在 / 未识别 / not found”类错误时：

- 基于轻量 action map 做相似度排序
- 返回 1 到 3 个最接近的真实 Action 名
- 同时保留现有官方文档引导

### 参数错误

当 `callCloudApi(service="tcb")` 返回“参数不存在 / 缺少参数 / missing parameter”类错误时：

- 如果 map 中命中了该 Action：
  - 返回 `paramKeys`
  - 返回 `requiredKeys`
  - 返回带注释的 `paramsType`

### 非强制校验

调用前不做阻断：

- 不因为 Action 不在 map 中而拒绝调用
- 不因为 `params` 与 map 不一致而拒绝调用
- map 仅用于失败后的恢复提示

## 打包策略

当前实现采用“源码生成 + 产物入库”的模式：

- 维护者更新 YAML 后执行：
  - `node scripts/generate-tcb-action-index.mjs`
- 生成后的 [tcb-action-index.ts](/Users/bookerzhao/Projects/cloudbase-turbo-delploy/mcp/src/generated/tcb-action-index.ts) 一并提交

这样做的原因：
- 无需 webpack YAML loader
- 无需运行时文件 IO
- 最终 bundle 只消费普通 TS 模块

## 体积取舍

当前实现已经从“保留完整 request shape”收敛到“保留轻量提示信息”：

- 原始 YAML 约 `255KB`
- 初版生成产物约 `69KB`
- 当前轻量 map 约 `24KB`

这个体积已经足够适合作为 MCP 运行时提示数据进入 bundle。

## 测试与验证

当前已验证：

- [capi.test.ts](/Users/bookerzhao/Projects/cloudbase-turbo-delploy/mcp/src/tools/capi.test.ts)
  - `tcb` Action 拼写错误时能提示候选
  - `tcb` 参数错误时能提示参数键和 TS 类型
  - 非 `tcb` service 不会错误套用 `tcb` 提示

已执行：
- `npx vitest run mcp/src/tools/capi.test.ts`
- `cd mcp && npm run build`

## 后续自动化空间

这版实现已经具备后续自动化基础。未来如果你继续给新的 YAML，可以直接复用同一脚本，后续可选增强包括：

- 支持更多 service 的 control-plane YAML
- 生成独立 `d.ts` 产物
- 在错误提示中按需裁剪更短的 TS 片段
- 将 `exampleParams` 进一步清洗成更贴近真实 MCP 调用的示例
