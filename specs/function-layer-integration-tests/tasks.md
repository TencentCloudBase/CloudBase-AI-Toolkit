# Implementation Plan

- [x] 1. Add design and tasks for layer integration tests spec
  - Add `specs/function-layer-integration-tests/design.md`
  - Add `specs/function-layer-integration-tests/tasks.md`
  - _Requirement: 1, 4, 5, 6_

- [x] 2. Add minimal layer content fixture
  - Create `tests/fixtures/layer-integration-content/` with minimal valid content for createLayerVersion
  - _Requirement: 2, 4_

- [x] 3. Implement real integration test flow (create + read + delete)
  - Opt-in via `CLOUDBASE_RUN_LAYER_INTEGRATION_TESTS=1` and credentials check
  - Unique layer name; createLayerVersion with contentPath; listLayerVersions; deleteLayerVersion
  - Cleanup on failure with clear step naming
  - _Requirement: 1, 2, 4, 5_

- [x] 4. Implement attach/detach when test function name is set
  - Use `CLOUDBASE_LAYER_TEST_FUNCTION_NAME`; attachLayer; getFunctionLayers; detachLayer (updateFunctionLayers left for future if needed)
  - _Requirement: 3, 4, 5_

- [x] 5. Run tests and verify (skip when opt-in not set)
  - Run `npm run build && npx vitest run ../tests/function-layer-tools.test.js` from mcp; ensure no false failures when skipped
  - _Requirement: 1, 5_
