---
name: cloudbase-agent-python
description: "Build production-ready AI agent backends using the CloudBase Agent Python SDK — create agents with LangGraph/CrewAI/LlamaIndex, serve them via FastAPI with AG-UI protocol streaming + OpenAI-compatible endpoints, add tools (bash, filesystem, MCP, code execution), memory (in-memory, TDAI, MySQL, MongoDB), observability (OpenTelemetry/Langfuse), and middleware (auth, logging). Use this skill when the user wants to create an AI agent server, build a chatbot backend, set up human-in-the-loop workflows, integrate MCP tools, add agent observability, or deploy an agent API — even if they don't explicitly mention 'CloudBase Agent.'"
alwaysApply: true
---

# CloudBase Agent Python SDK

Build production-ready AI agent backends with multi-framework support, streaming
protocol, rich tools, persistent memory, and full observability.

> **Note:** This skill is for **Python** projects only.

## When to use this skill

Use this skill for **AI agent development** when you need to:

- Deploy AI agents as HTTP services with AG-UI protocol support
- Build agent backends using LangGraph, CrewAI, or LlamaIndex frameworks
- Create custom agent adapters implementing the AbstractAgent interface
- Understand AG-UI protocol events and message streaming
- Build production-ready agent servers with FastAPI

**Do NOT use for:**
- Simple AI model calling without agent capabilities (use `ai-model-*` skills)
- CloudBase cloud functions (use `cloud-functions` skill)
- CloudRun backend services without agent features (use `cloudrun-development` skill)
- TypeScript/JavaScript agent projects (use `cloudbase-agent-ts` skill)

## How to use this skill (for a coding agent)

1. **Choose the right adapter**
   - Use LangGraph adapter for stateful, graph-based workflows
   - Use CrewAI adapter for multi-agent collaboration patterns
   - Build custom adapter for specialized agent logic

2. **Deploy the agent server**
   - Use `cloudbase-agent-server` (FastAPI) to expose HTTP endpoints
   - Configure CORS, logging, and observability as needed
   - **Prefer deploying to CloudBase using `manageAgent` MCP tool** (see [agent-deployment](agent-deployment.md))

3. **Follow the routing table below** to find detailed documentation for each task

## Routing

| Task | Read |
|------|------|
| Deploy agent to CloudBase (**read this first**) | [agent-deployment](agent-deployment.md) |
| Server setup, deployment methods, middleware, CORS | [server-quickstart](server-quickstart.md) |
| LangGraph adapter, callbacks, streaming, checkpoints | [adapter-langgraph](adapter-langgraph.md) |
| Build custom adapter | [adapter-development](adapter-development.md) |
| Coze platform integration | [adapter-coze](adapter-coze.md) |
| Authentication and user context | [authentication](authentication.md) |

## Quick Start

**Prerequisites:** Python >= 3.10 is required.

**1. Install dependencies:**

```bash
pip install cloudbase-agent-langgraph
```

**2. Create and run your agent:**

```python
from dotenv import load_dotenv
load_dotenv()
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, MessagesState
from cloudbase_agent.langgraph import LangGraphAgent
from cloudbase_agent.server import AgentServiceApp, AgentCreatorResult

class State(MessagesState):
    pass

def chat_node(state: State):
    model = ChatOpenAI(model="gpt-4o-mini", temperature=0.7, streaming=True)
    return {"messages": [model.invoke(state["messages"])]}

workflow = StateGraph(State)
workflow.add_node("chat", chat_node)
workflow.set_entry_point("chat")
graph = workflow.compile()

def create_agent() -> AgentCreatorResult:
    agent = LangGraphAgent(graph=graph, name="chat-agent")
    return {"agent": agent}

AgentServiceApp().run(create_agent, port=9000)
```

---

## Architecture

```
Client (React / MiniProgram / curl)
   │  HTTP POST + SSE streaming
   ▼
┌─────────────────────────────────────────────┐
│  AgentServiceApp (FastAPI)                   │
│  ├─ /send-message      ← AG-UI SSE         │
│  ├─ /chat/completions  ← OpenAI-compat      │
│  └─ Middleware chain (onion model)           │
├─────────────────────────────────────────────┤
│  Agent Layer                                 │
│  ├─ LangGraphAgent  ├─ CrewAIAgent          │
│  ├─ LlamaIndexAgent ├─ CozeAgent/DifyAgent  │
│  └─ BaseAgent (extend for custom)           │
├──────────────────┬──────────────────────────┤
│  Tools           │  Storage                  │
│  Bash/FS/Code/MCP│  Memory + LongTermMemory  │
├─────────────────────────────────────────────┤
│  Observability (OpenTelemetry + Langfuse)    │
└─────────────────────────────────────────────┘
```

## Installation

CloudBase Agent Python SDK is published to PyPI as separate packages. **Note: PyPI package names use hyphens (`cloudbase-agent-*`), and Python imports use the same namespace (`cloudbase_agent.*`)**.

```bash
# Core + Server + LangGraph (most common)
pip install cloudbase-agent-langgraph

# Individual packages
pip install cloudbase-agent-core        # Core framework
pip install cloudbase-agent-server      # FastAPI server
pip install cloudbase-agent-langgraph   # LangGraph integration
pip install cloudbase-agent-tools       # Tool system
pip install cloudbase-agent-storage     # Memory/Storage
pip install cloudbase-agent-observability  # OpenTelemetry/Langfuse
pip install cloudbase-agent-coze        # Coze platform
pip install cloudbase-agent-crewai      # CrewAI integration
```

**Import Note**: All packages share the `cloudbase_agent` namespace:
```python
# After installing cloudbase-agent-langgraph, import from cloudbase_agent
from cloudbase_agent.langgraph import LangGraphAgent
from cloudbase_agent.server import AgentServiceApp
from cloudbase_agent.tools import create_bash_tool
```

## Reference Documents

Based on what the user needs, read the corresponding reference document.
**Only read the relevant reference — don't load all of them.**

| User Need | Reference | What It Covers |
|-----------|-----------|---------------|
| **Deploying agent to CloudBase** | Read [agent-deployment](agent-deployment.md) | **manageAgent MCP tool (MUST USE)**, HTTP Cloud Functions vs CloudRun comparison, Python 3.10 runtime, scf_bootstrap |
| Server setup, deployment, middleware, multi-agent, CORS | Read `references/server.md` | AgentServiceApp 3 deployment methods, middleware (generator/yield/onion model), multi-agent server, Agent Creator pattern, health checks |
| LangGraph agent, callbacks, tool proxy, HITL, checkpoints | Read `references/langgraph.md` | LangGraphAgent constructor, AgentCallback protocol, ToolProxy, human-in-the-loop with interrupt(), TDAICheckpointSaver, client-defined tools |
| Tools: bash, filesystem, code execution, MCP, custom tools | Read `references/tools.md` | create_bash_tool, 8 file tools, code executors, MCPToolkit/CloudBaseMCPServer, @tool decorator, BaseTool, framework adapters |
| Memory, persistence, short/long-term, MySQL, MongoDB | Read `references/storage.md` | InMemoryMemory, TDAIMemory, MySQLMemory, MongoDBMemory, TDAILongTermMemory, Mem0LongTermMemory, LangGraph checkpoint |
| Tracing, monitoring, Langfuse, OpenTelemetry | Read `references/observability.md` | ConsoleTraceConfig, OTLPTraceConfig, setup_observability, env vars, manual observation spans |
| Common patterns, JWT auth, MCP integration, production | Read `references/recipes.md` | JWT middleware, MCP + LangGraph, production deployment, adding tools to agents, client-defined tools |

## Key Imports Quick Reference

```python
# Server
from cloudbase_agent.server import AgentServiceApp, AgentCreatorResult
from cloudbase_agent.server import create_send_message_adapter, create_openai_adapter
from cloudbase_agent.server import RunAgentInput, OpenAIChatCompletionRequest

# Agents
from cloudbase_agent.langgraph import LangGraphAgent
from cloudbase_agent.crewai import CrewAIAgent

# Tools
from cloudbase_agent.tools import create_bash_tool, create_read_tool, create_write_tool
from cloudbase_agent.tools import MCPToolkit, CloudBaseMCPServer, CloudBaseTool
from cloudbase_agent.tools import tool, BaseTool  # custom tools

# Storage
from cloudbase_agent.storage import InMemoryMemory, TDAIMemory
from cloudbase_agent.storage import TDAILongTermMemory, Mem0LongTermMemory
from cloudbase_agent.langgraph import TDAICheckpointSaver, TDAIStore

# Observability
from cloudbase_agent.observability import ConsoleTraceConfig, OTLPTraceConfig, setup_observability

# Schemas
from cloudbase_agent.schemas import Message, MessageRole, StreamEvent, EventType
```

## Project Structure Convention

```
my-agent-project/
├── agents/
│   ├── agentic_chat/agent.py      # build_workflow() → CompiledStateGraph
│   ├── human_in_the_loop/agent.py
│   └── __init__.py
├── server.py                       # Main entry: AgentServiceApp().run(...)
├── scf_bootstrap                   # CloudBase startup script (required for deployment)
├── .env                            # OPENAI_API_KEY, etc.
└── requirements.txt
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key |
| `AUTO_TRACES_STDOUT` | Enable console tracing (`true`) |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Langfuse keys |
| `TDAI_ENDPOINT` / `TDAI_API_KEY` | TDAI memory/checkpoint endpoint |
| `SCF_RUNTIME_PORT` | CloudBase runtime port (set automatically during deployment) |

## Key Design Decisions

1. **Agent Creator Pattern**: Every request creates a fresh agent via factory function. Supports cleanup callbacks for resource release.
2. **Dual Protocol**: Every agent supports both AG-UI native (SSE + rich events) and OpenAI-compatible (`/chat/completions`).
3. **Middleware = Generator**: Use `yield` — pre-yield = pre-processing, post-yield = post-processing (onion model).
4. **Namespace Package**: `cloudbase_agent` spans multiple PyPI packages (cloudbase-agent-core, cloudbase-agent-server, cloudbase-agent-langgraph, etc.). PyPI names use hyphens, but all imports use `from cloudbase_agent.xxx import ...`.
5. **Observability Auto-Integration**: Install `cloudbase-agent-observability` and tracing works automatically — zero config needed.
6. **Deploy with manageAgent**: Always use the `manageAgent` MCP tool for CloudBase deployment — it natively supports SSE streaming, session persistence, and Python 3.10 runtime. **MUST create a Python 3.10 virtual environment first** (via pyenv/conda), then pre-install dependencies to `./env` with `--platform manylinux2014_x86_64`. Do NOT rely on `--python-version 3.10` alone from a higher Python version — it fails to resolve conditional dependencies like `exceptiongroup`.
