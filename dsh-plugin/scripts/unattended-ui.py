#!/usr/bin/env python3
"""Operate live DSH CloudBase plugin UI without a human at the keyboard.

Opens a non-blank session (blank "新会话" zeros the details column), switches
to the backend capsule, clicks platform-kit routes, and writes screenshots.

Requires: Homebrew python3.11 + playwright, Google Chrome.
  python3.11 -m playwright install chrome

Usage:
  DSH_URL=http://127.0.0.1:3080 python3.11 scripts/unattended-ui.py
"""
from __future__ import annotations

import json
import os
import re
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

# P0 routes required for ship-gate screenshots
ROUTES = [
    ("storage", "存储"),
    ("functions", "云函数"),
    ("auth", "认证"),
    ("gateway", "网关"),
    ("settings", "设置"),
    ("database", "数据库"),
    ("overview", "概览"),
]


def details_width(page) -> float:
    return float(
        page.evaluate(
            """() => {
              const el = document.querySelector('.pI_x6G_detailsCol');
              return el ? el.getBoundingClientRect().width : 0;
            }"""
        )
    )


def nav_labels(page) -> list[str]:
    return page.evaluate(
        """() => [...document.querySelectorAll('button.cb-kit-nav-item')]
            .map((b) => (b.innerText || '').replace(/\\s+/g, ' ').trim())
            .filter(Boolean)"""
    )


def click_backend_capsule(page) -> None:
    page.evaluate(
        """() => {
          const btn = [...document.querySelectorAll('button.cb-capsule-btn')]
            .find((el) => (el.innerText || '').includes('后端') || (el.title || '').includes('后端'));
          btn?.click();
        }"""
    )


def open_details_panel(page) -> None:
    if details_width(page) > 280 and nav_labels(page):
        click_backend_capsule(page)
        return

    # Prefer a known non-blank session (blog deploy) over "新会话".
    candidates = [
        page.get_by_text(re.compile(r"开发博客应用")),
        page.get_by_text(re.compile(r"\d+\s*小时")),
        page.locator('[class*="session"]').filter(has_text=re.compile(r"小时|天")),
    ]
    clicked = False
    for loc in candidates:
        try:
            if loc.count() == 0:
                continue
            loc.first.click(timeout=8000)
            clicked = True
            break
        except Exception:
            continue
    if not clicked:
        raise RuntimeError("no non-blank session found to open details panel")

    page.wait_for_timeout(2500)
    page.wait_for_function(
        """() => {
          const el = document.querySelector('.pI_x6G_detailsCol');
          return el && el.getBoundingClientRect().width > 280;
        }""",
        timeout=60000,
    )
    click_backend_capsule(page)
    page.wait_for_selector("button.cb-kit-nav-item", timeout=20000)
    page.wait_for_timeout(800)


def click_nav(page, label: str) -> str:
    # Match label inside nav item (icon + text). Prefer exact span text.
    handle = page.evaluate(
        """(label) => {
          const buttons = [...document.querySelectorAll('button.cb-kit-nav-item')];
          const btn = buttons.find((el) => {
            const t = (el.innerText || '').replace(/\\s+/g, ' ');
            const span = el.querySelector('span');
            const st = span ? (span.textContent || '').trim() : '';
            return st === label || t.includes(label);
          });
          if (!btn) return null;
          btn.click();
          return (btn.innerText || '').replace(/\\s+/g, ' ').trim();
        }""",
        label,
    )
    if not handle:
        raise RuntimeError(f"nav not found: {label}; have={nav_labels(page)}")
    return handle


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"url": URL, "routes": [], "ok": False}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 1050})
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2500)

        try:
            open_details_panel(page)
        except Exception as exc:
            report["error"] = f"open_details: {exc}"
            page.screenshot(path=str(OUT / "fail-open.png"), full_page=True)
            (OUT / "unattended-report.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            browser.close()
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 1

        w = details_width(page)
        labels = nav_labels(page)
        report["detailsWidth"] = w
        report["navLabels"] = labels
        page.screenshot(path=str(OUT / "live-overview.png"))
        print("nav", labels, "width", w)

        if w < 280:
            report["error"] = "details column still collapsed"
            (OUT / "unattended-report.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            browser.close()
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 1

        for key, label in ROUTES:
            try:
                clicked = click_nav(page, label)
            except Exception as exc:
                report["error"] = str(exc)
                page.screenshot(path=str(OUT / f"fail-{key}.png"))
                (OUT / "unattended-report.json").write_text(
                    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                browser.close()
                print(json.dumps(report, ensure_ascii=False, indent=2))
                return 1
            page.wait_for_timeout(1800)
            shot = OUT / f"live-{key}.png"
            page.screenshot(path=str(shot))
            body = ""
            page_el = page.locator(".cb-kit-page")
            if page_el.count():
                body = page_el.first.inner_text()[:800]
            # For auth: try open first table row drawer if present
            if key == "auth":
                page.evaluate(
                    """() => {
                      const row = document.querySelector('.cb-kit-table-row, button.cb-kit-table-row');
                      row?.click();
                    }"""
                )
                page.wait_for_timeout(800)
                page.screenshot(path=str(OUT / "live-auth-drawer.png"))
            report["routes"].append(
                {"id": key, "label": clicked, "shot": str(shot), "text": body}
            )
            print(f"PASS route {key}: {body.splitlines()[0] if body else '(empty)'}")

        report["ok"] = True
        browser.close()
    (OUT / "unattended-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"ok": True, "detailsWidth": report["detailsWidth"], "n": len(report["routes"])}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
