# Agent Deployment Guide

## Core Principle

When deploying Agent services to CloudBase, **always prefer HTTP Cloud Functions**. Use CloudRun only when HTTP Cloud Functions cannot meet your requirements.

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

1. Create an HTTP Cloud Function (select Node.js runtime)
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
