---
name: http-cloud-function
description: Use when developing HTTP-triggered cloud functions that support Node.js, Python, Go, Java, or any framework. Recommend for websocket SSE use cases.
---

# HTTP Cloud Functions Development

Use this skill when developing, deploying, and managing CloudBase HTTP cloud functions (multi-language HTTP-triggered serverless functions).

## When to use this skill

Use this skill for **HTTP cloud function operations** when you need to:

- Create and deploy HTTP-triggered cloud functions (not event-triggered)
- Develop multi-language backend services (Node.js, Python, Go, Java)
- Use any web framework (Express, Flask, Gin, Spring Boot, etc.)
- Build REST API services with direct HTTP access
- Deploy framework-agnostic web applications

**Do NOT use for:**
- Event-triggered functions with `exports.main` handler format
- Database operations

## How to use this skill (for a coding agent)

1. **Understand the two critical requirements**
   - Application **MUST listen on port 9000** (or read from `PORT` env var, defaults to 9000)
   - **MUST create `scf_bootstrap`** startup script (no extension, with execute permissions)
   - No specific file structure or naming requirements

2. **Choose the right runtime**
   - Select appropriate runtime for your language (Node.js, Python, Go, Java)
   - Runtime **CANNOT be changed** after function creation
   - Must delete and recreate if runtime needs to change

3. **Deploy functions correctly**
   - Use `createFunction` with `type: 'HTTP'`
   - Provide correct `functionRootPath` (parent directory of function folder)
   - For compiled languages, ensure binaries are compiled for Linux

4. **CRITICAL: Configure HTTP Access after deployment**
   - HTTP functions **CANNOT be accessed** via HTTP until HTTP Access is configured
   - Use `createFunctionHTTPAccess` tool immediately after deployment
   - This creates the HTTP endpoint URL for your function
   - Without this step, the function exists but is not accessible via HTTP

5. **Test and monitor**
   - Test locally before deployment
   - Use `getFunctionLogs` to view execution logs
   - Check function status via `getFunctionList`

---

## Core Knowledge

### Key Differences from Regular Cloud Functions

**HTTP Cloud Functions:**
- Support multiple languages (Node.js, Python, Go, Java, Functions Framework)
- No framework restrictions (use Express, Flask, Gin, Spring Boot, etc.)
- Must listen on port 9000
- Require `scf_bootstrap` startup script
- Direct HTTP access via URL (no SDK invocation needed)
- Entry point: Port listener (not `exports.main`)

**Regular Cloud Functions:**
- Node.js only
- Must export `exports.main = async (event, context) => {}`
- Invoked via SDK or HTTP API
- Entry point: `index.js` with handler function

### Critical Requirements

**⚠️ TWO CORE REQUIREMENTS (No Exceptions):**

1. **Port Configuration**: Application must listen on port 9000
   - Read from `PORT` environment variable if available
   - Default to 9000 if `PORT` is not set
   - Example: `const port = process.env.PORT || '9000'`

2. **Startup Script**: Must create `scf_bootstrap` file
   - **File name**: `scf_bootstrap` (no extension, no `.sh`, no `.bash`)
   - **Location**: Same directory as your application code
   - **Permissions**: Must have execute permissions (`chmod +x scf_bootstrap`)
   - **Content**: Command to start your application

**No File Structure Requirements:**
- No specific file names required (not limited to `index.js`, `main.py`, etc.)
- No specific directory structure
- Use any file organization that works for your project
- Only requirement is the startup script and port listener

### Supported Languages and Runtimes

**Node.js:**
- Runtimes: `Nodejs20.19`, `Nodejs18.15` (recommended), `Nodejs16.13`, `Nodejs14.18`, `Nodejs12.16`, `Nodejs10.15`, `Nodejs8.9`
- Frameworks: Express, Koa, Fastify, native `http` module, etc.
- No compilation needed

**Python:**
- Runtimes: `Python3.9`, `Python3.8`, `Python3.7`, `Python3.6`, `Python2.7`
- Frameworks: Flask, Django, FastAPI, native `http.server`, etc.
- No compilation needed

**Go:**
- Runtimes: `Go1.x`
- Frameworks: Gin, Echo, native `net/http`, etc.
- **Must compile to Linux binary**: `GOOS=linux GOARCH=amd64 go build -o main main.go`
- Binary must be included in deployment package

**Java:**
- Runtimes: `Java8`, `Java11`
- Frameworks: Spring Boot, native servlet, etc.
- **Must compile to JAR**: Include compiled JAR in deployment package

**Functions Framework:**
- Use CloudBase Functions Framework for standardized HTTP function development
- Supports multiple languages via framework abstraction

### Function Deployment

**Creating HTTP Cloud Functions:**

Use `createFunction` MCP tool with these critical parameters:

```javascript
createFunction({
  func: {
    name: "my-http-function",
    type: "HTTP",  // ⚠️ CRITICAL: Must set type to 'HTTP'
    runtime: "Nodejs18.15",  // Or Python3.9, Go1.x, Java8, etc.
    timeout: 60,  // Optional: timeout in seconds
    envVariables: {  // Optional: environment variables
      "API_KEY": "secret-key",
      "DATABASE_URL": "mysql://..."
    }
  },
  functionRootPath: "/absolute/path/to/parent/directory",  // Parent of function folder
  force: true  // Overwrite if function exists
})
```

**Key Parameters:**
- `func.type`: **MUST be `'HTTP'`** (default is `'Event'` for regular functions)
- `func.runtime`: Select appropriate runtime for your language
- `functionRootPath`: Parent directory containing your function folder (absolute path)
- **Important**: Do NOT include function name in `functionRootPath`

**Updating Function Code:**

Use `updateFunctionCode` tool:
- Only updates code, **cannot change runtime or type**
- If runtime needs to change, delete and recreate function
- Same `functionRootPath` requirement applies

### HTTP Access Configuration

**⚠️ CRITICAL: HTTP functions are NOT accessible via HTTP until you configure HTTP Access**

After deploying an HTTP cloud function with `createFunction`, you **MUST** configure HTTP Access to make it accessible via HTTP URL. Without this step, the function exists but cannot be accessed.

**Configuring HTTP Access:**

Use `createFunctionHTTPAccess` MCP tool:

```javascript
createFunctionHTTPAccess({
  functionName: "my-http-function",
  path: "/api/mypath",  // Optional: custom path, defaults to function name
  enableCORS: true,  // Optional: enable CORS
  authRequired: false  // Optional: set to true for authenticated access
})
```

**Alternative Method (Plan B):** If `createFunctionHTTPAccess` unavailable, use `callCloudApi`:

```javascript
callCloudApi({
  service: "tcb",
  action: "CreateCloudBaseGWAPI",
  params: {
    EnableUnion: true,
    Path: "/api/mypath",
    ServiceId: "{envId}",
    Type: 6,  // Cloud Function type
    Name: "my-http-function",
    AuthSwitch: 2,  // 2 = no auth, 1 = with auth
    PathTransmission: 2,
    EnableRegion: true,
    Domain: "*"  // Use "*" for default domain
  }
})
```

**Access URL Format:**
- Default: `https://{envId}.{region}.app.tcloudbase.com/{path}`
- Custom domain: `https://{domain}/{path}`

**Important Notes:**
- Configure HTTP Access immediately after function deployment
- Without HTTP Access, function cannot respond to HTTP requests
- Use `createFunctionHTTPAccess` as primary method
- URL is returned after successful configuration

### Startup Script (`scf_bootstrap`)

The `scf_bootstrap` file is executed by CloudBase to start your HTTP function. It must:

1. **Be named exactly `scf_bootstrap`** (no extension)
2. **Have execute permissions** (`chmod +x scf_bootstrap`)
3. **Contain the command to start your application**

**Examples by Language:**

**Node.js:**
```bash
#!/bin/bash
node index.js
```

**Python:**
```bash
#!/bin/bash
python main.py
```

**Go:**
```bash
#!/bin/bash
./main
```

**Java:**
```bash
#!/bin/bash
java -jar app.jar
```

**With Environment Variables:**
```bash
#!/bin/bash
PORT=9000 node server.js
```

**Note**: The script should start your application, which will listen on port 9000.

### Port Configuration

Your application must listen on port 9000. Best practice is to read from environment variable:

**Node.js:**
```javascript
const port = process.env.PORT || '9000';
server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
```

**Python:**
```python
import os
port = int(os.getenv('PORT', '9000'))
server.listen(port)
```

**Go:**
```go
port := os.Getenv("PORT")
if port == "" {
    port = "9000"
}
http.ListenAndServe(":"+port, nil)
```

## Language-Specific Examples

### Node.js Example

**Application Code (`server.js`):**
```javascript
import { createServer } from "node:http";

const server = createServer(async (req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Hello World!");
  } else if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy" }));
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

const port = process.env.PORT || '9000';
const host = '0.0.0.0';
server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}/`);
});
```

**Startup Script (`scf_bootstrap`):**
```bash
#!/bin/bash
node server.js
```

**Deployment:**
```javascript
// Step 1: Create the HTTP function
createFunction({
  func: {
    name: "nodejs-http-function",
    type: "HTTP",
    runtime: "Nodejs18.15"
  },
  functionRootPath: "/path/to/project",
  force: true
})

// Step 2: Configure HTTP Access (REQUIRED)
createFunctionHTTPAccess({
  functionName: "nodejs-http-function",
  path: "/api/hello",
  enableCORS: true
})
```

### Python Example

**Application Code (`app.py`):**
```python
from http.server import HTTPServer, BaseHTTPRequestHandler
import os
import json

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Hello World!')
        elif self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'healthy'}).encode())
        else:
            self.send_response(404)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Not Found'}).encode())

port = int(os.getenv('PORT', '9000'))
server = HTTPServer(('0.0.0.0', port), Handler)
print(f'Server running on port {port}')
server.serve_forever()
```

**Startup Script (`scf_bootstrap`):**
```bash
#!/bin/bash
python app.py
```

**Deployment:**
```javascript
// Step 1: Create the HTTP function
createFunction({
  func: {
    name: "python-http-function",
    type: "HTTP",
    runtime: "Python3.9"
  },
  functionRootPath: "/path/to/project",
  force: true
})

// Step 2: Configure HTTP Access (REQUIRED)
createFunctionHTTPAccess({
  functionName: "python-http-function",
  path: "/api/hello"
})
```

### Go Example

**Application Code (`main.go`):**
```go
package main

import (
    "encoding/json"
    "net/http"
    "os"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "text/plain")
        w.Write([]byte("Hello World!"))
    })

    http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
    })

    port := os.Getenv("PORT")
    if port == "" {
        port = "9000"
    }

    http.ListenAndServe(":"+port, nil)
}
```

**Compilation:**
```bash
GOOS=linux GOARCH=amd64 go build -o main main.go
```

**Startup Script (`scf_bootstrap`):**
```bash
#!/bin/bash
./main
```

**Deployment:**
```javascript
// Step 1: Create the HTTP function
createFunction({
  func: {
    name: "go-http-function",
    type: "HTTP",
    runtime: "Go1.x"
  },
  functionRootPath: "/path/to/project",
  force: true
})

// Step 2: Configure HTTP Access (REQUIRED)
createFunctionHTTPAccess({
  functionName: "go-http-function",
  path: "/api/hello"
})
```

**Important**: The compiled `main` binary must be included in the deployment package.

## MCP Tools Reference

**Function Management:**
- `createFunction` - Create new HTTP cloud function (must set `type: 'HTTP'`)
- `updateFunctionCode` - Update function code (runtime and type cannot change)
- `updateFunctionConfig` - Update function configuration (timeout, env variables, etc.)
- `getFunctionList` - List functions or get function details

**HTTP Access Configuration (CRITICAL):**
- `createFunctionHTTPAccess` - Configure HTTP access for function (REQUIRED for HTTP access)
- Without HTTP access configuration, function cannot be accessed via HTTP URL

**Logging:**
- `getFunctionLogs` - Get function log list (basic info)
- `getFunctionLogDetail` - Get detailed log content by RequestId

**Invocation:**
- HTTP cloud functions are accessed directly via HTTP URL after configuring HTTP access
- Can also use `invokeFunction` tool for testing

## Common Patterns

### Port Configuration

Always read from `PORT` environment variable with 9000 as fallback:
```javascript
const port = process.env.PORT || '9000';
```

### CORS Configuration

Enable CORS in HTTP Access configuration or via response headers:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
```

### Environment Variables

Set via `createFunction`:
```javascript
func: {
  envVariables: {
    "API_KEY": "secret-key"
  }
}
```

## Best Practices

1. **⚠️ Configure HTTP Access**: Always run `createFunctionHTTPAccess` immediately after deployment
2. **Port Configuration**: Always read from `PORT` env var with 9000 as default
3. **Startup Script**: Ensure `scf_bootstrap` has execute permissions (`chmod +x`)
4. **Test Locally**: Test your application locally on port 9000 before deployment
5. **Environment Variables**: Use env vars for configuration, never hardcode secrets
6. **Compiled Languages**: For Go/Java, ensure binaries are compiled for Linux (amd64)
7. **Runtime Selection**: Choose appropriate runtime version for your language
8. **Logging**: Use console.log/print statements for debugging (visible in function logs)

## Troubleshooting

### Cannot Access Function via HTTP

**⚠️ MOST COMMON ISSUE:**
- **Problem**: Function deployed but not accessible via HTTP URL
- **Solution**: Configure HTTP Access using `createFunctionHTTPAccess` tool
- **Why**: HTTP functions require explicit HTTP Access configuration
- **When**: Always run immediately after `createFunction` succeeds

### Function Not Starting

- **Check port**: Ensure application listens on port 9000
- **Check startup script**: Verify `scf_bootstrap` exists and has execute permissions
- **Check logs**: Use `getFunctionLogs` to see startup errors

### Startup Script Not Found

- Ensure `scf_bootstrap` is in the same directory as your application code
- Verify file name is exactly `scf_bootstrap` (no extension)
- Check file permissions: `chmod +x scf_bootstrap`

### Compiled Binary Issues (Go/Java)

- **Go**: Must compile with `GOOS=linux GOARCH=amd64`
- **Java**: Ensure JAR is compatible with selected Java runtime version
- Include compiled binary/JAR in deployment package

### Runtime Mismatch

- Runtime **cannot be changed** after function creation
- Must delete and recreate function with correct runtime
- Verify runtime version matches your code requirements
