# Tool surface baselines

Snapshots of what every MCP client receives from `tools/list`, checked by
`mcp/src/tool-surface/tool-surface.test.ts` (`npm run test:tool-surface` in `mcp/`).

| File | Guards | Refresh |
| --- | --- | --- |
| `contract.json` | tool names, order, annotations, input schema structure (all keys except `description`) | `npm run update:tool-surface` — structural changes must first be declared in `contract-allowed-diff.json` |
| `contract-allowed-diff.json` | `{ tool, path, reason }` entries for intended structural changes | edit by hand, clear after the baseline is refreshed |
| `samples.json` | which generated argument samples each tool accepts or rejects | `UPDATE_TOOL_SURFACE_SAMPLES=1` (only for an intended contract change) |
| `lint.json` | schema shape findings; new findings fail, fixed ones are dropped on refresh | `npm run update:tool-surface` |
| `budget.json` | `tools/list` bytes and description characters per language (+3% tolerance) | `npm run update:tool-surface` |
| `constraints.json` | constraint sentences (must / do not / use X instead / confirm ...) that must stay verbatim in tool descriptions | `UPDATE_TOOL_SURFACE_CONSTRAINTS=1` (rare; the diff shows every sentence that changed) |

Lint categories:

- **A** description lists fixed values but the field has no `enum`
- **B** field has an `enum` and the description repeats the bare value list
- **C** parameter description longer than 300 characters
- **D** duplicated object subtree inside one tool
- **E** parameter description explains three or more sibling parameters
- **F** MCP shape: root must be `type: "object"` without root-level `oneOf`/`anyOf`/`allOf`; no `$ref`/`$defs`; closed value sets use `enum` rather than `anyOf` of `const`; nested `oneOf` branches must be distinguishable by type or a `const` field
