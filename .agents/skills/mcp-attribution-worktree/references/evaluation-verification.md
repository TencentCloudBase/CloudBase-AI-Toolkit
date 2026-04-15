# Evaluation Verification

## Purpose

Use this reference when you need to verify that a proposed fix or repair direction actually works in a real evaluation run.

## Core rule

Do not treat implementation or static reasoning as proof of success.

When the AI Coding Eval Report API is available, validation means:

1. trigger a real evaluation run
2. wait for it to finish
3. read the final result
4. decide pass or fail from the returned run result

## Required flow

After you believe the implementation is ready:

1. `POST /api/evaluations`
2. record `caseId` and `runId`
3. poll `GET /api/evaluations/{caseId}/{runId}`
4. once finished, read `GET /api/runs/{caseId}/{runId}/result`
5. optionally read `trace` and `evaluation-trace` if the run failed or is ambiguous

Do not claim "validated" before step 4 is complete.

## Required request shape

The request body must include:

- `caseId`
- `config`

Typical config fields:

- `mcp`
- `tcbCli`
- `skillsMode`
- `mcpPackage`
- `skillsRepo`
- `skillsRef`
- `skillsPath`
- `allInOneSkillsRepo`
- `allInOneSkillsRef`
- `allInOneSkillsLocalPath`
- `apiSkillsRepo`
- `apiSkillsRef`
- `apiSkillsPath`
- `agentType`
- `model`
- `evalModel`
- `maxTurns`
- `caseTimeoutSeconds`
- `evaluationTimeoutMs`

## Local build expectations

When local MCP code is under test:

- build `mcp` first
- pass the absolute path to `mcp/dist/cli.cjs` as `config.mcpPackage`

When `skillsMode=allinone` is under test:

- build the local all-in-one skill bundle first
- pass the absolute bundle path as `config.allInOneSkillsLocalPath`

## Result interpretation

Use the final run result as the source of truth.

### Pass

Treat the evaluation as passed when:

- `result.status == "pass"`
- and there is no failed test signal

### Fail

Treat the evaluation as failed when any of these are true:

- `result.status == "fail"`
- `result.status == "error"`
- `result.status == "timeout"`
- `tests.failed > 0`
- `error` is present

## Failure follow-up

If the run fails:

1. capture the failure summary
2. inspect `trace` and `evaluation-trace`
3. decide whether the problem is:
   - still the same root cause
   - a new regression
   - environment noise
4. continue the repair loop if needed

## Reporting format

Every verification summary should include at least:

- `caseId`
- `runId`
- evaluation status
- overall score when available
- tests passed / failed / total when available
- whether validation passed
- failure reason when it did not pass

## Attribution rule

If real evaluation is available, do not move a repairable issue to `resolved` until the final evaluation result supports closure or there is another explicit closure reason.
