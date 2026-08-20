/** @vitest-environment jsdom */
import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DatabasePage } from "../src/components/database/DatabasePage.js";
import { SqlEditorPanel } from "../src/components/database/SqlEditorPanel.js";
import { GatewayPage } from "../src/components/gateway/GatewayPage.js";
import { LogsPage } from "../src/components/LogsPage.js";
import { ManagerShell } from "../src/components/ManagerShell.js";
import { KitProvider } from "../src/hooks/use-menu.js";
import { createMockPlatformProvider } from "../src/examples/custom-provider.example.js";

afterEach(() => {
  cleanup();
});

describe("component render", () => {
  it("ManagerShell renders all 10 menu items", () => {
    const provider = createMockPlatformProvider();
    render(<ManagerShell locale="zh" provider={provider} />);
    const labels = [
      "概览",
      "数据库",
      "存储",
      "云函数",
      "云托管",
      "静态托管",
      "认证",
      "网关",
      "日志",
      "设置",
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(document.querySelectorAll(".cb-kit-nav-item")).toHaveLength(10);
    expect(screen.getByText("中")).toBeTruthy();
    expect(screen.getByText("EN")).toBeTruthy();
  });

  it("locale switcher flips menu labels zh↔en", async () => {
    const provider = createMockPlatformProvider();
    render(<ManagerShell locale="zh" provider={provider} />);
    expect(screen.getByText("概览")).toBeTruthy();
    screen.getByText("EN").click();
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeTruthy();
    });
    screen.getByText("中").click();
    await waitFor(() => {
      expect(screen.getByText("概览")).toBeTruthy();
    });
  });

  it("DatabasePage shows SQL editor tab in postgres env", () => {
    const provider = createMockPlatformProvider();
    render(
      <KitProvider locale="zh" provider={provider} featureCtx={{ isPostgresEnv: true }}>
        <DatabasePage provider={provider} />
      </KitProvider>,
    );
    expect(screen.getByText("数据库")).toBeTruthy();
    expect(screen.getByText("SQL")).toBeTruthy();
    expect(screen.getByText("表")).toBeTruthy();
  });

  it("SqlEditorPanel renders editor chrome on empty result state", () => {
    const provider = createMockPlatformProvider();
    render(
      <SqlEditorPanel
        provider={provider}
        runLabel="运行"
        hintLabel="hint"
        confirmWriteLabel="confirm"
      />,
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByText("运行")).toBeTruthy();
  });

  it("GatewayPage shows title and empty state after load", async () => {
    const provider = createMockPlatformProvider();
    render(
      <KitProvider locale="zh" provider={provider}>
        <GatewayPage provider={provider} />
      </KitProvider>,
    );
    expect(screen.getByText("网关路由")).toBeTruthy();
    expect(screen.getByText("添加路由")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("暂无数据")).toBeTruthy();
    });
  });

  it("LogsPage shows explorer chrome and empty state after load", async () => {
    const provider = createMockPlatformProvider();
    render(
      <KitProvider locale="zh" provider={provider}>
        <LogsPage provider={provider} />
      </KitProvider>,
    );
    expect(screen.getByText("日志查询")).toBeTruthy();
    expect(screen.getByText("查询")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("暂无日志")).toBeTruthy();
    });
  });
});
