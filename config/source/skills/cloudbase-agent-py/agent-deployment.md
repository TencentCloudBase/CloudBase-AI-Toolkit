# Agent Deployment Guide

## Core Principle

**Always use the `manageAgent` MCP tool to deploy Agent services.**

It natively supports SSE streaming, session persistence, and Python 3.10 runtime — purpose-built for Agent scenarios.

Do **NOT** use `createFunction` or `manageCloudRun` for Agent deployment.

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

There are **two deployment paths** for Python Agent dependencies. Choose based on your situation:

### Path A: Local Pre-packaging (RECOMMENDED)

Pre-install dependencies locally targeting the Linux x86_64 platform, then deploy with dependencies bundled. This ensures compatibility with native C extensions (e.g., `grpcio`, `numpy`, `pydantic-core`) and eliminates cold-start dependency installation.

**Steps:**

1. **⚠️ MANDATORY: Create and activate a Python 3.10 virtual environment BEFORE installing dependencies:**

> **CRITICAL — DO NOT SKIP THIS STEP**
>
> You **MUST** use a real Python 3.10 interpreter to install dependencies. Do **NOT** rely on pip's `--python-version 3.10` flag alone from a higher Python version (e.g., 3.11+).
>
> **Why?** pip's `--python-version` flag correctly selects wheel files for the target version, but it does **NOT** reliably evaluate environment markers (e.g., `exceptiongroup; python_version < "3.11"`) — it may use the **host interpreter's version** instead of the target version. This causes conditional dependencies like `exceptiongroup` (required by `anyio` on Python < 3.11) to be silently skipped, leading to `ModuleNotFoundError` at runtime on the cloud (which runs Python 3.10).

```bash
# Option 1: Using pyenv (recommended)
pyenv install 3.10
pyenv local 3.10
python3 --version  # Verify: must show Python 3.10.x

# Option 2: Using conda
conda create -n agent-env python=3.10 -y
conda activate agent-env
python3 --version  # Verify: must show Python 3.10.x
```

**Verification (REQUIRED):** Before proceeding to step 2, confirm the active Python is 3.10:
```bash
python3 --version
# Expected output: Python 3.10.x
# If it shows 3.11+ or 3.9-, STOP and fix your environment first.
```

2. Pre-install dependencies to `./env` directory **using the Python 3.10 environment from step 1**:

```bash
python3 -m pip install -r ./requirements.txt \
  --platform manylinux2014_x86_64 \
  --target ./env \
  --python-version 3.10 \
  --only-binary=:all: \
  --upgrade
```

> **NOTE**: The `--platform manylinux2014_x86_64` and `--python-version 3.10` flags are still needed to download Linux x86_64 wheels (since you're likely on macOS/Windows). But the **host interpreter MUST be Python 3.10** to ensure conditional dependencies are resolved correctly.

3. Deploy using `manageAgent` with `installDependency=false` (dependencies are already bundled in `./env`):

```
manageAgent(action="create", runtime="Python3.10", installDependency=false, targetPath="...")
```

3. The `scf_bootstrap` must set `PYTHONPATH` to include the `./env` directory:

```bash
#!/bin/bash
export PYTHONPATH="./env:$PYTHONPATH"
/var/lang/python310/bin/python3 -u server.py
```

4. **IMPORTANT**: Do NOT add `env/` to the `ignore` list — it must be uploaded with the code.

### Path B: Cloud-side Dependency Installation

Let CloudBase install dependencies after upload. Simpler but slower cold-start, and may have issues with packages requiring native C extensions.

**Steps:**

1. Deploy using `manageAgent` with `installDependency=true`:

```
manageAgent(action="create", runtime="Python3.10", installDependency=true, targetPath="...")
```

2. The `scf_bootstrap` must set `PYTHONPATH` to include the `./env` directory (cloud-side installs to `./env`):

```bash
#!/bin/bash
export PYTHONPATH="./env:$PYTHONPATH"
/var/lang/python310/bin/python3 -u server.py
```

3. **Trade-offs**: No local toolchain needed, but first cold-start is slower and C-extension packages may fail to build if they require system libraries not available in the runtime.

### Path Comparison

| Aspect | Path A (Local Pre-packaging) | Path B (Cloud-side Install) |
|--------|------------------------------|----------------------------|
| Cold-start speed | ✅ Fast (deps already present) | ❌ Slow (first cold-start installs deps) |
| C-extension compatibility | ✅ Guaranteed (pre-built for Linux) | ⚠️ May fail for some packages |
| Local toolchain required | **Python 3.10** (via pyenv/conda) + pip (**MANDATORY**) | No |
| Upload size | Larger (includes `./env`) | Smaller (code only) |
| Recommended for production | ✅ Yes | For prototyping only |

## Python Runtime Version

**Always select Python 3.10 runtime** (`runtime="Python3.10"`). This is the recommended version for CloudBase Agent Python SDK because:

- Full compatibility with all `cloudbase-agent-*` packages
- Best performance for async/await patterns used by FastAPI
- Stable and well-tested on the CloudBase platform

Do **NOT** use Python 3.9 or earlier — many SDK features require Python >= 3.10.

## Code Adaptation Notes

### Port Listening

Your server **must** listen on the port from environment variable `SCF_RUNTIME_PORT`:

```python
import os
from cloudbase_agent.server import AgentServiceApp

port = int(os.environ.get("SCF_RUNTIME_PORT", "9000"))
AgentServiceApp().run(create_agent, port=port, host="0.0.0.0")
```

### Startup Script

The startup script must be named `scf_bootstrap` (no file extension), placed in the project root, and have executable permissions:

```bash
#!/bin/bash
export PYTHONPATH="./env:$PYTHONPATH"
/var/lang/python310/bin/python3 -u server.py
```

Make it executable:

```bash
chmod +x scf_bootstrap
```

> **IMPORTANT**: Do NOT use `pip install` inside `scf_bootstrap`. Dependencies should be pre-installed to `./env` (Path A) or installed by CloudBase via `installDependency=true` (Path B). Running `pip install` on every cold-start wastes startup time.

### CORS Configuration

Ensure CORS is properly configured for cross-origin requests:

```python
from cloudbase_agent.server import AgentServiceApp

app = AgentServiceApp()
app.set_cors_config(allow_origins=["*"])
app.run(create_agent, port=port)
```

Or if using FastAPI directly:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Complete Deployment Example

### Project Structure

```
my-agent/
├── agents/
│   └── chat/agent.py        # Agent workflow
├── env/                      # Pre-installed dependencies (Path A only)
├── server.py                 # Main entry point
├── scf_bootstrap             # CloudBase startup script
├── requirements.txt          # Dependencies
└── .env                      # Environment variables (local only)
```

### server.py

```python
#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv()

from cloudbase_agent.langgraph import LangGraphAgent
from cloudbase_agent.server import AgentServiceApp, AgentCreatorResult
from agents.chat.agent import build_workflow

workflow = build_workflow()

def create_agent() -> AgentCreatorResult:
    agent = LangGraphAgent(
        name="chat-agent",
        graph=workflow,
        use_callbacks=True
    )
    return {"agent": agent}

app = AgentServiceApp()
app.set_cors_config(allow_origins=["*"])

if __name__ == "__main__":
    port = int(os.environ.get("SCF_RUNTIME_PORT", "9000"))
    app.run(create_agent, port=port, host="0.0.0.0")
```

### scf_bootstrap

```bash
#!/bin/bash
export PYTHONPATH="./env:$PYTHONPATH"
/var/lang/python310/bin/python3 -u server.py
```

### requirements.txt

```
cloudbase-agent-langgraph
langchain-openai
python-dotenv
```

## When to Use CloudRun Instead

Despite HTTP Cloud Functions being preferred, use CloudRun in these cases:

- Custom Docker image required (special system-level dependencies like FFmpeg, Chromium, etc.)
- Resource requirements exceed Cloud Function limits
- Persistent local file storage needed
- Need to install native C extensions that require specific OS packages

For CloudRun deployment, use a Dockerfile with Python 3.11:

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=9000
CMD ["python", "server.py"]
```

## Summary

| Decision | Choice |
|----------|--------|
| **Deployment tool** | `manageAgent` MCP tool (MUST USE) |
| **Python runtime** | Python 3.10 (MUST USE, `runtime="Python3.10"`) |
| **Dependency strategy** | Path A: local pre-packaging to `./env` (recommended, **MUST use Python 3.10 interpreter**) or Path B: `installDependency=true` |
| **Default platform** | HTTP Cloud Functions |
| **Fallback platform** | CloudRun (only for special requirements) |
| **Startup script** | `scf_bootstrap` — set `PYTHONPATH="./env:$PYTHONPATH"`, do NOT `pip install` at startup |
| **Port** | Read from `SCF_RUNTIME_PORT` env var |
