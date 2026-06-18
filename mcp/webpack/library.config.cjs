const path = require('path');
const { merge } = require('webpack-merge');
const createBaseConfig = require('./base.config.cjs');
const createMinimalExternals = require('./minimal-externals.cjs');
const webpack = require('webpack');

/**
 * 库文件配置
 * 生成 ESM 和 CJS 两种格式的库文件
 */
function createLibraryConfigs() {
  const baseConfig = createBaseConfig();
  
  // ESM 版本配置
  const esmConfig = merge(baseConfig, {
    name: 'library-esm',
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, '../dist'),
      filename: 'index.js',
      library: {
        type: 'module'
      },
      chunkFormat: 'module',
      environment: {
        module: true,
        dynamicImport: true
      }
    },
    experiments: {
      outputModule: true
    },
    externalsType: 'module',
    externals: [/^node:.+$/, /^[^./].*$/], // 外部化所有 node_modules 依赖和 node: 内建模块
  });

  // CJS 版本配置
  const cjsConfig = merge(baseConfig, {
    name: 'library-cjs',
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, '../dist'),
      filename: 'index.cjs',
      library: {
        type: 'commonjs2'
      }
    },
    optimization: {
      usedExports: false,  // 防止 webpack tree-shake 误删动态引用的导出
                           // 如 source-map-support 的 _createParsedCallSite
                           //（通过 self._createParsedCallSite 动态引用）
    },
    plugins: [
      new webpack.DefinePlugin({ 
        // 修复 import.meta.url 在编译时被替换成绝对路径的问题
        "import.meta.url": "('file://' + __filename)",
      }),
    ],
    externals: createMinimalExternals('commonjs')
  });

  return [esmConfig, cjsConfig];
}

module.exports = createLibraryConfigs; 