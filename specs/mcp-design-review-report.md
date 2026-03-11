# MCP Tools Design Review Report

**Review Date**: 2026-03-11  
**Reviewer**: AI Agent  
**Scope**: All MCP tools in `mcp/src/tools/`

---

## Executive Summary

### Overall Status: ⚠️ **PARTIAL COMPLIANCE**

The CloudBase MCP toolkit shows **mixed adherence** to unified design guidelines. While recent tools (storage, cloudrun, functions layers) demonstrate good patterns, legacy tools exhibit inconsistencies that impact AI ergonomics and maintainability.

**Key Findings**:
- ✅ **Strengths**: Recent tools follow query/manage pattern, structured returns, safety flags
- ⚠️ **Concerns**: Inconsistent naming conventions, mixed return formats, incomplete nextActions
- ❌ **Critical Issues**: Some tools lack safety confirmations, unclear action boundaries

**Compliance Score**: 65/100
- Tool Responsibility & Naming: 70/100
- Query/Manage Pattern: 60/100  
- Read/Write Separation: 75/100
- Return Envelope & AI Ergonomics: 55/100
- Parameter Design & Safety: 65/100

---

## Per-Tool Checklist

### 1. Storage Tools (`storage.ts`) ✅ **COMPLIANT**

**Status**: Excellent example of query/manage pattern

**Strengths**:
- ✅ Clear separation: `queryStorage` (read) vs `manageStorage` (write)
- ✅ Action-based design with enum: `list | info | url` and `upload | download | delete`
- ✅ Safety: `delete` requires `force` flag with safe default
- ✅ Annotations: Proper `readOnlyHint`, `destructiveHint`, `category`

**Weaknesses**:
- ⚠️ Missing `nextActions` in responses
- ⚠️ No structured return envelope (still uses raw SDK results in some cases)

**Recommendations**:
- Add `nextActions` suggestions (e.g., after upload → suggest queryStorage to verify)
- Standardize return format to `{ success, data, message, nextActions }`

---

### 2. CloudRun Tools (`cloudrun.ts`) ✅ **COMPLIANT**

**Status**: Good adherence to lifecycle resource pattern

**Strengths**:
- ✅ Query/manage separation: `queryCloudRun` vs `manageCloudRun`
- ✅ Rich action set: `init | download | run | deploy | delete | createAgent`
- ✅ Safety: `delete` requires confirmation
- ✅ Clear descriptions for each action

**Weaknesses**:
- ⚠️ `init` action creates files locally - should clarify this is not cloud mutation
- ⚠️ Missing `nextActions` guidance after operations

**Recommendations**:
- Add `nextActions` (e.g., after deploy → suggest queryCloudRun to check status)
- Consider splitting `init` into separate tool (it's more of a scaffold generator)

---

### 3. Function Tools (`functions.ts`) ⚠️ **PARTIAL COMPLIANCE**

**Status**: Mixed - newer layer tools good, core function tools need alignment

**Strengths**:
- ✅ Layer tools follow pattern: `readFunctionLayers` / `writeFunctionLayers`
- ✅ Layer tools use structured returns with `nextActions`
- ✅ `manageFunctionTriggers` uses action-based design

**Weaknesses**:
- ❌ Core tools use inconsistent naming: `getFunctionList`, `createFunction`, `updateFunctionCode`, `updateFunctionConfig`, `invokeFunction`
- ❌ Most tools return raw SDK JSON strings instead of structured envelopes
- ⚠️ `getFunctionList(action="detail")` overlaps with `readFunctionLayers(action="getFunctionLayers")`
- ⚠️ Missing `nextActions` in most responses
- ⚠️ `invokeFunction` is execution action but not clearly separated

**Recommendations** (aligned with `specs/function-tool-ai-ergonomics/design.md`):
1. **Short-term** (non-breaking):
   - Add structured return envelopes to all function tools
   - Add `nextActions` suggestions
   - Add `view` parameter for summary/detail control
2. **Long-term** (breaking):
   - Consider consolidating to `queryFunctions` / `manageFunctions` pattern
   - Move `invokeFunction` to `manageFunctions(action="invoke")`
   - Extract logs to separate observability domain

---

### 4. NoSQL Database Tools (`databaseNoSQL.ts`) ⚠️ **PARTIAL COMPLIANCE**

**Status**: Follows read/write pattern but needs refinement

**Strengths**:
- ✅ Separation: `readNoSqlDatabaseStructure` / `writeNoSqlDatabaseStructure` / `readNoSqlDatabaseContent` / `writeNoSqlDatabaseContent`
- ✅ Action-based design within each tool
- ✅ Some tools return structured format with `success`, `message`

**Weaknesses**:
- ⚠️ Four tools for one domain - could be simplified to two (structure, content)
- ⚠️ Inconsistent return formats (some structured, some raw)
- ⚠️ Missing `nextActions`
- ⚠️ Tool names are verbose

**Recommendations**:
- Maintain current four-tool structure (it's declarative resource, not lifecycle)
- Standardize all returns to structured envelope
- Add `nextActions` (e.g., after createCollection → suggest readNoSqlDatabaseStructure)

---

### 5. SQL Database Tools (`databaseSQL.ts`) ✅ **COMPLIANT**

**Status**: Clean read/write separation

**Strengths**:
- ✅ Clear separation: `executeReadOnlySQL` vs `executeWriteSQL`
- ✅ Proper annotations: `readOnlyHint`, `destructiveHint`
- ✅ Structured returns with `success`, `message`, `result`

**Weaknesses**:
- ⚠️ Missing `nextActions`
- ⚠️ No safety confirmation for destructive SQL (DROP, DELETE)

**Recommendations**:
- Add `confirm` flag for destructive operations (DROP TABLE, DELETE without WHERE)
- Add `nextActions` (e.g., after CREATE TABLE → suggest security rule setup)

---

### 6. Hosting Tools (`hosting.ts`) ⚠️ **NEEDS IMPROVEMENT**

**Status**: Single tool, lacks query capability

**Strengths**:
- ✅ Clear purpose: upload files to static hosting
- ✅ Deployment notification integration

**Weaknesses**:
- ❌ No query tool to list/check hosted files
- ❌ No delete capability
- ⚠️ Missing structured return envelope
- ⚠️ No `nextActions`

**Recommendations**:
- Add `queryHosting` tool (list files, get file info, get domain config)
- Add `manageHosting` tool (upload, delete, configure domains)
- Migrate current `uploadFiles` to `manageHosting(action="upload")`

---

### 7. Environment Tools (`env.ts`) ✅ **GOOD**

**Status**: Well-designed with structured returns

**Strengths**:
- ✅ `auth` tool with clear action-based design
- ✅ Structured returns with `next_step` guidance
- ✅ Proper state management (AUTH_REQUIRED, AUTH_PENDING, etc.)
- ✅ `envQuery` provides comprehensive environment info

**Weaknesses**:
- ⚠️ `envDomainManagement` could be split into query/manage
- ⚠️ Some actions in `envQuery` are mutations (should be in separate tool)

**Recommendations**:
- Split `envDomainManagement` into `queryEnvDomains` / `manageEnvDomains`
- Move mutation actions from `envQuery` to `manageEnv`

---

### 8. Data Model Tools (`dataModel.ts`) ⚠️ **PARTIAL COMPLIANCE**

**Status**: Good concept, needs pattern alignment

**Strengths**:
- ✅ `manageDataModel` uses action-based design
- ✅ Mermaid diagram integration is innovative
- ✅ Async task monitoring built-in

**Weaknesses**:
- ⚠️ `modifyDataModel` is separate from `manageDataModel` - should be unified
- ⚠️ Missing query tool for listing/viewing data models
- ⚠️ Inconsistent return formats

**Recommendations**:
- Merge `modifyDataModel` into `manageDataModel(action="create" | "update")`
- Add `queryDataModel` tool for read operations
- Standardize return envelope

---

### 9. Interactive Tools (`interactive.ts`) ✅ **COMPLIANT**

**Status**: Well-designed for its purpose

**Strengths**:
- ✅ Clear action-based design: `clarify` vs `confirm`
- ✅ Proper annotations (not read-only, not destructive)
- ✅ Focused single responsibility

**Weaknesses**:
- None significant

**Recommendations**:
- Consider adding `nextActions` to guide AI after user response

---

### 10. RAG/Knowledge Tools (`rag.ts`) ✅ **COMPLIANT**

**Status**: Good design for knowledge retrieval

**Strengths**:
- ✅ `searchWeb` and `searchKnowledgeBase` are clearly read-only
- ✅ Mode-based design for knowledge base (vector, doc, openapi)
- ✅ Proper annotations

**Weaknesses**:
- ⚠️ Missing structured return envelope (returns raw results)
- ⚠️ No `nextActions`

**Recommendations**:
- Wrap results in structured envelope
- Add `nextActions` (e.g., suggest related doc searches)

---

### 11. Setup/Download Tools (`setup.ts`, `download.ts`) ⚠️ **NEEDS REVIEW**

**Status**: Special case - local file operations

**Strengths**:
- ✅ `downloadTemplate` is well-documented
- ✅ IDE filtering logic is sophisticated
- ✅ `downloadRemoteFile` has clear purpose

**Weaknesses**:
- ⚠️ `setup.ts` is extremely long (500+ lines) - violates single responsibility
- ⚠️ These are local operations, not cloud operations - unclear categorization
- ⚠️ Missing structured returns

**Recommendations**:
- Refactor `setup.ts` as per `specs/code-quality-analysis/REFACTORING_CHECKLIST.md`
- Add structured returns with `nextActions`
- Consider separate category annotation for local vs cloud tools

---

### 12. Security Rule Tools (`security-rule.ts`) ✅ **COMPLIANT**

**Status**: Good read/write separation

**Strengths**:
- ✅ Clear separation: `readSecurityRule` vs `writeSecurityRule`
- ✅ Proper safety annotations

**Weaknesses**:
- ⚠️ Missing `nextActions`
- ⚠️ Could benefit from structured return envelope

**Recommendations**:
- Add `nextActions` (e.g., after write → suggest read to verify)
- Standardize return format

---

### 13. Gateway Tools (`gateway.ts`) - **NOT REVIEWED** (file not examined in detail)

### 14. Invite Code Tools (`invite-code.ts`) ✅ **COMPLIANT**

**Status**: Simple, focused tool

**Strengths**:
- ✅ Single clear purpose
- ✅ Proper annotations

**Weaknesses**:
- ⚠️ Missing structured return
- ⚠️ No `nextActions`

---

## Cross-Cutting Issues

### 1. Naming Convention Inconsistency ❌ **CRITICAL**

**Problem**: Mixed naming patterns across tools

**Examples**:
- Storage: `queryStorage` / `manageStorage` ✅
- CloudRun: `queryCloudRun` / `manageCloudRun` ✅
- Functions: `getFunctionList`, `createFunction`, `updateFunctionCode` ❌
- Database: `readNoSqlDatabaseStructure`, `writeNoSqlDatabaseStructure` ⚠️
- SQL: `executeReadOnlySQL`, `executeWriteSQL` ⚠️

**Impact**: AI struggles to predict tool names, inconsistent mental model

**Recommendation**: Establish and enforce naming convention:
- **Lifecycle resources**: `query{Domain}` / `manage{Domain}`
- **Declarative resources**: `read{Domain}` / `write{Domain}` OR `query{Domain}` / `manage{Domain}`
- **Execution actions**: `execute{Action}` OR `invoke{Action}` OR fold into `manage(action=...)`

---

### 2. Return Format Inconsistency ❌ **CRITICAL**

**Problem**: Three different return patterns

**Patterns Found**:
1. **Raw SDK JSON string** (legacy functions, hosting)
2. **Structured envelope** (storage, cloudrun, newer tools)
3. **Mixed** (some database tools)

**Impact**: AI cannot reliably parse responses, token waste on verbose SDK output

**Recommendation**: Standardize ALL tools to:
```typescript
{
  success: boolean;
  data: T;
  message: string;
  nextActions?: Array<{
    tool: string;
    action?: string;
    reason: string;
  }>;
}
```

---

### 3. Missing nextActions Guidance ⚠️ **HIGH PRIORITY**

**Problem**: Most tools don't suggest next steps

**Impact**: AI must infer workflow, increases latency and errors

**Recommendation**: Add `nextActions` to ALL tools, especially:
- After create → suggest query to verify
- After update → suggest invoke/test
- After query → suggest related management actions
- After error → suggest diagnostic tools

---

### 4. Safety Confirmation Gaps ⚠️ **HIGH PRIORITY**

**Problem**: Some destructive operations lack confirmation flags

**Examples**:
- ✅ Storage delete: requires `force` flag
- ✅ CloudRun delete: requires confirmation
- ❌ SQL DELETE/DROP: no confirmation required
- ❌ Function delete: (need to verify)

**Recommendation**: ALL destructive operations must require explicit confirmation:
- `confirm: boolean` (default: false)
- `force: boolean` (default: false)
- `dryRun: boolean` (optional, for preview)

---

### 5. Action Boundary Clarity ⚠️ **MEDIUM PRIORITY**

**Problem**: Some tools mix query and mutation actions

**Examples**:
- `envQuery` has some mutation actions
- `getFunctionList(action="detail")` vs `readFunctionLayers(action="getFunctionLayers")` overlap

**Recommendation**:
- Strictly separate read-only tools from mutation tools
- Document action boundaries in tool descriptions
- Use annotations to enforce (`readOnlyHint`, `destructiveHint`)

---

## Actionable Recommendations

### Priority 1: Critical (Do First) 🔴

1. **Standardize Return Envelopes** (2-3 days)
   - Create `utils/response-builder.ts` with standard envelope builder
   - Migrate all tools to use structured returns
   - Add `nextActions` field to all responses

2. **Add Safety Confirmations** (1 day)
   - Audit all destructive operations
   - Add `confirm`/`force` flags where missing
   - Update tool schemas and descriptions

3. **Document Naming Convention** (1 day)
   - Write official naming guide in `specs/mcp-tool-naming-convention.md`
   - Classify each domain as lifecycle vs declarative
   - Create migration plan for legacy tools

### Priority 2: High (Do Soon) 🟡

4. **Refactor Function Tools** (3-5 days)
   - Follow `specs/function-tool-ai-ergonomics/design.md`
   - Add structured returns and `nextActions`
   - Add `view` parameter for summary/detail control
   - Consider long-term migration to query/manage pattern

5. **Add Missing Query Tools** (2-3 days)
   - Add `queryHosting` for static hosting
   - Add `queryDataModel` for data models
   - Split `envDomainManagement` into query/manage

6. **Refactor setup.ts** (2-3 days)
   - Follow `specs/code-quality-analysis/REFACTORING_CHECKLIST.md`
   - Extract download, extract, filter, copy logic
   - Reduce main function to <100 lines

### Priority 3: Medium (Plan For) 🟢

7. **Unify Database Tool Returns** (1-2 days)
   - Standardize NoSQL tool returns
   - Add `nextActions` to all database tools

8. **Add nextActions Everywhere** (2-3 days)
   - Audit all tools for missing `nextActions`
   - Add contextual suggestions based on operation result

9. **Improve Tool Descriptions** (1-2 days)
   - Clarify action boundaries
   - Add examples for complex actions
   - Document parameter dependencies

### Priority 4: Low (Future) 🔵

10. **Consider Long-term Consolidation** (planning)
    - Evaluate migrating all lifecycle resources to query/manage
    - Evaluate extracting logs to separate observability domain
    - Evaluate consolidating execution actions

---

## Success Metrics

### Compliance Targets (6 months)

- **Naming Consistency**: 95% of tools follow convention
- **Return Format**: 100% use structured envelope
- **nextActions Coverage**: 90% of tools provide guidance
- **Safety Confirmations**: 100% of destructive ops require confirmation
- **Documentation**: All tools have clear action boundaries

### AI Ergonomics Metrics

- **Tool Discovery**: AI can predict tool names with 90% accuracy
- **Response Parsing**: AI can reliably extract data from 100% of responses
- **Workflow Efficiency**: Average tool calls per task reduced by 20%
- **Error Recovery**: AI can self-correct from errors 80% of the time

---

## Conclusion

The CloudBase MCP toolkit demonstrates **strong foundational patterns** in newer tools (storage, cloudrun, function layers) but suffers from **legacy inconsistencies** that impact AI ergonomics and developer experience.

**Key Takeaways**:
1. ✅ **Good foundation**: Query/manage pattern works well for lifecycle resources
2. ⚠️ **Inconsistency**: Mixed naming and return formats create friction
3. 🎯 **Clear path forward**: Standardization roadmap is achievable

**Recommended Approach**:
- **Phase 1** (1-2 weeks): Fix critical issues (returns, safety, naming guide)
- **Phase 2** (2-4 weeks): Refactor high-priority tools (functions, hosting, setup)
- **Phase 3** (1-2 months): Add missing features (nextActions, query tools)
- **Phase 4** (ongoing): Long-term consolidation and optimization

By following this roadmap, the toolkit can achieve **90%+ compliance** with unified design guidelines within 3-4 months, significantly improving AI ergonomics and maintainability.


