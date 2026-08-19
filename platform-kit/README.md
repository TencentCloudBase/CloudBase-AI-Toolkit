# @cloudbase/platform-kit

Headless CloudBase platform console kit — provider-driven UI for environment overview, access endpoints, deployment timeline, resource managers, and URL preview.

## Features (P0)

- **PlatformProvider** — swap CloudBase, CAPI, or mock backends
- **Headless hooks** — `useAccessEndpoints`, `useDeployments`, `useMenu`, `useFeatureAvailable`
- **i18n** — `t()` zh/en via `KitProvider`
- **ManagerShell** — full-width sidebar console (10 menu items)
- **UrlPreview** — combobox over live `manageApps` URLs + manual input + deploy auto-activate
- **Overview** — env info, access endpoints, Vercel-style deployment timeline
- **Environment-aware menu** — PG vs traditional via `EFeatureId`

## Quick start

```tsx
import {
  KitProvider,
  ManagerShell,
  UrlPreview,
  useAccessEndpoints,
} from "@cloudbase/platform-kit";

function App({ provider }) {
  return (
    <KitProvider locale="zh" provider={provider}>
      <ManagerShell
        provider={provider}
        renderRoute={(route) => (route === "database" ? <MyDatabasePage /> : null)}
      />
    </KitProvider>
  );
}
```

## Custom provider

Implement `PlatformProvider` (`listAccessEndpoints`, `listDeployments`, `envInfo`, …). See `dsh-plugin/src/server/data-service.ts` for the CloudBase reference.

## Build

```bash
npm run build
npm test
npm run typecheck
```

## License

MIT
