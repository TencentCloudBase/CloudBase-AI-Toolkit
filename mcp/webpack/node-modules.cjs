/**
 * Node.js 内置模块列表
 * 这些模块应该保持外部化，不被打包
 */
module.exports = [
  // 核心模块
  'fs', 'path', 'os', 'crypto', 'url', 'http', 'https', 'net', 'dns', 'zlib',
  'fs/promises', 'child_process', 'util', 'stream', 'events', 'buffer', 'process',
  'querystring', 'string_decoder', 'timers', 'tty', 'vm', 'worker_threads',
  'cluster', 'dgram', 'readline', 'repl', 'perf_hooks', 'inspector', 'async_hooks',
  'trace_events', 'v8', 'constants', 'assert', 'module', 'domain', 'punycode',
  
  // 带 node: 前缀的模块
  /^node:/
]; 