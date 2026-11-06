import { defineModule } from "../types.js";

export const cloudrunConfig = defineModule(
  {
    cpuMemPairRequired:
      "更新云托管配置时必须同时提供 Cpu 和 Mem（平台要求成对提供）。",
    unknownNestedKey:
      "serverConfig.{path} 里的字段 `{key}` 不受支持，已在本地下发前拦截。{path} 支持：{allowed}。请改用上述字段名（云 API 不认的字段会直接报 not recognized）。",
  },
  {
    cpuMemPairRequired:
      "Cpu and Mem must be provided together when updating CloudRun config (platform requires the pair).",
    unknownNestedKey:
      "Unsupported field `{key}` in serverConfig.{path}; blocked locally before sending. {path} supports: {allowed}. Use one of those names — the Cloud API rejects unknown fields with \"not recognized\".",
  },
);
