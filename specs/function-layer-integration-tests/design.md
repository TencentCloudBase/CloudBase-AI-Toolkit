# Technical Design

## Overview

Add optional real integration tests for function layer tools that run against a real CloudBase environment only when credentials and an explicit opt-in env var are set. Tests use MCP `callTool` for `readFunctionLayers` and `writeFunctionLayers` only; no direct SDK usage.

## Triggering and Scope

- **Opt-in**: Run only when `CLOUDBASE_RUN_LAYER_INTEGRATION_TESTS=1` and CloudBase credentials are present (`TENCENTCLOUD_SECRETID`, `TENCENTCLOUD_SECRETKEY`, `CLOUDBASE_ENV_ID`).
- **Optional function**: If `CLOUDBASE_LAYER_TEST_FUNCTION_NAME` is set, tests include attach/detach/updateFunctionLayers; otherwise only create + delete layer version.

## Test Flow

1. **Create**: `writeFunctionLayers(action="createLayerVersion")` with a unique layer name (e.g. `mcp-layer-integration-{timestamp}`), `contentPath` pointing to a minimal fixture directory, and a supported runtime (e.g. `Nodejs16.13`).
2. **Read back**: `readFunctionLayers(action="listLayerVersions", name)` to confirm the version exists.
3. **Bind (if function name set)**: `writeFunctionLayers(action="attachLayer")` then `readFunctionLayers(action="getFunctionLayers", functionName)` to verify. Optionally `updateFunctionLayers` to assert order.
4. **Unbind (if bound)**: `writeFunctionLayers(action="detachLayer")`.
5. **Cleanup**: `writeFunctionLayers(action="deleteLayerVersion")` with the created name and version.

On any step failure, attempt cleanup (detach then delete) and report step name, resource names, and error.

## Fixture

- **Path**: `tests/fixtures/layer-integration-content/` with minimal valid content (e.g. `node_modules/.gitkeep` or a single file) so that the layer zip is non-empty and acceptable by the platform.
- **Usage**: Tests resolve absolute path via `path.join(__dirname, 'fixtures', 'layer-integration-content')` and pass as `contentPath`.

## Implementation Location

- Same file as existing layer tests: `tests/function-layer-tools.test.js`.
- New `describe("Function layer tools real integration tests")` with one or two test cases (full flow; optional attach flow when function name is set). Use `beforeAll`/`afterAll` for client; inside test use try/finally for cleanup.

## Skip and Reporting

- If opt-in or credentials are missing: skip with `test.skip` or early return and `console.log` explaining the skip reason.
- On failure: throw (or fail assertion) with message including step name (e.g. "createLayerVersion"), layer name, and error message so maintainers can diagnose quickly.
