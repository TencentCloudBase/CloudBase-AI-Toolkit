/**
 * 真正无法打包的问题依赖列表
 * 这些依赖存在严重的兼容性问题，必须排除
 */
module.exports = [
  // 只排除真正有严重问题的依赖
  'electron', // 平台特定，无法在 Node.js 环境运行
  
  // AWS SDK (体积过大，且有兼容性问题)
  /^@aws-sdk\//,
  
  // Babel 相关 (体积过大，且有兼容性问题)
  'babel-core', 'core-js-compat',
  // 暂时不排除 Babel 相关依赖，因为它们都是必需的
  // /^@babel\//,
  
  // 终端相关 (有兼容性问题)
  'terminal-kit',
  
  // 其他有问题的依赖
  'fsevents', /^@swc\/core.*$/
]; 