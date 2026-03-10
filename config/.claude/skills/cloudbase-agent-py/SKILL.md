---
name: cloudbase-agent-python
description: >
  Build production-ready AI agent backends using the CloudBase Agent Python SDK — create
  agents with LangGraph/CrewAI/LlamaIndex, serve them via FastAPI with AG-UI
  protocol streaming + OpenAI-compatible endpoints, add tools (bash, filesystem,
  MCP, code execution), memory (in-memory, TDAI, MySQL, MongoDB), observability
  (OpenTelemetry/Langfuse), and middleware (auth, logging). Use this skill when
  the user wants to create an AI agent server, build a chatbot backend, set up
  human-in-the-loop workflows, integrate MCP tools, add agent observability,
  or deploy an agent API — even if they don't explicitly mention "CloudBase Agent."
---

# CloudBase Agent Python SDK

Build production-ready AI agent backends with multi-framework support, streaming
protocol, rich tools, persistent memory, and full observability.

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

```bash
# Core + LangGraph (most common)
pip install cloudbase_agent[langgraph]

# Core only
pip install cloudbase_agent

# Other frameworks
pip install cloudbase_agent[crewai]
pip install cloudbase_agent[all]

# Individual packages
pip install cloudbase-agent-tools cloudbase-agent-storage cloudbase-agent-observability
```

## Quick Start: 3 Steps

### Step 1 — Define agent graph

```python
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, MessagesState

class State(MessagesState):
    pass

def chat_node(state: State):
    model = ChatOpenAI(model="gpt-4o-mini", temperature=0.7, streaming=True)
    return {"messages": [model.invoke(state["messages"])]}

workflow = StateGraph(State)
workflow.add_node("chat", chat_node)
workflow.set_entry_point("chat")
graph = workflow.compile()
```

### Step 2 — Create server

```python
from dotenv import load_dotenv
load_dotenv()
from cloudbase_agent.langgraph import LangGraphAgent
from cloudbase_agent.server import AgentServiceApp, AgentCreatorResult

def create_agent() -> AgentCreatorResult:
    agent = LangGraphAgent(graph=graph, name="chat-agent")
    return {"agent": agent}

AgentServiceApp().run(create_agent, port=9000)
```

### Step 3 — Test

```bash
curl -N -X POST http://localhost:9000/send-message \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'
```

---

## Reference Documents

Based on what the user needs, read the corresponding reference document.
**Only read the relevant reference — don't load all of them.**

| User Need | Reference | What It Covers |
|-----------|-----------|---------------|
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

## Key Design Decisions

1. **Agent Creator Pattern**: Every request creates a fresh agent via factory function. Supports cleanup callbacks for resource release.
2. **Dual Protocol**: Every agent supports both AG-UI native (SSE + rich events) and OpenAI-compatible (`/chat/completions`).
3. **Middleware = Generator**: Use `yield` — pre-yield = pre-processing, post-yield = post-processing (onion model).
4. **Namespace Package**: `cloudbase_agent` spans multiple packages (core, server, tools, storage, langgraph, crewai, observability). All via `from cloudbase_agent.xxx import ...`.
5. **Observability Auto-Integration**: Install `cloudbase-agent-observability` and tracing works automatically — zero config needed.
