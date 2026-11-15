const TerserPlugin = require('terser-webpack-plugin');

/**
 * Minifier for the library entries (dist/index.js, dist/index.cjs).
 *
 * These files are imported by code (e.g. `require('@cloudbase/cloudbase-mcp')`
 * in enterprise wrappers and hosted services), so unlike the CLI bundle we keep
 * function and class names: stack traces stay readable for embedders, and any
 * dependency that inspects `constructor.name` keeps working. Property names are
 * never mangled, so exported names and tool schemas are untouched.
 *
 * Set MCP_LIB_MINIFY=0 to build an unminified reference copy (used by the
 * parity check in scripts/verify-lib-minify-parity.mjs).
 */
function libraryMinifyEnabled() {
  return process.env.MCP_LIB_MINIFY !== '0';
}

function libraryTerser() {
  return new TerserPlugin({
    extractComments: false,
    terserOptions: {
      compress: {
        passes: 2,
        drop_debugger: true,
        keep_fnames: true,
        keep_classnames: true,
      },
      mangle: {
        properties: false,
        keep_fnames: true,
        keep_classnames: true,
      },
      format: { comments: false, ecma: 2020 },
    },
  });
}

function libraryOptimization() {
  return libraryMinifyEnabled()
    ? { minimize: true, minimizer: [libraryTerser()] }
    : { minimize: false };
}

module.exports = { libraryTerser, libraryOptimization, libraryMinifyEnabled };
