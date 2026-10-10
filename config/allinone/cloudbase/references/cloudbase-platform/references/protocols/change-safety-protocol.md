# Change Safety Protocol

**Mandatory protocol** for all non-trivial code and configuration changes.

## When This Protocol Applies

You must follow this protocol for any of the following:
- Changes to data models, fields, query conditions, or schemas
- Modifications to permissions, security rules, or access control
- Changes to authentication flows, login methods, or user management
- Interface contracts, function signatures, or API behavior changes
- Deployment configuration, environment variables, routing, or hosting settings

**Exempt** for purely trivial edits (text changes, comments, logs, formatting, or debug statements).

## Required Steps (Non-Negotiable)

1. **Before making any edits**, explicitly declare the impact in one clear sentence:
   > This change affects: [specific files / fields / permissions / contracts / behavior]

2. **Obtain explicit user confirmation** before proceeding with any code or configuration changes.

3. **After editing**, immediately perform verification:
   - Run syntax or type checking
   - Execute at least one minimal verification case
   - Confirm that no new errors were introduced

4. **Escalation rule (hard stop)**
   - If the same root-cause symptom occurs **3 or more times** during this task → **stop patching immediately**.
   - You must output:
     - One-sentence root cause analysis
     - Complete scope of impact
     - Recommended holistic fix (do not continue making incremental patches)

## Recommended Response Templates

**Before editing:**
> This change affects: [xxx]. Do you confirm I should proceed?

**After verification:**
> Syntax check and minimal verification case completed. Change is effective.

**When escalation triggers:**
> The same issue has recurred 3 times. Stopping incremental fixes. Root cause analysis: ...

## Purpose

This protocol exists to eliminate endless correction loops and repeated trial-and-error. It enforces structured thinking and significantly reduces decision entropy while maintaining very low token cost.

**Usage instruction:**
> Before any non-trivial code or configuration change, strictly follow the Change Safety Protocol in `cloudbase-platform/references/protocols/change-safety-protocol.md`.
