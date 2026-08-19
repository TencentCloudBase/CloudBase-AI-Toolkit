# @cloudbase/platform-kit

Headless CloudBase 平台控制台 kit — 通过 PlatformProvider 驱动 UI，支持环境概览、访问入口、部署时间轴、资源管理与 URL 预览。

## 能力（P0）

- **PlatformProvider** — 可插拔 CloudBase / CAPI / mock
- **Headless hooks** — `useAccessEndpoints`、`useDeployments`、`useMenu`、`useFeatureAvailable`
- **i18n** — `t()` 中英文，`KitProvider` 注入 locale
- **ManagerShell** — 全宽侧边栏控制台（10 项菜单）
- **UrlPreview** — 基于 `manageApps` 实时 URL 下拉 + 手动输入 + 部署自动激活
- **概览页** — 环境信息、访问入口、Vercel 式部署时间轴
- **环境感知菜单** — PG / 传统环境 via `EFeatureId`

## 快速开始

```tsx
import { KitProvider, ManagerShell } from "@cloudbase/platform-kit";

function App({ provider }) {
  return (
    <KitProvider locale="zh" provider={provider}>
      <ManagerShell provider={provider} />
    </KitProvider>
  );
}
```

## 自定义 Provider

实现 `PlatformProvider` 接口即可复用全部组件。CloudBase 参考实现见 `dsh-plugin/src/server/data-service.ts`。

## 构建

```bash
npm run build && npm test && npm run typecheck
```

## License

MIT
