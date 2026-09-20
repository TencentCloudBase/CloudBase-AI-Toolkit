# Framework Guidance

## React

- Follow the existing router, data-fetching, and component patterns already used by the repo.
- Prefer focused page and component changes over broad refactors.
- Keep state close to where it is used unless the project already relies on shared state primitives.
- For form, navigation, and async UI bugs, verify the behavior in browser after code changes.

## Next.js

### SDK boundary

`@cloudbase/js-sdk` is a **browser-only** SDK. It must not be imported in Server Components, `getServerSideProps`, or API Routes.

- Auth flows (sign in, sign up, session check) → **Client Component only** (`"use client"`)
- API Routes / Route Handlers → use `@cloudbase/node-sdk` (Node.js SDK) for server-side token verification
- Server Components → read tokens from cookies/headers, do NOT import `@cloudbase/js-sdk`

### Auth pattern (App Router)

```tsx
// components/auth-guard.tsx — Client Component
"use client"

import { useEffect, useState } from "react"
import cloudbase from "@cloudbase/js-sdk"

const app = cloudbase.init({
  env: process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID!,
  region: process.env.NEXT_PUBLIC_CLOUDBASE_REGION || "ap-shanghai",
  accessKey: process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY!,
  auth: { detectSessionInUrl: true },
})
const auth = app.auth

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session)
        // Store access_token in cookie for API route verification
        document.cookie = `cloudbase_token=${data.session.access_token}; path=/; max-age=3600`
      }
      setLoading(false)
    })
  }, [])

  if (loading) return <div>Loading...</div>
  if (!session) return <div>Please sign in</div>
  return <>{children}</>
}
```

### Passing auth to API Routes

```tsx
// app/api/protected/route.ts — Server-side Route Handler
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const token = request.cookies.get("cloudbase_token")?.value
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Verify token with Node SDK or forward to your backend
  return NextResponse.json({ data: "protected resource" })
}
```

### Deployment

- Build output: `next build` → `.next` directory
- CloudBase static hosting expects `package.json` with build scripts and the output directory configured; prefer `manageApps` for deployment
- If deploying via `manageHosting`, set error document to `index.html` for client-side routing (even though Next.js defaults to file-based routing, fallback handling is needed for SPA-like paths)

## Vue

- Respect the existing composition style in the repo, such as Composition API or Options API.
- Keep template, script, and style responsibilities clear instead of mixing unrelated logic into one large SFC.
- When changing reactive state or watchers, verify the actual rendered behavior rather than assuming the code path is enough.

## NestJS

### SDK choice

Use `@cloudbase/node-sdk` (Node.js SDK), **not** `@cloudbase/js-sdk` (which is browser-only).

### Module setup

```ts
// cloudbase.module.ts
import { Module, Global } from "@nestjs/common"
import tcb from "@cloudbase/node-sdk"

export const CLOUDBASE = "CLOUDBASE"

const cloudbaseProvider = {
  provide: CLOUDBASE,
  useFactory: () => {
    const app = tcb.init({
      env: process.env.CLOUDBASE_ENV_ID!,
      // credentials: require("/path/to/tcb_custom_login.json"), // only for custom login
    })
    return {
      app,
      auth: app.auth(),
      // db: app.database(), // for NoSQL
    }
  },
}

@Global()
@Module({
  providers: [cloudbaseProvider],
  exports: [cloudbaseProvider],
})
export class CloudBaseModule {}
```

### AuthGuard for token verification

```ts
// auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, Inject } from "@nestjs/common"
import { CLOUDBASE } from "./cloudbase.module"

@Injectable()
export class CloudBaseAuthGuard implements CanActivate {
  constructor(@Inject(CLOUDBASE) private cloudbase: any) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = request.headers.authorization?.replace("Bearer ", "")
    if (!token) return false

    try {
      // Verify the session via Node SDK
      // Note: Node SDK does not have a direct "verify token" method —
      // forward the token to a cloud function or use the HTTP API for validation
      request.user = { token }
      return true
    } catch {
      return false
    }
  }
}
```

### CORS (required for Web frontend calls)

```ts
// main.ts
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
  await app.listen(9000) // CloudBase HTTP Functions expect port 9000
}
bootstrap()
```

### Deployment

- Build to JavaScript output, include `package.json` with `start` script
- Deploy via `manageCloudRun` (container) or `manageFunctions` (HTTP Function, default to native `http` module unless NestJS is explicitly required)
- Set `MinNum` instances to 1 to reduce cold start

## Vite

- Treat Vite as the default choice for new Web app setup unless the repo already standardizes on another bundler.
- Keep environment-specific values in `.env` or the project's existing config pattern instead of hardcoding them into UI files.
- Check route base paths, asset paths, and build output behavior before deployment.

## Routing and build defaults

- Use the existing router if present; do not switch routing libraries without an explicit requirement.
- For purely static hosting environments, prefer hash routing when server rewrite support is absent or unknown.
- Make build and preview commands explicit before handing off deployment steps.
