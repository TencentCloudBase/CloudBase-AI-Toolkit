#!/usr/bin/env python3
"""Operate live DSH CloudBase plugin UI without a human at the keyboard.

DSH keeps the details column at width 0 on a blank "new session". This script
opens a non-blank session (or waits if the panel is already open), then clicks
platform-kit routes and writes screenshots.

Requires: Homebrew python3.11 + playwright, Google Chrome.
  python3.11 -m playwright  (chrome channel)

Usage:
  DSH_URL=http://127.0.0.1:3080 python3.11 scripts/unattended-ui.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = os.environ.get("DSH_URL", "http://127.0.0.1:3080/")
OUT = Path(
    os.environ.get(
        "DSH_UI_SHOTS",
        str(Path.home() / ".ato/workspace/e27cc40c-2864-454d-a369-09b4d954daab/screenshots"),
    )
)
ROUTES = [
    ("storage", "存储"),
    ("functions", "云函数"),
    ("auth", "认证"),
    ("gateway", "网关"),
    ("settings", "设置"),
    ("database", "数据库"),
]


def details_width(page) -> float:
    return page.evaluate(
        """() => {
          const el = document.querySelector('.pI_x6G_detailsCol');
          return el ? el.getBoundingClientRect().width : 0;
        }"""
    )


def open_details_panel(page) -> None:
    if details_width(page) > 280:
        return
    # Blank "新会话" zeros the details column. Click a real conversation.
    sessions = page.locator('[class*="session"]').filter(has_text="小时")
    if sessions.count() == 0:
        sessions = page.get_by_text("开发博客应用并部署到CloudBase")
    if sessions.count() > 0:
        sessions.first.click(timeout=15000)
        page.wait_for_timeout(2500)
    page.wait_for_function(
        """() => {
          const el = document.querySelector('.pI_x6G_detailsCol');
          return el && el.getBoundingClientRect().width > 280;
        }""",
        timeout=45000,
    )
    # Recent deploys may auto-switch the capsule to Preview (no kit nav).
    page.evaluate(
        """() => {
          const btn = [...document.querySelectorAll('button.cb-capsule-btn')]
            .find((el) => (el.innerText || '').includes('后端') || el.title.includes('后端'));
          btn?.click();
        }"""
    )
    page.wait_for_selector("button.cb-kit-nav-item", timeout=15000)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"url": URL, "routes": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1050})
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_selector("button.cb-kit-nav-item", timeout=45000)
        open_details_panel(page)
        page.screenshot(path=str(OUT / "live-overview.png"))
        w = details_width(page)
        report["detailsWidth"] = w
        labels_now = page.evaluate(
            """() => [...document.querySelectorAll('button.cb-kit-nav-item')].map(b => (b.innerText||'').trim())"""
        )
        report["navLabels"] = labels_now
        print("nav", labels_now, "width", w)
        if w < 280:
            report["error"] = "details column still collapsed"
            (OUT / "unattended-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
            browser.close()
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 1
        for key, label in ROUTES:
            clicked = page.evaluate(
                """(label) => {
                  const btn = [...document.querySelectorAll('button.cb-kit-nav-item')]
                    .find((el) => (el.innerText || '').includes(label));
                  if (!btn) return null;
                  btn.click();
                  return (btn.innerText || '').trim();
                }""",
                label,
            )
            if not clicked:
                report["error"] = f"nav not found: {label}"
                (OUT / "unattended-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
                browser.close()
                print(json.dumps(report, ensure_ascii=False, indent=2))
                return 1
            page.wait_for_timeout(1500)
            shot = OUT / f"live-{key}.png"
            page.screenshot(path=str(shot))
            body = ""
            page_el = page.locator(".cb-kit-page")
            if page_el.count():
                body = page_el.first.inner_text()[:500]
            report["routes"].append({"id": key, "label": label, "shot": str(shot), "text": body})
            print(f"PASS route {key}: {body.splitlines()[0] if body else '(empty)'}")
        browser.close()
    (OUT / "unattended-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"ok": True, "detailsWidth": report["detailsWidth"], "n": len(report["routes"])}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
