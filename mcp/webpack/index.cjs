const createLibraryConfigs = require('./library.config.cjs');
const createCLIConfigs = require('./cli.config.cjs');

/**
 * 主 webpack 配置文件
 * 合并所有构建目标的配置
 */
module.exports = [
  // 库文件配置 (ESM + CJS)
  ...createLibraryConfigs(),
  
  // CLI 配置 (ESM + CJS)
  ...createCLIConfigs()
]; 