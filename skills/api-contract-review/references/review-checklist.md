# API Contract Review Checklist

## Purpose

Use this checklist when reviewing CloudBase cloud API wrappers, MCP tools, generated metadata, and related docs for contract correctness.

## Mandatory source order

1. CloudBase API overview: `https://cloud.tencent.com/document/product/876/34809`
2. Dependency-resource API docs when the action touches dependent resources: `https://cloud.tencent.com/document/product/876/34808`
3. CloudBase Manager SDK docs before approving any direct Cloud API path: `https://docs.cloudbase.net/api-reference/manager/node/introduction`

If the relevant docs still do not clearly support the action or payload, stop and escalate. Do not invent the contract.

## Contract checklist

For every reviewed action or interface, verify:

- action or interface name
- required parameters
- optional parameters
- parameter casing and nesting
- request shape
- auth model and caller context
- response shape and task model
- documented constraints, limits, and special branches

## Repository cross-check

Compare the documented contract against:

- implementation in `mcp/src/tools/*`
- related test coverage
- generated metadata such as action indexes or tool docs
- external-facing docs that describe the same behavior

## Typical finding labels

- Wrong action or interface name
- Wrong parameter mapping
- Wrong parameter casing and nesting
- Wrong request shape
- Missing contract test
- Stale public documentation
- Direct Cloud API call should prefer Manager SDK

## Escalation rule

- Confirmed + low-risk + mechanically fixable: fix + targeted tests + PR
- Confirmed but broader or riskier: issue + report, then plan follow-up work
- Unclear or under-documented: report only until the contract is proven
