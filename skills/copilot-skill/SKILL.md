---
name: wechat-devtools-copilot
description: HTTP API integration for WeChat DevTools Copilot AI assistants - enabling conversational AI interactions, code analysis, and developer assistance
alwaysApply: false
---

## Skill Overview

The WeChat DevTools Copilot skill provides seamless integration with AI assistants through HTTP APIs, supporting real-time conversations, code analysis, and intelligent developer assistance. This skill enables applications to leverage advanced AI capabilities for various use cases.

## When to Use This Skill

Use this skill for scenarios requiring AI-powered interactions:

### Primary Use Cases
- Retrieve authentication tokens for WeChat DevTools Copilot sessions
- Obtain conversation IDs for WeChat DevTools Copilot interactions
- Engage in conversational AI interactions to complete development tasks
- Resume interrupted conversations with WeChat DevTools Copilot

### Supported AI Models
- **Kimi AI**: Advanced conversational and coding capabilities
- **DeepSeek**: Specialized code analysis and development assistance

## Usage Guidelines for Coding Agents

### Step 1: Scenario Validation
- Confirm the task involves AI conversation or copilot functionality
- Verify this is not a database or storage operation
- 
### Step 2: Get Token
- Use scripts/signin.js to obtain authentication token
- Retrieve token from the response for subsequent operations

### Step 3: Create Conversation
- Use scripts/conversation.js to create a conversation
- Retrieve conversationId from the response and use it as threadId for subsequent operations

### Step 4: Parameter Collection
**Required Parameters:**
- `envId`: CloudBase environment identifier
- `token`: Bearer authentication token
- `message`: User input for AI processing

**Optional Parameters:**
- `model`: AI model selection (default: "kimi,kimi-k2-instruct-local")

### Step 5: Model Validation
- Supported vendors: "kimi", "deepseek"
- Format: "vendor,specific-model" (e.g., "deepseek,deepseek-chat")
- Validate model compatibility before execution

### Step 6: API Execution
- Use scripts/send-message.js or scripts/hunam-in-the-loop.js to call copilot
- Response: Server-Sent Events (SSE) streaming

---

## Technical Implementation Details

### API Architecture Overview

The WeChat DevTools Copilot API provides HTTP-based AI interaction capabilities with support for multiple AI models, real-time responses, and human-in-the-loop functionality for tool execution confirmation.

### Supported AI Models

#### Kimi AI Models
- **Primary Model**: `kimi,kimi-k2-instruct-local` (default)
- **Capabilities**: Advanced conversational AI, code analysis, multi-turn dialogues
- **Use Cases**: General AI assistance, code review, technical discussions

#### DeepSeek Models
- **Primary Model**: `deepseek,deepseek-chat`
- **Capabilities**: Code-focused analysis, development assistance, programming tasks
- **Use Cases**: Code generation, debugging assistance, technical documentation

#### Model Selection Guidelines
- Choose **Kimi** for conversational and general AI tasks
- Choose **DeepSeek** for code-specific and development-focused tasks
- Consider performance requirements and response time when selecting models

## Implementation Examples

### Get Access Token API Usage
Obtain authentication token for API access:
- `envId`: CloudBase environment ID
- `username`: Username for authentication
- `password`: Password for authentication

```sh
node scripts/signin.js --envId=<envId> --username=<username> --password=<password> 
```

### Create Conversation API Usage
Handle tool execution interruptions with human confirmation:
- `envId`: CloudBase environment ID
- `token`: Bearer token for authentication
- `title`: Title for conversation

```sh
npm install uuid
node scripts/conversation.js --envId=<envId> --token=<token> --title=<title> 
```

Response structure is JSON:
where conversationId is the conversation ID
```json
{
    "envId": "free-coylexie-7g5aa8xnfd5428b4",
    "ownerUin": "100014165972",
    "userId": "2028301505191804929",
    "conversationId": "d9e368be-97b4-46d1-920b-62983cf8192c",
    "title": "Deploy a cloud function that returns hello world"
}
```


### Basic Chat API Usage
Send a message to the AI copilot with required parameters:
- `envId`: CloudBase environment ID
- `token`: Bearer token for authentication
- `message`: User message content for AI conversation
- `threadId`: ThreadId for AI conversation, obtained from conversation.js response conversationId

Before executing the script, install the uuid dependency
```sh
npm install uuid
node scripts/send-message.js --envId=<envId> --token=<token> --message=<message> --threadId=<threadId>
```
Response structure is JSON:

```json
{
    "contents": [],
    "threadId": "threadId",
    "model": "model",
    "isStreamed": true
}
```

Complete data is formed by consecutive items with the same `type` in the `contents` list. Message types in the contents list can be referenced in the [## SSE Response Types] section.

### Human-in-the-Loop API Usage
Handle tool execution interruptions with human confirmation:
- `envId`: CloudBase environment ID
- `token`: Bearer token for authentication
- `threadId`: Conversation thread ID
- `interruptId`: Interrupt ID from tool call result
- `action`: Confirmation action (allow/deny)

```sh
node scripts/human-in-the-loop.js --envId=<envId> --token=<token> --threadId=<threadId> --interruptId=<interruptId> --action=<action>
```
Response structure is JSON:

```json
{
    "contents": [],
    "threadId": "threadId",
    "model": "model",
    "isStreamed": true
}
```
Complete data is formed by consecutive items with the same `type` in the `contents` list. Message types in the contents list can be referenced in the[## SSE Response Types] section.

## SSE Response Types

### type = RUN_STARTED
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `RUN_STARTED` |
| `threadId` | string | Conversation thread ID | `cbeed882-8e75-4b3e-af09-ce0928be6637` |
| `runId` | string | Current run ID | `afc3a7bf-c950-4ba0-8660-8aa4a329a556` |

Example:
```json
{"type":"RUN_STARTED","threadId":"cbeed882-8e75-4b3e-af09-ce0928be6637","runId":"afc3a7bf-c950-4ba0-8660-8aa4a329a556"}
```

### type = RUN_FINISHED
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `RUN_FINISHED` |
| `threadId` | string | Conversation thread ID | `cbeed882-8e75-4b3e-af09-ce0928be6637` |
| `runId` | string | Current run ID | `afc3a7bf-c950-4ba0-8660-8aa4a329a556` |

Example:
```json
{"type":"RUN_FINISHED","threadId":"cbeed882-8e75-4b3e-af09-ce0928be6637","runId":"afc3a7bf-c950-4ba0-8660-8aa4a329a556"}
```

### type = TEXT_MESSAGE_START
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `TEXT_MESSAGE_START` |
| `messageId` | string | Unique message ID | `msg_1774357193805_00dw4ca` |
| `role` | string | Message role (assistant/user) | `assistant` |

Example:
```json
{"type":"TEXT_MESSAGE_START","messageId":"msg_1774357193805_00dw4ca","role":"assistant"}
```

### type = TEXT_MESSAGE_CONTENT
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `TEXT_MESSAGE_CONTENT` |
| `messageId` | string | Unique message ID | `msg_1774357193805_00dw4ca` |
| `delta` | string | Message content chunk | `Hello` |

Example:
```json
{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1774357193805_00dw4ca","delta":"Hello"}
```

### type = TEXT_MESSAGE_END
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `TEXT_MESSAGE_END` |
| `messageId` | string | Unique message ID | `msg_1774357193805_00dw4ca` |

Example:
```json
{"type":"TEXT_MESSAGE_END","messageId":"msg_1774357193805_00dw4ca"}
```

### type = TOOL_CALL_START
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `TOOL_CALL_START` |
| `toolCallId` | string | Unique tool call ID | `functions.mcp__scf-tools__generate_scf_code:0` |
| `toolCallName` | string | Tool function name | `generate_scf_code` |

Example:
```json
{"type":"TOOL_CALL_START","toolCallId":"functions.mcp__scf-tools__generate_scf_code:0","toolCallName":"generate_scf_code"}
```

### type = TOOL_CALL_ARGS
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `TOOL_CALL_ARGS` |
| `toolCallId` | string | Unique tool call ID | `functions.mcp__scf-tools__generate_scf_code:0` |
| `delta` | string | Tool call arguments chunk | `Prompt` |

Example:
```json
{"type":"TOOL_CALL_ARGS","toolCallId":"functions.mcp__scf-tools__generate_scf_code:0","delta":"Prompt"}
```

### type = TOOL_CALL_END
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `TOOL_CALL_END` |
| `toolCallId` | string | Unique tool call ID | `functions.mcp__scf-tools__generate_scf_code:0` |

Example:
```json
{"type":"TOOL_CALL_END","toolCallId":"functions.mcp__scf-tools__generate_scf_code:0"}
```

### type = TOOL_CALL_RESULT
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `TOOL_CALL_RESULT` |
| `toolCallId` | string | Unique tool call ID | `functions.mcp__file-operator__MultiWrite:2` |
| `content` | object | Tool execution result | Various formats (see below) |
| `rawEvent` | string | Raw event type (optional) | `interrupt` |

**Result Formats:**
1. **Interrupt Required**: When `content` contains `"__interrupt__":true`, human confirmation is needed
   - Save `content.interruptId` as interrupt ID
   - Use `content.data.toolInput` as message for human confirmation

   Example:
   ```json
   {
     "type": "TOOL_CALL_RESULT",
     "toolCallId": "functions.mcp__file-operator__MultiWrite:2",
     "content": "{\"__interrupt__\":true,\"reason\":\"Please review the tool call and confirm before proceeding\",\"type\":\"tool_confirmation_required\",\"data\":{\"toolName\":\"mcp__file-operator__MultiWrite\",\"toolInput\":{\"tool input parameters\"}},\"interruptId\":\"interrupt_1774594761343_n154yxe\"}",
     "rawEvent": "interrupt"
   }
   ```

2. **Direct Result**: When no interrupt is required, result is in `content`
   
   Example:
   ```json
   {
     "type": "TOOL_CALL_RESULT",
     "toolCallId": "functions.mcp__cloudbase__envQuery:0",
     "content": "{\"res\":{\"content\":[{\"type\":\"text\",\"text\":\"{}\"}]}}"
   }
   ```

### type = RUN_ERROR
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `type` | string | Message type | `RUN_ERROR` |
| `threadId` | string | Conversation thread ID | `2844e499-51a3-484a-860f-1803a2bdde54` |
| `runId` | string | Current run ID | `75f11450-909e-42e3-82fd-73d9cafdb5b7` |
| `message` | string | Error message | `Claude Code process exited with code 1` |
| `code` | string | Error code | `Error` |

Example:
```json
{"type":"RUN_ERROR","threadId":"2844e499-51a3-484a-860f-1803a2bdde54","runId":"75f11450-909e-42e3-82fd-73d9cafdb5b7","message":"Claude Code process exited with code 1","code":"Error"}
```


