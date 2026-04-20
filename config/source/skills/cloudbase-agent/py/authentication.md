# Authentication and User Context

This guide explains how to implement authentication and manage user context in CloudBase Agent Python SDK using the framework's reserved fields pattern.

## Overview

CloudBase Agent uses a standardized approach for passing user context through the request lifecycle:

```
HTTP Request (`x-cloudbase-credentials` header)
  ↓ (middleware extracts uid)
state["__request_context__"]["user"]["id"]
  ↓ (available to)
Agent / Adapter / Tools
```

## Framework Reserved Fields

CloudBase Agent reserves specific fields in `state` for user authentication:

| Field | Type | Description | Access |
|-------|------|-------------|--------|
| `state["__request_context__"]["user"]["id"]` | `str` | User identifier | Read-only (set by middleware) |
| `state["__request_context__"]["user"]["raw_credentials"]` | `dict` | Parsed CloudBase credential payload | Read-only (set by middleware) |

**⚠️ Security Warning**: These fields are set by authentication middleware and should be treated as read-only. Modifying them in your agent logic may lead to security vulnerabilities.

## Implementation Pattern

### 1. CloudBase User Middleware (Write)

For CloudBase-hosted agent requests, parse the `x-cloudbase-credentials` header, extract `uid`, log it for debugging, and inject it into `state`:

```python
import json
from fastapi import Request
from cloudbase_agent.server.send_message.models import RunAgentInput
from typing import Generator

def cloudbase_user_middleware(
    input_data: RunAgentInput, 
    request: Request
) -> Generator[None, None, None]:
    """
    Extract user uid from CloudBase credentials and inject into state.
    """
    raw_header = request.headers.get("x-cloudbase-credentials", "")
    if not raw_header:
        yield
        return

    try:
        credentials = json.loads(raw_header)
    except json.JSONDecodeError as exc:
        print(f"Invalid x-cloudbase-credentials header: {exc}")
        yield
        return

    uid = credentials.get("uid")
    print(f"Resolved CloudBase user id: {uid}")

    if input_data.state is None:
        input_data.state = {}

    request_context = input_data.state.setdefault("__request_context__", {})
    request_context["user"] = {
        "id": uid,
        "raw_credentials": credentials,
    }
    
    yield  # Continue to next middleware or agent
```

### 2. Register Middleware

```python
from cloudbase_agent.server import AgentServiceApp

app = AgentServiceApp()
app.use(cloudbase_user_middleware)  # Register before run()
app.run(create_agent, port=8000)
```

### 3. Adapter/Agent (Read)

In your adapter or agent, read the user information:

```python
def get_user_id_from_state(state: dict) -> str:
    """
    Safely extract user ID from framework reserved field.
    
    :param state: Agent state dictionary
    :return: User ID string
    :raises ValueError: If user ID not found
    """
    request_context = state.get("__request_context__", {})
    user = request_context.get("user", {})
    user_id = user.get("id")
    
    if not user_id:
        raise ValueError(
            "user_id is required but not found in "
            "state.__request_context__.user.id. "
            "Please ensure auth middleware is registered."
        )
    
    return user_id

# Usage in agent
def my_agent_function(state: dict):
    user_id = get_user_id_from_state(state)
    raw_credentials = state.get("__request_context__", {}).get("user", {}).get("raw_credentials", {})
    
    # Use user_id and raw_credentials for your logic
    user_data = fetch_user_data(user_id)
    # ...
```

## Example: Complete CloudBase User Context Flow

### Request Header Shape

CloudBase forwards user information in the `x-cloudbase-credentials` header. The exact payload can contain more fields, but your middleware should at least read `uid` and pass it to `state.__request_context__.user.id`.

```http
x-cloudbase-credentials: {"uid":"user-123","envId":"env-demo"}
```

### Step 1: Define Authentication Middleware

```python
# auth.py
import json
import logging
from fastapi import Request
from cloudbase_agent.server.send_message.models import RunAgentInput
from typing import Generator

logger = logging.getLogger(__name__)

def cloudbase_user_middleware(
    input_data: RunAgentInput,
    request: Request
) -> Generator[None, None, None]:
    """
    Extract CloudBase user credentials and inject uid into reserved fields.
    """
    raw_header = request.headers.get("x-cloudbase-credentials", "")
    if not raw_header:
        logger.info("x-cloudbase-credentials header missing")
        yield
        return

    try:
        credentials = json.loads(raw_header)
    except json.JSONDecodeError as exc:
        logger.warning("Invalid x-cloudbase-credentials header: %s", exc)
        yield
        return

    uid = credentials.get("uid")
    logger.info("Resolved CloudBase user id: %s", uid)

    if input_data.state is None:
        input_data.state = {}

    request_context = input_data.state.setdefault("__request_context__", {})
    request_context["user"] = {
        "id": uid,
        "raw_credentials": credentials,
    }
    
    yield  # Continue to agent execution
```

### Step 2: Use in Coze Adapter

```python
# agent.py
from cloudbase_agent.coze import CozeAgentAdapter
from cloudbase_agent.server import AgentServiceApp
from auth import cloudbase_user_middleware

def create_agent():
    """
    Create Coze agent.
    User ID will be automatically extracted from state by the adapter.
    """
    return CozeAgentAdapter(
        bot_id="your-bot-id",
        api_key="your-api-key"
    )

# Start server with auth middleware
app = AgentServiceApp()
app.use(cloudbase_user_middleware)  # Register auth middleware
app.run(create_agent, port=8000)
```

### Step 3: Coze Adapter Internal Logic

The Coze adapter reads user ID automatically:

```python
# Inside cloudbase_agent.coze.agent.py (framework code)
class CozeAgentAdapter:
    def _get_user_id(self, run_input: RunAgentInput) -> str:
        """Get user_id from state.__request_context__.user.id."""
        state = run_input.state or {}
        
        # Read from framework reserved field
        request_context = state.get("__request_context__", {})
        user_info = request_context.get("user", {})
        user_id = user_info.get("id")
        
        if not user_id:
            raise ValueError(
                "user_id is required but not found in "
                "state.__request_context__.user.id. "
                "Please ensure auth middleware is registered."
            )
        
        return user_id.strip()
```

## Custom User Context Fields

You can add custom fields alongside framework reserved fields:

```python
import json

def auth_middleware(input_data: RunAgentInput, request: Request):
    """CloudBase auth middleware with custom fields."""
    credentials = json.loads(request.headers["x-cloudbase-credentials"])

    if input_data.state is None:
        input_data.state = {}

    input_data.state["__request_context__"] = {
        "user": {
            "id": credentials["uid"],              # ← Framework reserved
            "raw_credentials": credentials,         # ← Framework reserved
        },
        # ✅ Custom fields (allowed)
        "env_id": credentials.get("envId"),
        "session_id": request.headers.get("X-Session-ID"),
    }
    
    yield

# Usage in agent
def my_agent(state: dict):
    # Read framework reserved fields
    user_id = state["__request_context__"]["user"]["id"]
    
    # Read custom fields
    env_id = state["__request_context__"].get("env_id")
    session_id = state["__request_context__"].get("session_id")
```

## Security Best Practices

### 1. Validate Header Shape

```python
def parse_cloudbase_credentials(raw_header: str) -> dict:
    credentials = json.loads(raw_header)
    if not credentials.get("uid"):
        raise ValueError("x-cloudbase-credentials must include uid")
    return credentials
```

### 2. Log the Resolved User ID

```python
uid = credentials.get("uid")
logger.info("Resolved CloudBase user id: %s", uid)
```

### 3. Rate Limit by User

```python
from collections import defaultdict
from time import time

user_request_counts = defaultdict(list)

def rate_limit_by_user_middleware(input_data, request):
    """Rate limit per user ID."""
    user_id = input_data.state.get("__request_context__", {}).get("user", {}).get("id")
    
    if user_id:
        now = time()
        # Clean old requests
        user_request_counts[user_id] = [
            t for t in user_request_counts[user_id]
            if now - t < 60  # 1-minute window
        ]
        
        if len(user_request_counts[user_id]) >= 10:
            raise Exception(f"Rate limit exceeded for user {user_id}")
        
        user_request_counts[user_id].append(now)
    
    yield
```

## Testing Authentication

### Unit Test

```python
import pytest
import json
from fastapi import Request
from cloudbase_agent.server.send_message.models import RunAgentInput
from auth import cloudbase_user_middleware

def test_auth_middleware_with_valid_credentials():
    """Test middleware with valid CloudBase credentials."""
    request = Request(scope={
        "type": "http",
        "headers": [
            (b"x-cloudbase-credentials", json.dumps({"uid": "user123"}).encode())
        ]
    })
    
    input_data = RunAgentInput(
        messages=[],
        runId="test-run",
        threadId="test-thread"
    )
    
    # Execute middleware
    gen = cloudbase_user_middleware(input_data, request)
    next(gen)
    
    # Verify user info was injected
    assert input_data.state["__request_context__"]["user"]["id"] == "user123"

def test_auth_middleware_with_missing_header():
    """Test middleware no-ops when the credentials header is absent."""
    request = Request(scope={"type": "http", "headers": []})
    input_data = RunAgentInput(messages=[], runId="test", threadId="test")

    gen = cloudbase_user_middleware(input_data, request)
    next(gen)

    assert input_data.state is None
```

### Integration Test

```python
from fastapi.testclient import TestClient

def test_authenticated_request():
    """Test full request with authentication."""
    client = TestClient(app)

    response = client.post(
        "/send-message",
        json={"messages": [{"role": "user", "content": "Hello"}]},
        headers={"x-cloudbase-credentials": json.dumps({"uid": "user123"})}
    )
    
    assert response.status_code == 200
```

## Migration from forwarded_props

If you're migrating from the old `forwarded_props` pattern:

### Before (Old Pattern)

```python
# ❌ Old: forwarded_props
def create_user_preprocessor():
    def user_preprocessor(request: RunAgentInput, http_context: Request):
        user_id = extract_user_id_from_request(http_context)
        if not request.forwarded_props:
            request.forwarded_props = {}
        request.forwarded_props["user_id"] = user_id
    return user_preprocessor
```

### After (New Pattern)

```python
# ✅ New: state.__request_context__
def auth_middleware(input_data: RunAgentInput, request: Request):
    user_id = extract_user_id_from_request(request)
    
    if input_data.state is None:
        input_data.state = {}
    
    input_data.state["__request_context__"] = {
        "user": {"id": user_id}
    }
    yield
```

## Summary

| Aspect | Implementation |
|--------|---------------|
| **Write (Middleware)** | `state["__request_context__"]["user"]["id"] = user_id` |
| **Read (Adapter)** | `state.get("__request_context__", {}).get("user", {}).get("id")` |
| **Security** | Validate `x-cloudbase-credentials`, require `uid`, log the resolved user ID |
| **Custom Fields** | Add alongside reserved fields in `__request_context__` |
| **Testing** | Unit test middleware, integration test full flow |

## Next Steps

- Learn about [server deployment](server-quickstart.md)
- Understand [middleware patterns](server-quickstart.md#middleware-system)
- Integrate with [Coze adapter](adapter-coze.md)
- Build [UI clients](ui-clients.md)
