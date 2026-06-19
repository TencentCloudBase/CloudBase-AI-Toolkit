const path = require('path');
const webpack = require('webpack');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

/**
 * 基础 webpack 配置
 * 包含所有构建目标共享的配置
 */
function createBaseConfig() {
  return {
    mode: 'production',
    target: 'node',
    node: {
      __dirname: false,
      __filename: false,
    },
    resolve: {
      extensions: ['.ts', '.js'],
      extensionAlias: {
        // 处理 TypeScript ESM 导入中的 .js 扩展名
        '.js': ['.ts', '.js'],
      },
      fallback: {
        // 在 Node.js 环境中我们不需要这些 polyfills
        "buffer": false,
        "process": false,
      }
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true, // 类型检查由 ForkTsCheckerWebpackPlugin 处理
                configFile: 'tsconfig.json'
              }
            }
          ],
          exclude: /node_modules/
        }
      ]
    },
    plugins: [
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          configFile: path.resolve(__dirname, '../tsconfig.json'),
        }
      }),
      // 忽略有问题的 native 依赖
      new webpack.IgnorePlugin({
        resourceRegExp: /^(fsevents|@swc\/core.*)$/,
      }),
      // 忽略 @aws-sdk/client-s3 相关模块
      new webpack.IgnorePlugin({
        resourceRegExp: /^@aws-sdk\/client-s3$/,
      }),
      // 定义构建时的全局变量
      new webpack.DefinePlugin({
        __MCP_VERSION__: JSON.stringify(require('../package.json').version),
      }),
    ],
    optimization: {
      minimize: false, // 启用压缩来减小文件体积
    },
    stats: {
      warnings: false, // 忽略循环依赖警告
    }
  };
}

module.exports = createBaseConfig;
