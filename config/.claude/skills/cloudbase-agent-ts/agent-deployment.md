# Agent Deployment Guide

## Core Principle

**Always use the `manageAgent` MCP tool to deploy Agent services.** It natively supports SSE streaming, session persistence, and Node.js 20 runtime — purpose-built for Agent scenarios. Do NOT use `createFunction` or `manageCloudRun` for Agent deployment.

## Why HTTP Cloud Functions First

| Dimension | HTTP Cloud Functions | CloudRun |
|-----------|---------------------|----------|
| SSE Streaming | ✅ Native support | ✅ Supported |
| WebSocket | ✅ Native support | ✅ Supported |
| Deployment Complexity | Low (no Dockerfile needed) | High (container config required) |
| Cost | Pay-per-invocation, scales to zero | Pay-per-instance-hour |
| Cold Start | Yes, mitigated with provisioned instances | Yes, mitigated with min instances |
| Supported Runtimes | Node.js, Python | Any |

## Deployment Steps (HTTP Cloud Functions)

1. Create an HTTP Cloud Function (**select Node.js 20 runtime**)
2. Upload Agent code (including `@cloudbase/agent-server`)
3. Configure HTTP access path
4. Set environment variables (API keys, model config, etc.)
5. Verify SSE connectivity

## Code Adaptation Notes

- Listen on the port from environment variable `SCF_RUNTIME_PORT`
- Name the startup script `scf_bootstrap`
- Ensure CORS is properly configured

## When to Use CloudRun Instead

- Custom Docker image required (special system-level dependencies)
- Resource requirements exceed Cloud Function limits
- Persistent local file storage needed
