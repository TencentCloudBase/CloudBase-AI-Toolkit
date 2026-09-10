import { defineModule } from "../types.js";

export const cloudrunConfig = defineModule(
  {
    cpuMemPairRequired:
      "更新云托管配置时必须同时提供 Cpu 和 Mem（平台要求成对提供）。",
  },
  {
    cpuMemPairRequired:
      "Cpu and Mem must be provided together when updating CloudRun config (platform requires the pair).",
  },
);
