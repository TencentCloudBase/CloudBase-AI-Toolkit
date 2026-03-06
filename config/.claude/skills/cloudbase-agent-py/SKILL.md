# CloudBase Agent Python SDK Quick Reference

**Version**: 1.0  
**Framework**: CloudBase Agent Python SDK  
**Purpose**: Build production-ready AI agents with multi-framework support (LangGraph, CrewAI, LlamaIndex, Coze, Dify, n8n)

---

## Overview

CloudBase Agent Python SDK is an AI agent development framework that provides:

- **Multi-framework support**: LangGraph, CrewAI, LlamaIndex, Coze, Dify, n8n
- **Production-ready server**: FastAPI-based HTTP server with CloudBase Agent native + OpenAI-compatible endpoints
- **Rich tool ecosystem**: Bash, filesystem, code execution, MCP protocol support
- **Storage management**: Short-term and long-term memory with multiple backends
- **Observability**: OpenTelemetry integration with Langfuse support
- **AG-UI protocol**: Full frontend protocol support with event models

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Layer                          │
│         (OpenAI Compatible Client / Custom HTTP)            │
└─────────────────────────────────────────────────────────────┘
                           ↓ HTTP/SSE
┌─────────────────────────────────────────────────────────────┐
│                    AgentServiceApp                          │
│  ┌──────────────────────┬──────────────────────────────┐   │
│  │ send_message adapter │  OpenAI adapter              │   │
│  │ (CloudBase Agent native)      │  (/v1/chat/completions)      │   │
│  └──────────────────────┴──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                      Agent Layer                            │
│  ┌───────────┬──────────┬────────────┬───────┬───────┐    │
│  │LangGraph  │ CrewAI   │ LlamaIndex │ Coze  │ Dify  │    │
│  └───────────┴──────────┴────────────┴───────┴───────┘    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                     Tools & Storage                         │
│  ┌─────────────┬──────────────┬────────────┬──────────┐   │
│  │ CloudBase Agent Tools│ LangChain    │ Memory     │ MCP      │   │
│  │ (Bash/File) │ Integration  │ (TDAI/Mem0)│ Protocol │   │
│  └─────────────┴──────────────┴────────────┴──────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Observability                            │
│  (OpenTelemetry / Langfuse / Console / OTLP)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Installation

```bash
# Basic installation
pip install cloudbase-agent

# With LangGraph support
pip install cloudbase-agent[langgraph]

# With CrewAI support
pip install cloudbase-agent[crewai]

# With all frameworks
pip install cloudbase-agent[all]

# Individual packages
pip install cloudbase-agent-tools
pip install cloudbase-agent-storage
pip install cloudbase-agent-observability
```

### 2. Create Your First Agent (LangGraph Example)

```python
# agent.py
from langgraph.graph import StateGraph, MessagesState
from cloudbase_agent.langgraph import LangGraphAgent

# Define your agent graph
def create_agent_graph():
    graph = StateGraph(MessagesState)
    # Add nodes and edges...
    return graph.compile()

# Wrap with CloudBase Agent
agent = LangGraphAgent(
    agent=create_agent_graph(),
    name="my-agent"
)
```

### 3. Start the Server

```python
# server.py
from cloudbase_agent.server import AgentServiceApp, create_send_message_adapter

app = AgentServiceApp(
    adapters=[
        create_send_message_adapter(
            agent_id="my-agent",
            agent=agent
        )
    ]
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app.app, host="0.0.0.0", port=8000)
```

### 4. Test Your Agent

```bash
# Start server
python server.py

# Test with curl
curl -X POST http://localhost:8000/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-agent",
    "message": "Hello!"
  }'
```

---

## Available Adapters

### Core Packages

| Package | Description | Key Components |
|---------|-------------|----------------|
| **core** | Base abstractions | `BaseAgent`, `AgentCallback`, `ToolProxy` |
| **tools** | Tool implementations | Bash, File, Code Execution, MCP |
| **server** | HTTP server | FastAPI app, send_message, OpenAI adapter |
| **storage** | Memory management | Short-term, Long-term (TDAI, Mem0) |
| **observability** | Tracing | OpenTelemetry, Langfuse integration |

### Agent Framework Adapters

| Framework | Package | Description |
|-----------|---------|-------------|
| **LangGraph** | `cloudbase_agent.langgraph` | Native LangGraph support with checkpoint |
| **CrewAI** | `cloudbase_agent.crewai` | CrewAI agent wrapper |
| **LlamaIndex** | `cloudbase_agent.llama_index` | LlamaIndex agent + workflow |
| **Coze** | `cloudbase_agent.coze` | Coze platform integration |
| **Dify** | `cloudbase_agent.dify` | Dify platform integration |
| **n8n** | `cloudbase_agent.n8n` | n8n workflow integration |

### LangChain Integration

```python
# Convert LangChain tools to CloudBase Agent
from cloudbase_agent.adapters.langchain import from_langchain
from langchain.tools import WikipediaQueryRun

lc_tool = WikipediaQueryRun(api_wrapper=WikipediaAPIWrapper())
cloudbase_tool = from_langchain(lc_tool)

# Convert CloudBase Agent tools to LangChain
from cloudbase_agent.adapters.langchain import CloudBaseTool
from cloudbase_agent.tools import create_bash_tool

cloudbase_bash = create_bash_tool()
lc_bash = CloudBaseTool(cloudbase_bash)
```

---

## Available Tools

### Built-in Tools

```python
from cloudbase_agent.tools import (
    # Bash execution
    create_bash_tool,
    create_multi_command_tool,
    
    # File operations
    create_read_tool,
    create_write_tool,
    create_edit_tool,
    create_multiedit_tool,
    create_grep_tool,
    create_glob_tool,
    create_ls_tool,
    
    # Code execution
    UnsafeLocalCodeExecutor,
    BuiltInCodeExecutor,
    
    # MCP support
    MCPToolkit,
    MCPClientManager,
    CloudBaseMCPServer
)
```

### Tool Configuration Example

```python
from cloudbase_agent.tools import create_bash_tool, create_read_tool

# Bash tool with workspace restriction
bash_tool = create_bash_tool(
    workspace="/path/to/workspace",
    timeout=30
)

# File read tool
read_tool = create_read_tool(
    allowed_paths=["/path/to/data"]
)
```

---

## Storage & Memory

### Short-term Memory

```python
from cloudbase_agent.storage import InMemoryMemory, TDAIMemory

# In-memory storage (for development)
memory = InMemoryMemory()

# TDAI storage (for production)
memory = TDAIMemory(
    endpoint="https://your-tdai-endpoint",
    api_key="your-api-key"
)
```

### Long-term Memory

```python
from cloudbase_agent.storage import TDAILongTermMemory, Mem0LongTermMemory

# TDAI long-term memory
ltm = TDAILongTermMemory(
    endpoint="https://your-tdai-endpoint",
    api_key="your-api-key"
)

# Mem0 integration
ltm = Mem0LongTermMemory(
    config={"api_key": "your-mem0-key"}
)
```

---

## Observability

### Console Tracing

```python
from cloudbase_agent.observability import ConsoleTraceConfig, enable_tracing

enable_tracing(ConsoleTraceConfig())
```

### Langfuse Integration

```python
from cloudbase_agent.observability import OTLPTraceConfig, enable_tracing

enable_tracing(OTLPTraceConfig(
    endpoint="https://cloud.langfuse.com",
    headers={
        "x-langfuse-public-key": "pk-...",
        "x-langfuse-secret-key": "sk-..."
    }
))
```

### Environment Variable

```bash
# Enable console tracing
export AUTO_TRACES_STDOUT=true

# Your agent will automatically output traces
python server.py
```

---

## Server Configuration

### Basic Server

```python
from cloudbase_agent.server import AgentServiceApp, create_send_message_adapter

app = AgentServiceApp(
    adapters=[
        create_send_message_adapter(
            agent_id="my-agent",
            agent=agent
        )
    ]
)
```

### With OpenAI Compatibility

```python
from cloudbase_agent.server import (
    AgentServiceApp,
    create_send_message_adapter,
    create_openai_adapter
)

app = AgentServiceApp(
    adapters=[
        # CloudBase Agent native endpoint
        create_send_message_adapter(
            agent_id="my-agent",
            agent=agent
        ),
        # OpenAI-compatible endpoint
        create_openai_adapter(
            agent_id="my-agent",
            agent=agent
        )
    ]
)
```

Now you can use OpenAI client:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="dummy"  # Not required for local development
)

response = client.chat.completions.create(
    model="my-agent",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

---

## Authentication

### Middleware Example

```python
from cloudbase_agent.server import AgentServiceApp
from cloudbase_agent.core.schemas import RunAgentInput
from fastapi import Request, HTTPException
import jwt

def auth_middleware(input_data: RunAgentInput, request: Request):
    """Extract user info from JWT and inject into state."""
    
    # Extract token
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Missing authorization")
    
    token = auth_header.replace("Bearer ", "")
    
    try:
        # Verify JWT
        payload = jwt.decode(token, "your-secret", algorithms=["HS256"])
        
        # Initialize state if needed
        if input_data.state is None:
            input_data.state = {}
        
        # Inject user info into framework reserved field
        input_data.state["__request_context__"] = {
            "user": {
                "id": payload["sub"],
                "jwt": payload
            }
        }
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    
    yield  # Continue to agent
    
    # Post-processing (optional)

# Register middleware
app = AgentServiceApp(
    adapters=[...],
    middlewares=[auth_middleware]
)
```

### Access User Info in Agent

```python
def my_agent_function(state: dict):
    # Read framework reserved field
    user_id = state.get("__request_context__", {}).get("user", {}).get("id")
    
    if not user_id:
        raise ValueError("User not authenticated")
    
    # Use user_id for your business logic
    return f"Hello, user {user_id}!"
```

---

## Framework Reserved Fields

The following fields in `state` are managed by CloudBase Agent:

### `state.__request_context__.user.id`
- **Type**: `string`
- **Set by**: Authentication middleware
- **Access**: Read-only
- **Purpose**: User identifier for multi-tenant support

### `state.__request_context__.user.jwt`
- **Type**: `object`
- **Set by**: Authentication middleware
- **Access**: Read-only
- **Purpose**: JWT payload for authorization

⚠️ **Security Warning**: Do not modify these fields in your agent logic!

---

## Examples

Check the `examples/` directory for complete working examples:

### LangGraph Examples
- `examples/langgraph/agents/agentic_chat/` - Conversational agent
- `examples/langgraph/agents/human_in_the_loop/` - Human approval workflow

### CrewAI Examples
- `examples/crewai/agents/agentic_chat/` - CrewAI chat agent

### LlamaIndex Examples
- `examples/llama_index/agents/agentic_chat/` - Single agent
- `examples/llama_index/agents/multi_agent/` - Multi-agent system

### Coze Examples
- `examples/coze/` - Coze platform integration

### Dify Examples
- `examples/dify/` - Dify platform integration

### Observability Examples
- `examples/observability/` - Various tracing configurations

---

## Best Practices

1. **Use virtual environments**: Always use `venv` or `uv` for dependency isolation
2. **Enable observability**: Use `AUTO_TRACES_STDOUT=true` during development
3. **Secure your endpoints**: Implement authentication middleware for production
4. **Use TDAI storage**: For production deployments with persistent memory
5. **Test with OpenAI adapter**: Verify compatibility with OpenAI client libraries
6. **Follow framework conventions**: Each adapter has specific patterns (see adapter docs)

---

## Common Patterns

### Multi-Agent System

```python
from cloudbase_agent.server import AgentServiceApp, create_send_message_adapter

app = AgentServiceApp(
    adapters=[
        create_send_message_adapter("agent-1", agent1),
        create_send_message_adapter("agent-2", agent2),
        create_send_message_adapter("agent-3", agent3),
    ]
)
```

### Conditional Tool Access

```python
def tool_proxy(
    tool_call: ToolCall,
    tool: BaseTool,
    input_data: RunAgentInput
) -> ToolCallResult:
    """Control tool execution based on user permissions."""
    
    user_id = input_data.state["__request_context__"]["user"]["id"]
    
    # Check permissions
    if tool.name == "bash" and user_id not in allowed_users:
        return ToolCallResult(
            blocked=True,
            message="You don't have permission to execute bash commands"
        )
    
    # Allow execution
    return ToolCallResult(blocked=False)

# Register tool proxy
agent = LangGraphAgent(
    agent=graph,
    tool_proxy=tool_proxy
)
```

---

## Troubleshooting

### Agent not streaming responses

**Solution**: Ensure your agent graph returns proper streaming events. For LangGraph, use the AG-UI compatibility patch:

```python
from cloudbase_agent.langgraph import LangGraphAgent

agent = LangGraphAgent(
    agent=graph,
    enable_agui_patch=True  # Enable AG-UI compatibility
)
```

### Memory not persisting

**Solution**: Use TDAI storage instead of in-memory:

```python
from cloudbase_agent.storage import TDAIMemory

memory = TDAIMemory(
    endpoint=os.getenv("TDAI_ENDPOINT"),
    api_key=os.getenv("TDAI_API_KEY")
)
```

### Observability not working

**Solution**: Check your tracing configuration and ensure dependencies are installed:

```bash
pip install cloudbase_agent[observability]
```

---

## Additional Resources

- **Core concepts**: See `server-quickstart.md` for server setup
- **LangGraph adapter**: See `adapter-langgraph.md` for detailed usage
- **Coze adapter**: See `adapter-coze.md` for Coze integration
- **Authentication**: See `authentication.md` for auth patterns
- **Adapter development**: See `adapter-development.md` for custom adapters

---

## Quick Command Reference

```bash
# Start development server
uvicorn server:app.app --reload

# Test agent endpoint
curl -X POST http://localhost:8000/send-message \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "my-agent", "message": "test"}'

# Test OpenAI endpoint
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "my-agent", "messages": [{"role": "user", "content": "test"}]}'

# Enable observability
export AUTO_TRACES_STDOUT=true

# Run with production settings
gunicorn server:app.app -w 4 -k uvicorn.workers.UvicornWorker
```
