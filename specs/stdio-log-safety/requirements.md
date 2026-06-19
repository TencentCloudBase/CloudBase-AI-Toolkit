# 需求文档

## 介绍

为保证 mcp 以 stdio 协议运行时（如被 IDE/AI 工具以子进程调用），不会因依赖包或业务代码的 console 日志污染 stdout，导致协议解析异常，需在 CLI 入口自动劫持 console 系列方法，统一通过 logger.ts 的日志方法输出。

## 需求

### 需求 1 - CLI 模式下统一日志输出

**用户故事：**  
作为 mcp 的开发者和用户，我希望在 CLI 入口自动劫持所有 console.log、console.error、console.warn、console.info 等日志方法，统一通过 logger.ts 的日志方法输出，避免日志污染 stdio 协议流，提升协议健壮性和兼容性。

#### 验收标准

1. While mcp 以 CLI 方式运行时, when 代码或依赖包调用 console.log/console.error/console.warn/console.info, the mcp shall 自动将日志内容通过 logger.ts 的 info/warn/error 方法输出，不再直接输出到 stdout。
2. While mcp 以 CLI 方式运行时, when 有日志输出, the mcp shall 不污染 stdout 协议流，所有日志仅写入日志文件或 stderr。
3. While mcp 以 CLI 方式运行时, when 劫持生效, the mcp shall 不影响 logger.ts 的原有日志能力和日志级别控制。
4. While mcp 以 CLI 方式运行时, when 业务代码或依赖包调用 console.log 等, the mcp shall 不抛出异常或影响主流程。 