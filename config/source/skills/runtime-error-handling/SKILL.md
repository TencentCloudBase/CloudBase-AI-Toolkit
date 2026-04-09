---
name: runtime-error-handling
description: Runtime error handling SOP for CloudBase Web pages and WeChat Mini Programs. Use this skill when the task involves implementing error boundaries, retry logic, graceful degradation, or user-facing error feedback for CloudBase-powered apps at runtime. Covers auth failures, database permission errors, cloud function timeouts, storage errors, and AI model errors across Web and Mini Program platforms.
version: 2.16.1
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/runtime-error-handling/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

# Runtime Error Handling for CloudBase Pages & Mini Programs

## Activation Contract

### Use this first when

- The task involves implementing runtime error handling, error boundaries, retry logic, or graceful degradation for CloudBase Web pages or Mini Program pages.
- The user asks about handling CloudBase API failures (auth, database, storage, cloud functions, AI) in their page or component.
- The request mentions runtime errors, error SOP, error recovery, or user-facing error feedback in a CloudBase context.

### Read before writing code if

- The project already uses CloudBase SDK and needs production-grade error handling added to existing page handlers.
- The task mixes multiple CloudBase capabilities (auth + database + storage) and needs a unified error-handling layer.

### Then also read

- Web page structure -> `../web-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`)
- Mini Program page structure -> `../miniprogram-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/miniprogram-development/SKILL.md`)
- Auth error details -> `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`) or `../auth-wechat/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-wechat/SKILL.md`)
- Database permission errors -> `../no-sql-web-sdk/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/no-sql-web-sdk/SKILL.md`)

### Do NOT use for

- Server-side error handling in cloud functions (use `cloud-functions` skill).
- MCP tool invocation errors (those are development-time, not runtime).
- Infrastructure monitoring or alerting setup.

### Common mistakes / gotchas

- Showing raw SDK error messages to users instead of human-readable feedback.
- Swallowing errors silently with empty catch blocks, making debugging impossible.
- Treating all errors the same — auth errors need re-login, while network errors need retry.
- Adding retry logic for non-retryable errors (e.g., permission denied, invalid params).
- Implementing error handling only in top-level components while leaving leaf components unprotected.

## When to use this skill

Use this skill for **runtime error handling** in CloudBase-powered Web pages and Mini Program pages when you need to:

- Design a consistent error-handling SOP across pages
- Implement error boundaries (React) or global error handlers (Mini Program)
- Add retry logic for transient failures (network, timeout, rate limit)
- Show user-friendly error messages and recovery actions
- Handle specific CloudBase error codes appropriately

**Do NOT use for:**
- Cloud function internal error handling (use `cloud-functions`)
- Server-side logging or monitoring (use `cloudbase-platform`)
- Development-time MCP tool errors

---

## How to use this skill (for a coding agent)

1. **Identify the error category first**
   - Classify the error by CloudBase domain (auth, database, storage, functions, AI)
   - Determine if the error is retryable or terminal
   - Choose the correct recovery strategy per category

2. **Apply platform-specific patterns**
   - Web pages: React Error Boundaries, toast/notification components, retry hooks
   - Mini Programs: `wx.showToast` / `wx.showModal`, page-level `onError`, global `App.onError`

3. **Keep user feedback actionable**
   - Show what went wrong in plain language
   - Provide a clear next step (retry, re-login, refresh, contact support)
   - Never expose internal error codes or SDK stack traces to end users

4. **Log for debugging, display for users**
   - Always `console.error` or log the full error for developer debugging
   - Show a simplified, actionable message to the user

---

# CloudBase Runtime Error Categories

## Error Classification Matrix

| Error Domain | Common Error Codes | Retryable? | Recovery Strategy |
|---|---|---|---|
| **Auth** | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `PERMISSION_DENIED`, auth provider errors | Partial | Re-login for token errors; check provider for config errors |
| **Database (NoSQL)** | `PERMISSION_DENIED`, `INVALID_PARAM`, `DOCUMENT_NOT_FOUND`, `COLLECTION_NOT_EXISTS` | No | Fix query/permissions; show "not found" for missing docs |
| **Database (MySQL HTTP)** | `INVALID_PARAM` (400), `PERMISSION_DENIED` (401/403), `RESOURCE_NOT_FOUND` (404), `SYS_ERR` (500), `OPERATION_FAILED` (503) | 500/503 only | Retry on 500/503; fix params for 400; check auth for 401/403 |
| **Cloud Functions** | Timeout, `FUNCTION_NOT_FOUND`, function runtime errors | Timeout only | Retry on timeout; fix invocation for other errors |
| **Storage** | Upload CORS failure, file too large, `PERMISSION_DENIED` | CORS/config no | Fix security domains; validate file before upload |
| **AI Model** | Model timeout, rate limit, `INVALID_PARAM`, streaming disconnect | Timeout/rate limit | Retry with backoff; fix prompt for param errors |
| **Network** | `ERR_NETWORK`, `ECONNABORTED`, `ETIMEDOUT` | Yes | Retry with exponential backoff |

## Decision Flow

```
Error caught
  ├── Is it a network/timeout error?
  │   └── YES → Retry with backoff (max 3 attempts)
  ├── Is it an auth/token error?
  │   └── YES → Attempt token refresh → If fail, redirect to login
  ├── Is it a permission error?
  │   └── YES → Show "No permission" → Guide to check settings
  ├── Is it a "not found" error?
  │   └── YES → Show empty state or "not found" UI
  └── Is it a server error (5xx)?
      └── YES → Retry once → If still fails, show error with retry button
```

---

# Platform-Specific Implementation

## Web (React / Vue)

### React Error Boundary

Wrap CloudBase-dependent page sections with an error boundary that catches runtime errors and displays a recovery UI:

```tsx
import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class CloudBaseErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CloudBaseErrorBoundary]', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p>Something went wrong. Please try again.</p>
          <button onClick={this.handleRetry}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Usage: Wrap pages or sections
<CloudBaseErrorBoundary>
  <DashboardPage />
</CloudBaseErrorBoundary>
```

### Unified Error Handler Hook

```tsx
import { useCallback } from 'react';

interface ErrorAction {
  message: string;
  label: string;
  onClick: () => void;
}

function useCloudBaseErrorHandler() {
  const handleError = useCallback((error: any, context?: string) => {
    const code = error?.code || error?.response?.data?.code || '';
    const message = error?.message || 'Unknown error';

    console.error(`[CloudBase${context ? `:${context}` : ''}]`, error);

    // Auth errors — redirect to login
    if (['UNAUTHENTICATED', 'TOKEN_EXPIRED'].includes(code) || message.includes('token')) {
      // Attempt session refresh; if fail, redirect
      return {
        userMessage: 'Session expired. Please sign in again.',
        action: { message: 'Session expired', label: 'Sign in', onClick: () => window.location.reload() },
      };
    }

    // Permission errors
    if (code === 'PERMISSION_DENIED' || error?.status === 403) {
      return {
        userMessage: 'You do not have permission for this operation.',
        action: null,
      };
    }

    // Not found
    if (code === 'DOCUMENT_NOT_FOUND' || code === 'RESOURCE_NOT_FOUND' || error?.status === 404) {
      return {
        userMessage: 'The requested resource was not found.',
        action: null,
      };
    }

    // Server / network errors — retryable
    if (error?.status >= 500 || message.includes('network') || message.includes('timeout')) {
      return {
        userMessage: 'A temporary error occurred. Please try again.',
        action: { message: 'Temporary error', label: 'Retry', onClick: () => window.location.reload() },
      };
    }

    // Fallback
    return {
      userMessage: 'An unexpected error occurred. Please try again.',
      action: null,
    };
  }, []);

  return handleError;
}
```

### Retry with Exponential Backoff

```ts
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; retryable?: (error: any) => boolean } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, retryable } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      const shouldRetry = retryable
        ? retryable(error)
        : isRetryableError(error);

      if (isLastAttempt || !shouldRetry) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

function isRetryableError(error: any): boolean {
  const code = error?.code || '';
  const status = error?.status || 0;
  const message = (error?.message || '').toLowerCase();

  // Network / timeout errors
  if (message.includes('network') || message.includes('timeout') || message.includes('econnaborted')) {
    return true;
  }

  // Server errors (5xx)
  if (status >= 500 && status < 600) {
    return true;
  }

  // Rate limiting
  if (status === 429) {
    return true;
  }

  // Auth token errors are NOT retryable without re-login
  // Permission errors are NOT retryable
  return false;
}
```

---

## Mini Program (WeChat)

### Global Error Handler

In `app.js`, set up a global error handler that catches unhandled errors:

```js
App({
  onLaunch() {
    wx.cloud.init({ env: 'your-env-id', traceUser: true });
  },

  onError(error) {
    console.error('[App.onError]', error);
    // Log to remote monitoring if available
  },

  // Shared error handler for page-level use
  handleCloudBaseError(error, context) {
    const code = error?.errCode || error?.code || '';
    const message = error?.errMsg || error?.message || 'Unknown error';

    console.error(`[CloudBase${context ? `:${context}` : ''}]`, error);

    if (message.includes('permi') || code === 'PERMISSION_DENIED') {
      wx.showToast({ title: 'No permission', icon: 'none' });
      return;
    }

    if (message.includes('timeout') || message.includes('network')) {
      wx.showModal({
        title: 'Network Error',
        content: 'A network error occurred. Please check your connection and try again.',
        showCancel: true,
        cancelText: 'Cancel',
        confirmText: 'Retry',
        success: (res) => {
          if (res.confirm) {
            // Page should implement onRetry
            const pages = getCurrentPages();
            const page = pages[pages.length - 1];
            if (page && typeof page.onRetry === 'function') {
              page.onRetry();
            }
          }
        },
      });
      return;
    }

    // Generic error
    wx.showToast({ title: 'Something went wrong', icon: 'none' });
  }
});
```

### Page-Level Error Handling Pattern

```js
Page({
  data: {
    loading: false,
    error: null,
  },

  async onLoad() {
    await this.loadList();
  },

  async loadList() {
    this.setData({ loading: true, error: null });
    try {
      const db = wx.cloud.database();
      const result = await db.collection('todos').get();
      this.setData({ list: result.data });
    } catch (error) {
      this.setData({ error: this.toUserMessage(error) });
      const app = getApp();
      app.handleCloudBaseError(error, 'loadList');
    } finally {
      this.setData({ loading: false });
    }
  },

  toUserMessage(error) {
    const message = (error?.errMsg || error?.message || '').toLowerCase();
    if (message.includes('permi')) return 'No permission to access this data';
    if (message.includes('timeout') || message.includes('network')) return 'Network error, please retry';
    return 'Failed to load data';
  },

  onRetry() {
    this.loadList();
  },
});
```

### Cloud Function Invocation with Error Handling

```js
async function callCloudFunction(name, data, options = {}) {
  const { maxRetries = 1 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await wx.cloud.callFunction({ name, data });
      if (result.errMsg === 'cloud.callFunction:ok') {
        return result.result;
      }
      throw new Error(result.errMsg || 'Cloud function call failed');
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isRetryable = (error?.errMsg || '').includes('timeout');

      if (isLastAttempt || !isRetryable) {
        throw error;
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}
```

---

# Error Code Quick Reference

## CloudBase Common Error Codes

| Code | Domain | HTTP Status | User Message | Action |
|---|---|---|---|---|
| `UNAUTHENTICATED` | Auth | 401 | "Please sign in" | Redirect to login |
| `TOKEN_EXPIRED` | Auth | 401 | "Session expired" | Refresh token or re-login |
| `PERMISSION_DENIED` | Auth/DB | 403 | "No permission" | Check security rules or role |
| `INVALID_PARAM` | DB/Functions | 400 | "Invalid request" | Fix input data |
| `DOCUMENT_NOT_FOUND` | NoSQL DB | — | "Not found" | Show empty state |
| `COLLECTION_NOT_EXISTS` | NoSQL DB | — | "Data not available" | Check collection name |
| `RESOURCE_NOT_FOUND` | MySQL HTTP | 404 | "Not found" | Show empty state |
| `SYS_ERR` | MySQL HTTP | 500 | "Server error" | Retry |
| `OPERATION_FAILED` | MySQL HTTP | 503 | "Service unavailable" | Retry |
| `FUNCTION_NOT_FOUND` | Cloud Functions | — | "Function unavailable" | Check deployment |
| Timeout | Functions/AI | — | "Request timed out" | Retry |

## Mini Program Error Message Patterns

The `wx.cloud` SDK uses `errMsg` instead of `code`. Common patterns:

| errMsg pattern | Meaning | Action |
|---|---|---|
| `*.fail:timeout` | Request timeout | Retry |
| `*.fail:permi*` | Permission denied | Check security rules |
| `*.fail:network` | Network error | Retry |
| `cloud.callFunction:ok` but `result.result.code` has error | Function logic error | Handle based on function error code |

---

# Best Practices

1. **Classify before handling**: Always determine error category (auth, network, permission, server) before choosing a recovery strategy.

2. **Retry only retryable errors**: Network timeouts, 5xx server errors, and rate limits are retryable. Permission errors, invalid params, and "not found" are not. Retrying non-retryable errors wastes user time and may cause side effects.

3. **Exponential backoff**: Use increasing delays between retries (1s, 2s, 4s) to avoid overwhelming the server.

4. **Separate logging from display**: Always log the full error for debugging (`console.error`), but show simplified, actionable messages to users.

5. **Auth errors need re-login**: Never retry `TOKEN_EXPIRED` or `UNAUTHENTICATED` errors. Redirect to login or attempt a silent token refresh once.

6. **Provide recovery actions**: When showing an error, always offer a clear next step: "Retry", "Sign in again", or "Go back".

7. **Loading + error + empty states**: Every data-fetching page should handle three states: loading, error, and empty/success.

8. **Error boundaries in React**: Wrap CloudBase-dependent sections in error boundaries so a single component failure doesn't crash the entire page.

9. **Mini Program page `onRetry`**: Implement `onRetry` on pages that fetch data, so the global error handler can trigger a re-fetch.

10. **Don't swallow errors**: Empty `catch` blocks hide problems. At minimum, log the error and show a generic user message.
