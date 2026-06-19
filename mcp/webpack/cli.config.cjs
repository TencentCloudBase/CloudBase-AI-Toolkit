const path = require('path');
const webpack = require('webpack');
const { merge } = require('webpack-merge');
const TerserPlugin = require('terser-webpack-plugin');
const createBaseConfig = require('./base.config.cjs');
const createMinimalExternals = require('./minimal-externals.cjs');

/**
 * CLI 配置
 * 生成 ESM 和 CJS 两种格式的 CLI 文件
 */
function createCLIConfigs() {
  const baseConfig = createBaseConfig();
  
  // CLI 插件配置
  const cliPlugins = [
    new webpack.BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
      entryOnly: true
    }),
    new webpack.DefinePlugin({ 
      // 修复 import.meta.url 在编译时被替换成绝对路径的问题
      "import.meta.url": "('file://' + __filename)",
    }),
  ];

  // CJS 版本配置
  const cjsConfig = merge(baseConfig, {
    name: 'cli-bundle-cjs',
    entry: './src/cli.ts',
    output: {
      path: path.resolve(__dirname, '../dist'),
      filename: 'cli.cjs',
      library: {
        type: 'commonjs2'
      }
    },
    externals: createMinimalExternals('commonjs'),
    plugins: [
      ...baseConfig.plugins,
      ...cliPlugins
    ],
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: false, // 保留 console，CLI 可能需要
              drop_debugger: true,
              pure_funcs: ['console.debug'], // 移除 debug 日志
              passes: 2, // 多次压缩以进一步减小体积
              unsafe: false, // 保持安全性
              unsafe_comps: false,
              unsafe_math: false,
              unsafe_methods: false,
              unsafe_proto: false,
              unsafe_regexp: false,
              unsafe_undefined: false,
              dead_code: true, // 移除死代码
              unused: true, // 移除未使用的代码
              collapse_vars: true, // 合并变量
              reduce_vars: true, // 减少变量
              inline: true, // 内联函数
              reduce_funcs: true, // 减少函数
              keep_classnames: false, // 移除类名以减小体积
              keep_fnames: false // 移除函数名以减小体积
            },
            format: {
              comments: false, // 移除注释
              ascii_only: false, // 允许 Unicode 字符
              beautify: false, // 不美化代码
              ecma: 2020, // 使用 ES2020 语法
              safari10: false // 不需要 Safari 10 兼容性
            },
            mangle: {
              toplevel: true, // 混淆顶级作用域
              properties: false, // 不混淆属性名（避免破坏功能）
              keep_classnames: false,
              keep_fnames: false
            }
          },
          extractComments: false
        })
      ]
    }
  });

  return [cjsConfig];
}

module.exports = createCLIConfigs; 